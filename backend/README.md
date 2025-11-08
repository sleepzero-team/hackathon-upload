# 吸血鬼地圖資料後端

- 目前規劃以 PostgreSQL 作為前處理平台，集中管理建築物與日照陰影資料，後續擴充時可同一套 schema 支援路樹資訊。
- 建築物資料預計先於 PostgreSQL 中整理與轉換，為陰影計算與地圖顯示奠定基礎。
- 日照陰影資訊同樣由 PostgreSQL 管理，方便後續進行查詢（例如指定時間地點陰影覆蓋）。
- 路樹資料暫列為待擴充項目，預留欄位與相關資料表規劃，以利未來加入。

# 專案啟動
```shell
docker compose up -d

#db migrate
docker compose exec api uv run alembic upgrade head
```

### utils/import_buildings.sh buildings_transform.sql
- `./utils/import_buildings.sh [GeoJSON]` 會以 `ogr2ogr` 匯入建物資料到 `buildings_raw`，接著執行 `buildings_transform.sql` 將欄位整理成 `buildings`（含 4326/3826 幾何、建物高度欄位與索引）。環境變數可覆蓋資料庫連線設定。

### utils/merge_shadow_query.sql
- 範例陰影查詢：以指定座標（距離 50 公尺內建物）與太陽向量（azimuth=132.62°, elevation=34.01°）計算陰影多邊形並輸出為 GeoJSON，可作為 PostGIS pipeline 範例。

### utils/solar_position.py
- 使用 `pvlib` 計算指定時間（預設以 Asia/Taipei 解讀）的太陽方位角與高度角，輸入時間即可輸出 JSON 結果。
- 預設定位在台北市政府附近（lat 25.037542, lon 121.563124, altitude 20m），也可透過參數調整；可鏈接 PostGIS 陰影計算流程。
- 範例：`python utils/solar_position.py 2024-11-05T16:00 --timezone Asia/Taipei`，會在 `data/solar-2024-11-05T09-00+08-00.json` 中輸出包含 azimuth/elevation/apparent 值與 equation_of_time。

### src/utils/shadow_route_optimizer.py
- 呼叫 `routes.googleapis.com/directions/v2:computeRoutes`（固定以 `WALK` 模式）取得多條路線，並將 polyline 轉成 WKT 後寫入 PostGIS 交給陰影融合 SQL（現置於 `src/db/queries/route_shadow_intersection.sql`）計算路徑緩衝區與陰影交集的面積/長度。
- CLI 參數可調整起訖座標、太陽角度、建物搜尋半徑、緩衝寬度與保留的替代路線數，依據陰影面積挑出最優路線並輸出 JSON；需透過環境變數 `GOOGLE_ROUTES_API_KEY` 或 CLI 參數 `--google-routes-api-key` 提供金鑰。
- 範例：
  ```bash
  uv run python -m utils.shadow_route_optimizer 25.017825 121.531337 25.021637 121.534436
  ```

- 內部抽象為 `ShadowRouteParams` 與 `optimize_shadow_route`，供 FastAPI 或其他 Python 模組重複使用。
- 使用 SQLAlchemy session（`src/db/database.py`）執行路徑陰影查詢與索引計算，避免手動管理 psycopg 連線。

### Dockerfile
- 以 `python:3.12-slim` 為基底，安裝 `uv` 後透過 `uv sync` 建立虛擬環境，最後由 `uv run uvicorn main:app --host 0.0.0.0 --port 8000` 常駐啟動 FastAPI。
- 只要 `pyproject.toml` / `uv.lock` 未變，Docker layer 會重用快取，開發時再掛載整個 repo 進容器即可。

### alembic.ini + migrations/
- `alembic.ini` 指向 `migrations/`，連線字串會從 `PG*` 環境變數帶入，無需在程式碼中寫死帳密。
- `202411051200_create_baseline.py`：建立 `buildings_raw` 結構（含原始欄位與 JSON 欄位），等同 CLI 匯入建物資料前所需的 schema。
- `202411051230_buildings_table_from_raw.py`：重用先前 shell 腳本邏輯，將 `buildings_raw` 轉成正式的 `buildings`（4326/3826 幾何、索引、主鍵等），確保 CLI 與 API 同步。
- 新增遷移請使用 `uv run alembic revision -m "message"` 與 `uv run alembic upgrade head`；在 Docker 中可透過 `docker compose exec api uv run alembic upgrade head` 套用。

### main.py 與 api/
- `main.py` 只負責建立 FastAPI app、掛載 `/health` 與 `api.routes.shadow` 路由。
- `api/schemas.py` 定義 `ShadowRouteRequest` 與 `ShadowAreaRequest`，而 `api/routes/shadow.py` 內包含 `/shadow-route` 與 `/shadow-area` 端點：前者依 `timestamp` 計算太陽向量後，透過 `optimize_shadow_route` 取得最佳路線；後者以中心點/半徑計算建物陰影並輸出 FeatureCollection。
- `/shadow-route` 若計算出太陽仰角 ≤ 0（太陽已下山），會跳過資料庫陰影運算，改直接回傳 Google Routes API 結果並將每條路線的 `shadow_area_m2` / `shadow_length_m` 視為全程覆蓋，同時附帶提示訊息。
- 太陽計算預設採起點或中心點座標，可透過 `solar_latitude/solar_longitude/solar_altitude_m` 覆寫；資料庫連線則由環境變數 `PG*` 管理（若需不同設定可在部署層調整）。
- 範例：
  ```bash
  curl -X POST http://localhost:8000/shadow-route \
    -H 'Content-Type: application/json' \
    -d '{
      "origin_lat": 25.017825,
      "origin_lng": 121.531337,
      "dest_lat": 25.021637,
      "dest_lng": 121.534436,
      "timestamp": "2024-11-05T09:00:00",
      "timezone": "Asia/Taipei",
      "max_alternatives": 3
    }'
  ```
  會回傳 `solar` 資訊與多條候選路線（含最佳 `best_route_id`）。
- 區域陰影 GeoJSON：
  ```bash
  curl -X POST http://localhost:8000/shadow-area \
    -H 'Content-Type: application/json' \
    -d '{
      "center_lat": 25.0217746,
      "center_lng": 121.5351267,
      "search_radius_m": 500,
      "timestamp": "2024-11-05T09:00:00",
      "timezone": "Asia/Taipei"
    }'
  ```
  回傳 `solar` 與 `feature_collection`（GeoJSON），可直接餵給 Demo 頁面顯示陰影覆蓋範圍。
