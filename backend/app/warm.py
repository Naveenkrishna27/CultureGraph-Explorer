"""Warm the private cache after a restart.

A free host wipes its disk on every restart, so the first visitor would pay for slow Qloo queries.
Instead the server quietly runs the example journeys once at startup (rules only, no model calls).
Qloo's terms allow server-side caching, and this data never goes into the repository.
"""
from __future__ import annotations

import asyncio
import logging

from .agent import run_journey
from .llm import LLM

log = logging.getLogger("culturegraph.warm")


async def warm_cache(seeds: list, new_session, pause: float = 0.5) -> int:
    """Run one rabbit-hole journey per seed so its Qloo answers land in the cache. Returns how many finished."""
    finished = 0
    for seed in seeds:
        try:
            async for _event in run_journey(
                seed=seed, mode="rabbit_hole", goal="", qloo=new_session(), llm=LLM("none", "", ""), pace=0.0
            ):
                pass
            finished += 1
            log.info("warmed %s", seed)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # warming is best effort and must never stop the server
            log.warning("warm-up of %s failed: %s", seed, type(exc).__name__)
        await asyncio.sleep(pause)
    return finished
