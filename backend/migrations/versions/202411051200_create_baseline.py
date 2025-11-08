"""create baseline

Revision ID: 202411051200
Revises:
Create Date: 2024-11-05 12:00:00.000000
"""
from __future__ import annotations

from alembic import op

revision = "202411051200"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS buildings_raw (
          ogc_fid BIGSERIAL PRIMARY KEY,
          geom_4326 geometry(MultiPolygonZ, 4326),
          id TEXT,
          ent_id TEXT,
          build_id TEXT,
          buildname TEXT,
          buildtype TEXT,
          build_str TEXT,
          m_source TEXT,
          source TEXT,
          source_des TEXT,
          mdate TEXT,
          build_h TEXT,
          h_source TEXT,
          h_extrac TEXT,
          build_no TEXT,
          no_source TEXT,
          m_mdate TEXT,
          model_lod TEXT,
          county TEXT,
          model_name TEXT,
          cent_e_97 DOUBLE PRECISION,
          cent_n_97 DOUBLE PRECISION,
          c_frameid TEXT,
          properties JSONB,
          raw_payload JSONB
        );
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS buildings_raw;")
