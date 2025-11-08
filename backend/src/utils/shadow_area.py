"""Utilities for computing area-based building shadow GeoJSON."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from db.database import get_session

QUERY_PATH = Path(__file__).resolve().parents[1] / "db" / "queries" / "building_shadow_geojson.sql"
BUILDING_SHADOW_SQL = QUERY_PATH.read_text().replace("%(", ":").replace(")s", "")


@dataclass
class ShadowAreaParams:
    center_lat: float
    center_lng: float
    search_radius: float
    azimuth_deg: float
    elevation_deg: float
    snap_to_grid: float = 0.05

def compute_shadow_geojson(params: ShadowAreaParams) -> Dict[str, Any]:
    session = get_session()
    try:
        rows = session.execute(
            text(BUILDING_SHADOW_SQL),
            {
                "center_lat": params.center_lat,
                "center_lng": params.center_lng,
                "search_radius": params.search_radius,
                "azimuth_deg": params.azimuth_deg,
                "elevation_deg": params.elevation_deg,
                "snap_to_grid": params.snap_to_grid,
            },
        ).fetchall()
    finally:
        session.close()

    row = rows[0] if rows else None

    if not row or not row.shadow_geojson:
        return {
            "feature_collection": {"type": "FeatureCollection", "features": []},
            "building_count": 0,
        }

    feature = {
        "type": "Feature",
        "id": "shadow_dissolved",
        "geometry": json.loads(row.shadow_geojson),
        "properties": {
            "method": "convexhull_once",
            "n_buildings": int(row.building_count or 0),
        },
    }
    return {
        "feature_collection": {"type": "FeatureCollection", "features": [feature]},
        "building_count": int(row.building_count or 0),
    }
