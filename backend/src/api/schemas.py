"""Pydantic schemas for the Vampire Map API."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ShadowRouteRequest(BaseModel):
    origin_lat: float = Field(..., ge=-90, le=90, description="起點緯度")
    origin_lng: float = Field(..., ge=-180, le=180, description="起點經度")
    dest_lat: float = Field(..., ge=-90, le=90, description="終點緯度")
    dest_lng: float = Field(..., ge=-180, le=180, description="終點經度")
    timestamp: datetime = Field(..., description="ISO 8601 時間，可含時區")
    timezone: str = Field("Asia/Taipei", description="當輸入為 naive datetime 時套用的時區")
    max_alternatives: int = Field(3, ge=1, le=10, description="最多候選路線數")
    building_search_radius: float = Field(250.0, gt=0, description="建物搜尋半徑 (公尺)")
    route_buffer_m: float = Field(3.0, gt=0, description="路徑緩衝半徑 (公尺)")
    snap_tolerance: float = Field(0.05, ge=0, description="ST_SnapToGrid 公尺值")
    solar_latitude: Optional[float] = Field(None, description="計算太陽向量時使用的緯度，不填則採起點")
    solar_longitude: Optional[float] = Field(None, description="計算太陽向量時使用的經度，不填則採起點")
    solar_altitude_m: float = Field(20.0, description="太陽計算高度 (m)")
    solar_pressure: Optional[float] = Field(101325.0, description="地表壓力 (Pa)")
    solar_temperature: Optional[float] = Field(25.0, description="環境溫度 (°C)")

class ShadowAreaRequest(BaseModel):
    center_lat: float = Field(..., ge=-90, le=90, description="查詢中心緯度")
    center_lng: float = Field(..., ge=-180, le=180, description="查詢中心經度")
    search_radius_m: float = Field(50.0, gt=0, description="建物搜尋半徑 (公尺)")
    timestamp: datetime = Field(..., description="ISO 8601 時間，可含時區")
    timezone: str = Field("Asia/Taipei", description="當輸入為 naive datetime 時套用的時區")
    solar_latitude: Optional[float] = Field(None, description="計算太陽向量時使用的緯度，不填則採 center_lat")
    solar_longitude: Optional[float] = Field(None, description="計算太陽向量時使用的經度，不填則採 center_lng")
    solar_altitude_m: float = Field(20.0, description="太陽計算高度 (m)")
    solar_pressure: Optional[float] = Field(101325.0, description="地表壓力 (Pa)")
    solar_temperature: Optional[float] = Field(25.0, description="環境溫度 (°C)")
