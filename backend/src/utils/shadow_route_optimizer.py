"""Google Routes API 多路徑陰影評分工具。

此腳本會：
1. 呼叫 `routes.googleapis.com/directions/v2:computeRoutes` 取得多條候選路徑。
2. 將每條路徑送進 PostgreSQL/PostGIS，重用 `db/route_shadow_intersection.sql` 的陰影合併邏輯。
3. 以路徑緩衝區（預設 3 公尺）與陰影多邊形的交集面積作為分數，挑出陰影覆蓋最大者。

使用前請在環境變數 `GOOGLE_ROUTES_API_KEY`（或 CLI 參數）設定 Google Routes API 金鑰。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

import requests
from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

SRC_ROOT = Path(__file__).resolve().parents[1]
if str(SRC_ROOT) not in sys.path:
    sys.path.append(str(SRC_ROOT))

# 預先載入專案根目錄的 .env，讓 CLI 啟動方式不受 shell export 影響
load_dotenv(SRC_ROOT.parent / ".env")

from db.database import get_session

DEFAULT_GOOGLE_ROUTES_API_KEY = "token"
GOOGLE_ROUTES_ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes"
GOOGLE_ROUTES_FIELD_MASK = (
    "routes.distanceMeters,routes.duration,routes.description,"
    "routes.polyline.encodedPolyline"
)
GOOGLE_TRAVEL_MODE = "WALK"


@dataclass
class RouteCandidate:
    """封裝 Google Routes 回傳後的資訊與陰影評分。"""

    route_id: str
    encoded_polyline: str
    coordinates: Sequence[Tuple[float, float]]
    distance_m: int | None
    duration: str | None
    description: str | None
    wkt: str
    shadow_area_m2: float = 0.0
    shadow_length_m: float = 0.0
    building_count: int = 0
    shadow_polygon_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "route_id": self.route_id,
            "encoded_polyline": self.encoded_polyline,
            "distance_m": self.distance_m,
            "duration": self.duration,
            "description": self.description,
            "shadow_area_m2": self.shadow_area_m2,
            "shadow_length_m": self.shadow_length_m,
            "building_count": self.building_count,
            "shadow_polygon_count": self.shadow_polygon_count,
            "wkt": self.wkt,
        }


@dataclass
class ShadowRouteParams:
    """包裝陰影計算所需的所有可調參數。"""

    origin_lat: float
    origin_lng: float
    dest_lat: float
    dest_lng: float
    max_alternatives: int = 3
    azimuth_deg: float = 132.62093746276173
    elevation_deg: float = 34.01104286714345
    building_search_radius: float = 250.0
    route_buffer_m: float = 3.0
    snap_tolerance: float = 0.05
    google_routes_api_key: str | None = None

    def resolve_api_key(self) -> str:
        key = self.google_routes_api_key or os.getenv("GOOGLE_ROUTES_API_KEY") or DEFAULT_GOOGLE_ROUTES_API_KEY
        if not key or key == "token":
            raise ValueError("請先設定 GOOGLE_ROUTES_API_KEY 或於參數傳入有效金鑰")
        return key


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="呼叫 Google Routes 並計算與陰影交集面積，挑出最優路線"
    )
    parser.add_argument("origin_lat", type=float, help="起點緯度")
    parser.add_argument("origin_lng", type=float, help="起點經度")
    parser.add_argument("dest_lat", type=float, help="終點緯度")
    parser.add_argument("dest_lng", type=float, help="終點經度")
    parser.add_argument(
        "--max-alternatives",
        type=int,
        default=3,
        help="最多保留的候選路線數量（含主路線）",
    )
    parser.add_argument(
        "--azimuth-deg",
        type=float,
        default=132.62093746276173,
        help="太陽方位角（度），決定陰影方向",
    )
    parser.add_argument(
        "--elevation-deg",
        type=float,
        default=34.01104286714345,
        help="太陽仰角（度），決定陰影長度",
    )
    parser.add_argument(
        "--building-search-radius",
        type=float,
        default=250.0,
        help="沿路徑抓取建物的距離（公尺）",
    )
    parser.add_argument(
        "--route-buffer-m",
        type=float,
        default=3.0,
        help="路徑緩衝半徑（公尺），用於計算路徑陰影面積",
    )
    parser.add_argument(
        "--snap-tolerance",
        type=float,
        default=0.05,
        help="陰影融合時的 ST_SnapToGrid 容差（公尺）",
    )
    parser.add_argument(
        "--google-routes-api-key",
        help="Google Routes API 金鑰，不指定則使用環境變數或預設常數",
    )
    parser.add_argument(
        "--output",
        help="結果輸出到指定 JSON 路徑；未指定則印出 JSON",
    )
    return parser


def decode_polyline(polyline: str) -> List[Tuple[float, float]]:
    """解碼 Google Encoded Polyline，回傳 (lat, lng) 序列。"""

    coords: List[Tuple[float, float]] = []
    index = 0
    lat = 0
    lng = 0

    while index < len(polyline):
        lat_change, index = _decode_coordinate(polyline, index)
        lng_change, index = _decode_coordinate(polyline, index)
        lat += lat_change
        lng += lng_change
        coords.append((lat / 1e5, lng / 1e5))
    return coords


def _decode_coordinate(polyline: str, index: int) -> Tuple[int, int]:
    result = 0
    shift = 0

    while True:
        if index >= len(polyline):  # 資料異常
            raise ValueError("Polyline decode overflow")
        b = ord(polyline[index]) - 63
        index += 1
        result |= (b & 0x1F) << shift
        shift += 5
        if b < 0x20:
            break

    delta = ~(result >> 1) if result & 1 else result >> 1
    return delta, index


def coords_to_wkt(coords: Sequence[Tuple[float, float]]) -> str:
    if len(coords) < 2:
        raise ValueError("路徑座標不足，無法形成 LINESTRING")
    parts = [f"{lng} {lat}" for lat, lng in coords]
    return "LINESTRING (" + ", ".join(parts) + ")"


def call_google_routes(params: ShadowRouteParams, api_key: str) -> List[RouteCandidate]:
    body = {
        "origin": {
            "location": {"latLng": {"latitude": params.origin_lat, "longitude": params.origin_lng}}
        },
        "destination": {
            "location": {"latLng": {"latitude": params.dest_lat, "longitude": params.dest_lng}}
        },
        "travelMode": GOOGLE_TRAVEL_MODE,
        "computeAlternativeRoutes": params.max_alternatives > 1,
        "units": "METRIC",
    }

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": GOOGLE_ROUTES_FIELD_MASK,
    }

    response = requests.post(
        GOOGLE_ROUTES_ENDPOINT,
        headers=headers,
        json=body,
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    routes = data.get("routes", [])
    if not routes:
        raise RuntimeError("Google Routes API 未回傳任何路線")

    candidates: List[RouteCandidate] = []
    for idx, route in enumerate(routes[: params.max_alternatives], start=1):
        encoded = route.get("polyline", {}).get("encodedPolyline")
        if not encoded:
            continue
        coords = decode_polyline(encoded)
        candidate = RouteCandidate(
            route_id=f"route_{idx}",
            encoded_polyline=encoded,
            coordinates=coords,
            distance_m=route.get("distanceMeters"),
            duration=route.get("duration"),
            description=route.get("description"),
            wkt=coords_to_wkt(coords),
        )
        candidates.append(candidate)

    if not candidates:
        raise RuntimeError("路徑缺少 polyline，無法解析")
    return candidates


QUERY_DIR = Path(__file__).resolve().parents[1] / "db" / "queries"
INTERSECTION_SQL = (QUERY_DIR / "route_shadow_intersection.sql").read_text().replace("%(", ":").replace(")s", "")


def score_route(candidate: RouteCandidate, session: Session, config: ShadowRouteParams) -> None:
    query_params = {
        "route_wkt": candidate.wkt,
        "azimuth_deg": config.azimuth_deg,
        "elevation_deg": config.elevation_deg,
        "building_search_radius": config.building_search_radius,
        "route_buffer": config.route_buffer_m,
        "snap_to_grid": config.snap_tolerance,
    }
    result = session.execute(text(INTERSECTION_SQL), query_params)
    row = result.fetchone()
    if not row:
        # 代表找不到建物或陰影，分數維持 0
        return
    candidate.shadow_area_m2 = float(row[0] or 0.0)
    candidate.shadow_length_m = float(row[1] or 0.0)
    candidate.shadow_polygon_count = int(row[2] or 0)
    candidate.building_count = int(row[3] or 0)


def optimize_shadow_route(config: ShadowRouteParams) -> Dict[str, Any]:
    api_key = config.resolve_api_key()
    candidates = call_google_routes(config, api_key)

    session = get_session()
    try:
        for candidate in candidates:
            score_route(candidate, session, config)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    best = max(candidates, key=lambda c: c.shadow_area_m2)
    return {
        "origin": {"lat": config.origin_lat, "lng": config.origin_lng},
        "destination": {"lat": config.dest_lat, "lng": config.dest_lng},
        "travel_mode": GOOGLE_TRAVEL_MODE,
        "best_route_id": best.route_id,
        "routes": [c.to_dict() for c in candidates],
    }


def full_shadow_coverage_routes(config: ShadowRouteParams) -> Dict[str, Any]:
    api_key = config.resolve_api_key()
    candidates = call_google_routes(config, api_key)

    buffer_width = config.route_buffer_m * 2.0
    for candidate in candidates:
        distance = float(candidate.distance_m or 0.0)
        candidate.shadow_length_m = distance
        candidate.shadow_area_m2 = distance * buffer_width
        candidate.shadow_polygon_count = 0
        candidate.building_count = 0

    best_route_id = candidates[0].route_id if candidates else None
    return {
        "origin": {"lat": config.origin_lat, "lng": config.origin_lng},
        "destination": {"lat": config.dest_lat, "lng": config.dest_lng},
        "travel_mode": GOOGLE_TRAVEL_MODE,
        "best_route_id": best_route_id,
        "routes": [c.to_dict() for c in candidates],
    }


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    params = ShadowRouteParams(
        origin_lat=args.origin_lat,
        origin_lng=args.origin_lng,
        dest_lat=args.dest_lat,
        dest_lng=args.dest_lng,
        max_alternatives=args.max_alternatives,
        azimuth_deg=args.azimuth_deg,
        elevation_deg=args.elevation_deg,
        building_search_radius=args.building_search_radius,
        route_buffer_m=args.route_buffer_m,
        snap_tolerance=args.snap_tolerance,
        google_routes_api_key=args.google_routes_api_key,
    )

    try:
        result = optimize_shadow_route(params)
    except requests.HTTPError as exc:
        parser.error(f"Google Routes API 呼叫失敗：{exc}")
    except SQLAlchemyError as exc:
        parser.error(f"資料庫操作失敗：{exc}")
    except ValueError as exc:
        parser.error(str(exc))

    output_text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as fout:
            fout.write(output_text)
        print(f"結果已輸出至 {args.output}")
    else:
        print(output_text)


if __name__ == "__main__":
    main()
