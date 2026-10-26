"""Settings come from environment variables (and a .env file). Secrets never leave the server."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

# Looks for a .env next to this package, then in parent folders, so one .env at the
# repo root (the same one probe.py uses) works for everything.
load_dotenv()


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    qloo_api_key: str
    qloo_api_url: str
    llm_provider: str          # none | anthropic | openai | gemini
    llm_api_key: str
    llm_model: str
    max_qloo_calls: int        # budget per journey (also what the UI meter shows)
    max_llm_calls: int         # hard cap on model calls per journey
    cache_dir: Path            # private server-side cache. NEVER commit this folder.
    allowed_origins: list
    rate_limit_per_hour: int   # journeys per visitor per hour
    daily_journey_cap: int     # journeys per day across all visitors
    trust_proxy: bool
    request_timeout: int
    month_quota_floor: int     # stop taking journeys when Qloo's monthly quota falls below this
    warm_seeds: list           # example names to pre-run at startup (empty = off)


def load_settings() -> Settings:
    provider = (os.getenv("LLM_PROVIDER") or "none").strip().lower()
    if provider not in {"none", "anthropic", "openai", "gemini"}:
        provider = "none"
    origins = [o.strip() for o in (os.getenv("ALLOWED_ORIGINS") or "http://localhost:5173").split(",") if o.strip()]
    return Settings(
        qloo_api_key=(os.getenv("QLOO_API_KEY") or "").strip(),
        qloo_api_url=(os.getenv("QLOO_API_URL") or "https://hackathon.api.qloo.com").strip().rstrip("/"),
        llm_provider=provider,
        llm_api_key=(os.getenv("LLM_API_KEY") or "").strip(),
        llm_model=(os.getenv("LLM_MODEL") or "").strip(),
        max_qloo_calls=_int("MAX_QLOO_CALLS", 12),
        max_llm_calls=_int("MAX_LLM_CALLS", 8),
        cache_dir=Path(os.getenv("CACHE_DIR") or Path(__file__).resolve().parent.parent / ".cache"),
        allowed_origins=origins,
        rate_limit_per_hour=_int("RATE_LIMIT_PER_HOUR", 20),
        daily_journey_cap=_int("DAILY_JOURNEY_CAP", 300),
        trust_proxy=(os.getenv("TRUST_PROXY") or "").lower() in {"1", "true", "yes"},
        request_timeout=_int("REQUEST_TIMEOUT", 25),
        month_quota_floor=_int("MONTH_QUOTA_FLOOR", 300),
        warm_seeds=[x.strip() for x in (os.getenv("WARM_SEEDS") or "").split(",") if x.strip()],
    )
