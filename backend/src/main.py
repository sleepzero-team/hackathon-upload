"""Application entrypoint for the Vampire Map API."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes.shadow import router as shadow_router

app = FastAPI(
    title="Vampire Map API",
    description="整合太陽位置計算與陰影路線評分的 API 服務",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(shadow_router)
