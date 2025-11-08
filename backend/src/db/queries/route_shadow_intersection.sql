WITH route AS (
  SELECT ST_Transform(ST_GeomFromText(%(route_wkt)s, 4326), 3826) AS geom
),
params AS (
  SELECT radians(%(azimuth_deg)s) AS azimuth,
         radians(%(elevation_deg)s) AS elevation
),
target_buildings AS (
  SELECT b.*
  FROM buildings b
  JOIN route r ON ST_DWithin(b.geom_3826, r.geom, %(building_search_radius)s)
  WHERE b.height_m IS NOT NULL AND b.height_m > 0
),
shadow_vectors AS (
  SELECT
    b.build_id,
    b.geom_3826,
    (b.height_m / tan(p.elevation))::double precision AS shadow_len,
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
    CASE
      WHEN COUNT(*) = 0 THEN NULL
      ELSE ST_UnaryUnion(ST_SnapToGrid(ST_Collect(geom_3826), %(snap_to_grid)s))
    END::geometry(MultiPolygon, 3826) AS geom_3826,
    COUNT(*)::int AS n_polygons
  FROM shadows_3826
),
route_buffer AS (
  SELECT ST_Buffer(route.geom, %(route_buffer)s, 'endcap=flat join=round quad_segs=4') AS geom
  FROM route
)
SELECT
  COALESCE(
    ST_Area(
      ST_Intersection(rb.geom, d.geom_3826)
    ),
    0
  ) AS intersection_area_m2,
  COALESCE(
    ST_Length(
      ST_Intersection(route.geom, d.geom_3826)
    ),
    0
  ) AS intersection_length_m,
  COALESCE(d.n_polygons, 0) AS polygon_count,
  (SELECT COUNT(*) FROM target_buildings) AS building_count
FROM route, route_buffer rb, dissolved d;
