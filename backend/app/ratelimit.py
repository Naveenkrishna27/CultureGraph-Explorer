"""Tiny in-memory limiter so one visitor (or a crowd) cannot burn the Qloo and model quotas."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from datetime import date


class RateLimited(Exception):
    pass


class RateLimiter:
    def __init__(self, per_hour: int, daily_cap: int):
        self.per_hour = per_hour
        self.daily_cap = daily_cap
        self.hits: dict[str, deque] = defaultdict(deque)
        self.day = date.today()
        self.today = 0

    def check(self, visitor: str) -> None:
        now = time.time()
        if date.today() != self.day:
            self.day, self.today = date.today(), 0
        if self.today >= self.daily_cap:
            raise RateLimited("The demo has reached its daily limit. Please try again tomorrow.")
        q = self.hits[visitor]
        while q and now - q[0] > 3600:
            q.popleft()
        if len(q) >= self.per_hour:
            raise RateLimited("You have reached the hourly limit for this demo. Please try again later.")
        q.append(now)
        self.today += 1
