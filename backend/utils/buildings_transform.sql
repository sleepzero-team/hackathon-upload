-- 建物資料匯入後的整理腳本
BEGIN;

ALTER TABLE buildings_raw
  ALTER COLUMN geom_4326
  TYPE geometry(MultiPolygonZ, 4326)
  USING ST_SetSRID(geom_4326, 4326);

DROP TABLE IF EXISTS buildings;

CREATE TABLE buildings AS
SELECT
  COALESCE(NULLIF(build_id, ''), CONCAT('FID_', ogc_fid)) AS build_id,
  geom_4326,
  ST_Transform(ST_Force2D(geom_4326), 3826) AS geom_3826,
  NULLIF(build_h, '')::double precision AS height_m,
  NULLIF(model_lod, '')::text AS model_lod,
  source_des,
  source,
  county,
  mdate,
  m_mdate,
  NOW() AT TIME ZONE 'UTC' AS ingested_at
FROM buildings_raw
WHERE geom_4326 IS NOT NULL;

ALTER TABLE buildings
  ADD PRIMARY KEY (build_id);

CREATE INDEX idx_buildings_geom_4326 ON buildings USING GIST (geom_4326);
CREATE INDEX idx_buildings_geom_3826 ON buildings USING GIST (geom_3826);
CREATE INDEX idx_buildings_height ON buildings (height_m);

COMMIT;