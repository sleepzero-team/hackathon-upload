WITH params AS (
  SELECT radians(:azimuth_deg) AS azimuth,
         radians(:elevation_deg) AS elevation
),
origin AS (
  SELECT ST_Transform(ST_SetSRID(ST_MakePoint(:center_lng, :center_lat), 4326), 3826) AS geom
),
target_buildings AS (
  SELECT b.*
  FROM buildings b
  JOIN origin o ON ST_DWithin(b.geom_3826, o.geom, :search_radius)
  WHERE b.height_m IS NOT NULL AND b.height_m > 0
),
shadow_vectors AS (
  SELECT
    b.build_id,
    b.geom_3826,
    (b.height_m / NULLIF(tan(p.elevation), 0))::double precision AS shadow_len,
    p.azimuth
  FROM target_buildings b
  CROSS JOIN params p
),
shadows_3826 AS (
  SELECT
    sv.build_id,
    ST_ConvexHull(
      ST_Collect(
        sv.geom_3826,
        ST_Translate(
          sv.geom_3826,
          sv.shadow_len * (-sin(sv.azimuth)),
          sv.shadow_len * (-cos(sv.azimuth))
        )
      )
    )::geometry(Polygon, 3826) AS geom_3826
  FROM shadow_vectors sv
  GROUP BY sv.build_id, sv.geom_3826, sv.shadow_len, sv.azimuth
),
dissolved AS (
  SELECT
    COUNT(*) AS n_buildings,
    CASE
      WHEN COUNT(*) = 0 THEN NULL
      ELSE ST_UnaryUnion(ST_SnapToGrid(ST_Collect(geom_3826), :snap_to_grid))
    END::geometry(MultiPolygon, 3826) AS geom_3826
  FROM shadows_3826
)
SELECT
  ST_AsGeoJSON(ST_Transform(d.geom_3826, 4326), 6) AS shadow_geojson,
  COALESCE(d.n_buildings, 0) AS building_count
FROM dissolved d;
