"""Solar position helper tailored for Taipei-area queries.

This utility exposes a small CLI wrapper around pvlib's solarposition module
so researchers can input a timestamp (defaults to Asia/Taipei) and obtain the
matching azimuth/elevation along with useful metadata. Values are printed as
JSON for easy piping to other scripts.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from typing import Optional

import pandas as pd
from pvlib import solarposition
from zoneinfo import ZoneInfo
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

@dataclass
class SolarResult:
    timestamp: str
    latitude: float
    longitude: float
    altitude_m: float
    azimuth_deg: float
    elevation_deg: float
    apparent_elevation_deg: float
    zenith_deg: float
    apparent_zenith_deg: float
    equation_of_time_min: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compute solar azimuth/elevation for Taipei latitude/longitude.",
    )
    parser.add_argument(
        "timestamp",
        help="Timestamp (ISO 8601). Naive times are interpreted in --timezone.",
    )
    parser.add_argument(
        "--timezone",
        default="Asia/Taipei",
        help="Timezone for naive timestamps (default: Asia/Taipei).",
    )
    parser.add_argument(
        "--latitude",
        type=float,
        default=25.037542,
        help="Latitude in degrees (default: Taipei City Hall).",
    )
    parser.add_argument(
        "--longitude",
        type=float,
        default=121.563124,
        help="Longitude in degrees (default: Taipei City Hall).",
    )
    parser.add_argument(
        "--altitude",
        type=float,
        default=20.0,
        help="Altitude above sea level in meters (default: 20).",
    )
    parser.add_argument(
        "--pressure",
        type=float,
        default=101325.0,
        help="Surface pressure in Pascals (default: 101325).",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=25.0,
        help="Ambient temperature in Celsius (default: 25).",
    )
    return parser.parse_args()


def _coerce_timestamp(ts: str, timezone_name: str) -> pd.Timestamp:
    try:
        timestamp = pd.Timestamp(ts)
    except ValueError as exc:  # pragma: no cover - invalid user input
        raise SystemExit(f"Invalid timestamp '{ts}': {exc}") from exc

    if timestamp.tzinfo is None:
        try:
            timestamp = timestamp.tz_localize(ZoneInfo(timezone_name))
        except Exception as exc:  # pragma: no cover - zone errors are rare
            raise SystemExit(f"Unknown timezone '{timezone_name}': {exc}") from exc
    else:
        timestamp = timestamp.tz_convert(ZoneInfo(timezone_name))
    return timestamp


def compute_solar_position(
    timestamp: pd.Timestamp,
    latitude: float,
    longitude: float,
    altitude: float,
    pressure: Optional[float],
    temperature: Optional[float],
) -> SolarResult:
    times = pd.DatetimeIndex([timestamp])
    result = solarposition.get_solarposition(
        times,
        latitude=latitude,
        longitude=longitude,
        altitude=altitude,
        pressure=pressure,
        temperature=temperature,
    ).iloc[0]
    return SolarResult(
        timestamp=timestamp.isoformat(),
        latitude=latitude,
        longitude=longitude,
        altitude_m=altitude,
        azimuth_deg=float(result["azimuth"]),
        elevation_deg=float(result["elevation"]),
        apparent_elevation_deg=float(result["apparent_elevation"]),
        zenith_deg=float(result["zenith"]),
        apparent_zenith_deg=float(result["apparent_zenith"]),
        equation_of_time_min=float(result["equation_of_time"]),
    )


def main() -> None:
    args = parse_args()
    timestamp = _coerce_timestamp(args.timestamp, args.timezone)
    solar = compute_solar_position(
        timestamp=timestamp,
        latitude=args.latitude,
        longitude=args.longitude,
        altitude=args.altitude,
        pressure=args.pressure,
        temperature=args.temperature,
    )
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    safe_time = timestamp.isoformat().replace(":", "-")
    output_path = DATA_DIR / f"solar-{safe_time}.json"
    output_path.write_text(json.dumps(asdict(solar), ensure_ascii=False, indent=2))
    print(f"Wrote solar position to {output_path}")


if __name__ == "__main__":
    main()
