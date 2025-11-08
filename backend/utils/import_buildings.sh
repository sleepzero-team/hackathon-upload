#!/usr/bin/env bash
#
# 將 GeoJSON 建物資料匯入 PostGIS，並建立整理後的 buildings 資料表。
#
# 必要環境變數（如未設定則使用預設值）：
#   PGHOST (default: localhost)
#   PGPORT (default: 5432)
#   PGDATABASE (default: vampire)
#   PGUSER (default: vampire)
#   PGPASSWORD (default: vampire)
#
# 使用方式：
#   ./db/import_buildings.sh [path/to/buildings.geojson]
# 若未指定檔案，預設為專案 data/buildings_taipei.geojson。

set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-vampire}"
PGUSER="${PGUSER:-vampire}"
PGPASSWORD="${PGPASSWORD:-vampire}"
export PGPASSWORD

GEOJSON_PATH="${1:-data/buildings_taipei.geojson}"

if [[ ! -f "${GEOJSON_PATH}" ]]; then
  echo "[error] GeoJSON not found: ${GEOJSON_PATH}" >&2
  exit 1
fi

OGR_CONN="PG:host=${PGHOST} port=${PGPORT} dbname=${PGDATABASE} user=${PGUSER} password=${PGPASSWORD}"
echo "[info] Importing ${GEOJSON_PATH} into buildings_raw"
ogr2ogr \
  -f "PostgreSQL" "${OGR_CONN}" "${GEOJSON_PATH}" \
  -nln buildings_raw \
  -nlt MULTIPOLYGONZ \
  -lco GEOMETRY_NAME=geom_4326 \
  -overwrite

echo "[info] Running transformation SQL"
docker exec -i vampire-postgis psql \
  -U "${PGUSER}" \
  -d "${PGDATABASE}" \
  -f - < utils/buildings_transform.sql

echo "[done] Buildings imported and transformed"
