"""SQLAlchemy engine/session helpers for Vampire Map API."""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Optional, Tuple

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


def _build_connection_url(
    host: str,
    port: int,
    database: str,
    user: str,
    password: str,
) -> str:
    return f"postgresql+psycopg://{user}:{password}@{host}:{port}/{database}"


def _default_db_settings() -> Tuple[str, int, str, str, str]:
    host = os.getenv("PGHOST", "localhost")
    port = int(os.getenv("PGPORT", "5432"))
    database = os.getenv("PGDATABASE", "vampire")
    user = os.getenv("PGUSER", "vampire")
    password = os.getenv("PGPASSWORD", "vampire")
    return host, port, database, user, password


@lru_cache(maxsize=8)
def _get_engine_cached(settings: Tuple[str, int, str, str, str]) -> Engine:
    host, port, database, user, password = settings
    url = _build_connection_url(host, port, database, user, password)
    return create_engine(url, pool_pre_ping=True, future=True)


def get_engine(
    *,
    host: Optional[str] = None,
    port: Optional[int] = None,
    database: Optional[str] = None,
    user: Optional[str] = None,
    password: Optional[str] = None,
) -> Engine:
    """Return a cached SQLAlchemy Engine based on the supplied settings."""

    default_host, default_port, default_db, default_user, default_password = _default_db_settings()
    settings = (
        host or default_host,
        port or default_port,
        database or default_db,
        user or default_user,
        password or default_password,
    )
    return _get_engine_cached(settings)


def get_session(
    *,
    host: Optional[str] = None,
    port: Optional[int] = None,
    database: Optional[str] = None,
    user: Optional[str] = None,
    password: Optional[str] = None,
) -> Session:
    """Create a new SQLAlchemy Session for the given settings."""

    engine = get_engine(
        host=host,
        port=port,
        database=database,
        user=user,
        password=password,
    )
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    return session_factory()
