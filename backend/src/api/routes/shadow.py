"""Shadow route API endpoints."""

from __future__ import annotations

import asyncio
from dataclasses import asdict
from typing import Any, Dict

import pandas as pd
import requests
from fastapi import APIRouter, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from zoneinfo import ZoneInfo

from api.schemas import ShadowAreaRequest, ShadowRouteRequest
from utils import solar_position
from utils.shadow_area import ShadowAreaParams, compute_shadow_geojson
from utils.shadow_route_optimizer import (
    ShadowRouteParams,
    full_shadow_coverage_routes,
    optimize_shadow_route,
)

router = APIRouter(prefix="", tags=["shadow"])


def _resolve_timestamp(value: pd.Timestamp | str, timezone_name: str) -> pd.Timestamp:
    try:
        timestamp = pd.Timestamp(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"無法解析時間：{exc}") from exc

    try:
        zone = ZoneInfo(timezone_name)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"未知時區：{exc}") from exc
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize(zone)
    else:
        timestamp = timestamp.tz_convert(zone)
    return timestamp


def _build_shadow_params(body: ShadowRouteRequest, azimuth: float, elevation: float) -> ShadowRouteParams:
    kwargs: Dict[str, Any] = {
        "origin_lat": body.origin_lat,
        "origin_lng": body.origin_lng,
        "dest_lat": body.dest_lat,
        "dest_lng": body.dest_lng,
        "max_alternatives": body.max_alternatives,
        "azimuth_deg": azimuth,
        "elevation_deg": elevation,
        "building_search_radius": body.building_search_radius,
        "route_buffer_m": body.route_buffer_m,
        "snap_tolerance": body.snap_tolerance,
    }

    return ShadowRouteParams(**kwargs)


def _build_shadow_area_params(body: ShadowAreaRequest, azimuth: float, elevation: float) -> ShadowAreaParams:
    kwargs: Dict[str, Any] = {
        "center_lat": body.center_lat,
        "center_lng": body.center_lng,
        "search_radius": body.search_radius_m,
        "azimuth_deg": azimuth,
        "elevation_deg": elevation,
    }

    return ShadowAreaParams(**kwargs)

@router.post("/shadow-route")
async def shadow_route(body: ShadowRouteRequest) -> Dict[str, Any]:
    timestamp = _resolve_timestamp(body.timestamp, body.timezone)
    solar_lat = body.solar_latitude if body.solar_latitude is not None else body.origin_lat
    solar_lng = body.solar_longitude if body.solar_longitude is not None else body.origin_lng

    try:
        solar = solar_position.compute_solar_position(
            timestamp=timestamp,
            latitude=solar_lat,
            longitude=solar_lng,
            altitude=body.solar_altitude_m,
            pressure=body.solar_pressure,
            temperature=body.solar_temperature,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"無法計算太陽位置：{exc}") from exc

    params = _build_shadow_params(body, solar.azimuth_deg, solar.elevation_deg)

    if solar.elevation_deg <= 0:
        try:
            result = await asyncio.to_thread(full_shadow_coverage_routes, params)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except requests.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Google Routes API 呼叫失敗：{exc}") from exc

        payload = {"solar": asdict(solar), "message": "太陽已下山，全程視為陰影"}
        payload.update(result)
        return payload

    try:
        result = await asyncio.to_thread(optimize_shadow_route, params)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except requests.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Google Routes API 呼叫失敗：{exc}") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=502, detail=f"資料庫操作失敗：{exc}") from exc

    payload = {"solar": asdict(solar)}
    payload.update(result)
    return payload


@router.post("/shadow-area")
async def shadow_area(body: ShadowAreaRequest) -> Dict[str, Any]:
    timestamp = _resolve_timestamp(body.timestamp, body.timezone)
    solar_lat = body.solar_latitude if body.solar_latitude is not None else body.center_lat
    solar_lng = body.solar_longitude if body.solar_longitude is not None else body.center_lng

    try:
        solar = solar_position.compute_solar_position(
            timestamp=timestamp,
            latitude=solar_lat,
            longitude=solar_lng,
            altitude=body.solar_altitude_m,
            pressure=body.solar_pressure,
            temperature=body.solar_temperature,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"無法計算太陽位置：{exc}") from exc

    if solar.elevation_deg <= 0:
        return {
            "solar": asdict(solar),
            "feature_collection": {"type": "FeatureCollection", "features": []},
            "building_count": 0,
            "message": "太陽已下山，無陰影可顯示",
        }

    params = _build_shadow_area_params(body, solar.azimuth_deg, solar.elevation_deg)

    try:
        result = await asyncio.to_thread(compute_shadow_geojson, params)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=502, detail=f"資料庫操作失敗：{exc}") from exc

    payload = {"solar": asdict(solar)}
    payload.update(result)
    return payload
