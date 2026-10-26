"""FastAPI server. Holds the Qloo and model keys, streams events as newline-delimited JSON.

Run (from the backend folder):   uvicorn app.main:app --reload --port 8000
If frontend/dist exists (after `npm run build`) it is served from the same address.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Literal, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .agent import run_expand, run_journey
from .cache import DiskCache
from .config import load_settings
from .llm import LLM
from .qloo import QlooClient
from .ratelimit import RateLimited, RateLimiter
from .warm import warm_cache

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("culturegraph")

settings = load_settings()
cache = DiskCache(settings.cache_dir)
qloo_client = QlooClient(settings.qloo_api_url, settings.qloo_api_key, cache, settings.request_timeout)
limiter = RateLimiter(settings.rate_limit_per_hour, settings.daily_journey_cap)

@asynccontextmanager
async def lifespan(_app):
    task = None
    if settings.warm_seeds and settings.qloo_api_key:
        task = asyncio.create_task(warm_cache(settings.warm_seeds, lambda: qloo_client.session(settings.max_qloo_calls)))
    yield
    if task:
        task.cancel()


app = FastAPI(title="CultureGraph Explorer", docs_url=None, redoc_url=None, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

Mode = Literal["explore", "serendipity", "rabbit_hole"]


class JourneyRequest(BaseModel):
    seed: str = Field(min_length=1, max_length=80)
    mode: Mode = "rabbit_hole"
    goal: str = Field(default="", max_length=200)
    # Set when the visitor picked one of several matches ("did you mean").
    seed_id: Optional[str] = Field(default=None, max_length=80, pattern=r"^[A-Za-z0-9_\-:.]+$")


class ExpandRequest(BaseModel):
    node_id: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_\-:.]+$")
    name: str = Field(default="", max_length=120)
    category: str = Field(default="other", max_length=40)
    depth: int = Field(default=1, ge=0, le=10)
    visited: List[str] = Field(default_factory=list, max_length=20)
    mode: Mode = "explore"
    calls_so_far: int = Field(default=0, ge=0, le=100)


def _visitor(request: Request) -> str:
    if settings.trust_proxy:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _guard(request: Request) -> None:
    if not settings.qloo_api_key:
        raise HTTPException(status_code=503, detail="The server has no Qloo key configured.")
    remaining = qloo_client.month_remaining
    if remaining is not None and remaining < settings.month_quota_floor:
        raise HTTPException(status_code=503, detail="The demo has used up its monthly Qloo quota. Please check back later.")
    try:
        limiter.check(_visitor(request))
    except RateLimited as exc:
        raise HTTPException(status_code=429, detail=str(exc))


def _llm() -> LLM:
    return LLM(settings.llm_provider, settings.llm_api_key, settings.llm_model, settings.max_llm_calls)


async def _ndjson(events):
    try:
        async for event in events:
            yield json.dumps(event, ensure_ascii=False) + "\n"
    except Exception:  # never leak internals to the browser
        log.exception("stream failed")
        yield json.dumps({"type": "error", "message": "Something went wrong on the server. Please try again."}) + "\n"


def _response(events) -> StreamingResponse:
    return StreamingResponse(
        _ndjson(events),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@app.api_route("/api/health", methods=["GET", "HEAD"])   # HEAD so uptime pingers can use it
def health():
    return {
        "ok": True,
        "qloo_key_set": bool(settings.qloo_api_key),
        "llm": settings.llm_provider if settings.llm_api_key and settings.llm_model else "none",
    }


@app.post("/api/journey")
async def journey(req: JourneyRequest, request: Request):
    _guard(request)
    session = qloo_client.session(settings.max_qloo_calls)
    return _response(run_journey(seed=req.seed, mode=req.mode, goal=req.goal, qloo=session, llm=_llm(), seed_id=req.seed_id))


@app.post("/api/expand")
async def expand(req: ExpandRequest, request: Request):
    _guard(request)
    # The count comes from the browser, so the hourly limit above is the real safeguard.
    session = qloo_client.session(settings.max_qloo_calls, min(req.calls_so_far, settings.max_qloo_calls))
    node = {"id": req.node_id, "name": req.name, "category": req.category, "depth": req.depth}
    return _response(run_expand(node=node, visited=req.visited, mode=req.mode, qloo=session, llm=_llm()))


# Serve the built front end when present, so one service can host everything.
_dist = Path(os.getenv("FRONTEND_DIST") or Path(__file__).resolve().parents[2] / "frontend" / "dist")
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="web")
