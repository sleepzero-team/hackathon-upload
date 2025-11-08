WITH params AS (
  SELECT
    -- azimuth/elevation 單位是「弧度」
    radians(132.62093746276173) AS azimuth,   -- 太陽方位角（看提示 ③）
    radians(34.01104286714345)  AS elevation  -- 太陽仰角
),
target_buildings AS (
  SELECT b.*
  FROM buildings b
  WHERE ST_DWithin(
    b.geom_3826,
    ST_Transform(
      ST_SetSRID(ST_MakePoint(121.53512676260097, 25.02177462502842), 4326),
      3826
    ),
    150
  )
),
shadow_vectors AS (
  SELECT
    b.build_id,
    b.geom_3826,
    (b.height_m / tan(p.elevation))::double precision AS shadow_len,
    p.azimuth
  FROM target_buildings b
  CROSS JOIN params p
  WHERE b.height_m IS NOT NULL AND b.height_m > 0
),
-- 仍用你原本的「原形＋一次平移」做近似（注意：方向見提示 ③）
shadows_3826 AS (
  SELECT
    s.build_id,
    ST_ConvexHull(
      ST_Collect(
        s.geom_3826,
        ST_Translate(
          s.geom_3826,
          -- 若 azimuth 為「北=0°、順時針」：陰影方向應為 -sin/-cos（見提示 ③）
          s.shadow_len * (-sin(s.azimuth)),
          s.shadow_len * (-cos(s.azimuth))
        )
      )
    )::geometry(Polygon,3826) AS geom_3826
  FROM shadow_vectors s
  GROUP BY s.build_id, s.geom_3826, s.shadow_len, s.azimuth
),
-- ★ 把所有建物的陰影 dissolve 成一個較大的區塊（常為 MultiPolygon）
dissolved AS (
  SELECT ST_UnaryUnion( ST_SnapToGrid( ST_Collect(geom_3826), 0.05 ) )::geometry(MultiPolygon,3826) AS geom_3826
  FROM shadows_3826
)
SELECT jsonb_build_object(
  'type','FeatureCollection',
  'features', jsonb_build_array(
    jsonb_build_object(
      'type','Feature',
      'id','shadow_dissolved',
      'properties', jsonb_build_object(
         'method','convexhull_once',
         'n_buildings',(SELECT COUNT(*) FROM shadows_3826)
      ),
      'geometry', ST_AsGeoJSON(ST_Transform(geom_3826, 4326))::jsonb
    )
  )
) AS feature_collection
FROM dissolved;
