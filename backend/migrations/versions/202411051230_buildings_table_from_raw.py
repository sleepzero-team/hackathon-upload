"""Create buildings table from buildings_raw pipeline

Revision ID: 202411051230
Revises: 202411051200
Create Date: 2024-11-05 12:30:00.000000
"""
from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "202411051230"
down_revision = "202411051200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'buildings_raw' AND column_name = 'geom_4326'
          ) THEN
            ALTER TABLE buildings_raw
              ALTER COLUMN geom_4326
              TYPE geometry(MultiPolygonZ, 4326)
              USING ST_SetSRID(geom_4326, 4326);
          END IF;
        END
        $$;
        """
    )

    op.execute("DROP TABLE IF EXISTS buildings;")

    op.execute(
        """
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
        """
    )

    op.execute("ALTER TABLE buildings ADD PRIMARY KEY (build_id);")
    op.execute("CREATE INDEX idx_buildings_geom_4326 ON buildings USING GIST (geom_4326);")
    op.execute("CREATE INDEX idx_buildings_geom_3826 ON buildings USING GIST (geom_3826);")
    op.execute("CREATE INDEX idx_buildings_height ON buildings (height_m);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS buildings;")
