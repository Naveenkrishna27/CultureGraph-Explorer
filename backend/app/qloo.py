"""Qloo API client. Every call is a GET with the key in the X-Api-Key header.

Response parsing is deliberately tolerant. After running probe.py on the real API, tighten
`extract_entities` and `normalize_entity` to match exactly what comes back.
"""
from __future__ import annotations

import asyncio
import logging
import re
import threading
import time
from datetime import datetime, timezone
from typing import Optional

import requests

from .cache import DiskCache

log = logging.getLogger("culturegraph.qloo")

SEARCH = "/search"
INSIGHTS = "/v2/insights"

KNOWN_CATEGORIES = {
    "artist", "book", "brand", "destination", "movie", "person",
    "place", "podcast", "tv_show", "video_game",
}


class QlooError(Exception):
    def __init__(self, status: int, message: str, detail: str = ""):
        super().__init__(message)
        self.status = status
        self.message = message
        self.detail = detail   # Qloo's own explanation, for logs and decisions. Never shown with a key.


class BudgetExceeded(Exception):
    pass


def _friendly(status: int) -> str:
    if status == 400:
        return "Qloo did not accept that request for this category."
    if status == 401:
        return "Qloo rejected the API key. Check QLOO_API_KEY and that the base URL is the hackathon one."
    if status == 403:
        return "Qloo does not support that request (usually an unsupported entity type)."
    if status == 404:
        return "Qloo could not find that endpoint."
    if status == 429:
        return "Qloo's rate limit was reached. Wait a moment and try again."
    if status >= 500:
        return "Qloo had a server error. Try again shortly."
    return f"Qloo answered with status {status}."


def _error_detail(resp) -> str:
    try:
        body = resp.json()
    except ValueError:
        return (resp.text or "")[:200]
    if isinstance(body, dict):
        errors = body.get("errors")
        if isinstance(errors, list):
            return "; ".join(str(e.get("message", e)) if isinstance(e, dict) else str(e) for e in errors)[:300]
        return str(body.get("message") or body)[:300]
    return str(body)[:300]


def category_from_types(types) -> str:
    slugs = []
    for t in types or []:
        if isinstance(t, str) and t.startswith("urn:entity:"):
            slug = t.split(":")[-1]
            slugs.append("video_game" if slug == "videogame" else slug)
    for s in slugs:
        if s in KNOWN_CATEGORIES:
            return s
    return slugs[0] if slugs else "other"


def category_of(raw: dict) -> str:
    """Insights results carry the category in `subtype`, search results in `types`."""
    urns = [raw.get("subtype")] + list(raw.get("types") or []) + [raw.get("type")]
    return category_from_types([u for u in urns if isinstance(u, str)])


SKIP_TAG_GROUPS = {"obscurity"}


def tag_group(tag_type) -> str:
    """'urn:tag:genre:qloo' -> 'genre'"""
    parts = str(tag_type or "").split(":")
    return parts[2] if len(parts) > 2 and parts[0] == "urn" and parts[1] == "tag" else ""


def _tags(raw: dict) -> list:
    out, seen = [], set()
    for t in raw.get("tags") or []:
        if not isinstance(t, dict):
            continue
        name = str(t.get("name") or "").strip()
        group = tag_group(t.get("type") or t.get("id"))
        if not name or group in SKIP_TAG_GROUPS or name.lower() in seen:
            continue
        seen.add(name.lower())
        out.append({"name": name, "group": group})
    return out


def extract_entities(data) -> list:
    """Find the list of entities whichever way the response wraps it."""
    if not isinstance(data, dict):
        return []
    results = data.get("results", data)
    if isinstance(results, dict):
        for key in ("entities", "results", "items"):
            if isinstance(results.get(key), list):
                return results[key]
        return []
    return results if isinstance(results, list) else []


def _score(raw: dict) -> Optional[float]:
    q = raw.get("query") if isinstance(raw.get("query"), dict) else {}
    value = q.get("affinity", raw.get("affinity"))
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _blurb(raw: dict) -> str:
    props = raw.get("properties") if isinstance(raw.get("properties"), dict) else {}
    text = ""
    for item in props.get("short_descriptions") or []:  # prefer the short English line
        if isinstance(item, dict) and "en" in (item.get("languages") or []):
            text = item.get("value") or ""
            break
    text = text or props.get("description") or raw.get("description") or ""
    # Some records carry HTML or scraped boilerplate. Keep plain words only.
    text = re.sub(r"<[^>]*>", " ", str(text))
    text = re.sub(r"<[^>]*$", " ", text)            # a tag cut off at the end
    text = re.sub(r"https?://\S+", "", text)
    text = " ".join(text.split())
    if len(text) < 3 or re.match(r"(?i)^alternate covers", text):
        return ""
    return text if len(text) <= 140 else text[:137].rstrip() + "..."


def _popularity(raw: dict):
    try:
        value = raw.get("popularity")
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def normalize_entity(raw: dict) -> dict:
    return {
        "id": str(raw.get("entity_id") or raw.get("id") or ""),
        "name": str(raw.get("name") or "Unknown"),
        "category": category_of(raw),
        "blurb": _blurb(raw),
        "score": _score(raw),
        "popularity": _popularity(raw),
        "tags": _tags(raw),
    }


class Pacer:
    """Spaces request starts apart. The hackathon key allows 5 requests per second."""

    def __init__(self, per_second: float):
        self.gap = 1.0 / per_second
        self.lock = threading.Lock()
        self.next_slot = 0.0

    def wait(self) -> None:
        with self.lock:
            now = time.monotonic()
            start = max(now, self.next_slot)
            self.next_slot = start + self.gap
        if start > now:
            time.sleep(start - now)


class QlooClient:
    def __init__(self, base_url: str, api_key: str, cache: DiskCache, timeout: int = 25, per_second: float = 4):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.cache = cache
        self.timeout = timeout
        self.pacer = Pacer(per_second)
        self.month_remaining = None  # learned from Qloo's X-Month-RateLimit-Remaining header
        self._unsupported = {}       # category -> expiry time. Only for an explicit "not supported" answer.

    def request(self, path: str, params: dict):
        """Blocking GET. Returns (json, retrieved_at_iso). Runs in a worker thread."""
        key = DiskCache.make_key(path, params)
        hit = self.cache.get(key)
        if hit and "data" in hit:
            return hit["data"], hit.get("retrievedAt", "")
        resp = None
        for attempt in range(3):
            self.pacer.wait()
            try:
                resp = requests.get(
                    self.base_url + path,
                    params=params,
                    headers={"X-Api-Key": self.api_key, "Accept": "application/json"},
                    timeout=self.timeout,
                )
            except requests.RequestException:
                raise QlooError(0, "Could not reach Qloo. Check the connection and try again.")
            self._note_quota(resp)
            if resp.status_code == 429 and attempt < 2:
                time.sleep(1.1)  # per-second limit hit: wait for the window to reset, then retry
                continue
            break
        if resp.status_code != 200:
            detail = _error_detail(resp)
            log.warning("Qloo answered %s for %s (filter.type=%s): %s", resp.status_code, path, params.get("filter.type", "-"), detail)
            raise QlooError(resp.status_code, _friendly(resp.status_code), detail)
        try:
            data = resp.json()
        except ValueError:
            raise QlooError(502, "Qloo sent a reply that was not JSON.")
        retrieved = datetime.now(timezone.utc).isoformat(timespec="seconds")
        if extract_entities(data):  # never cache empty answers: they often mean a bad parameter
            self.cache.set(key, {"retrievedAt": retrieved, "data": data})
        return data, retrieved

    def unsupported_set(self) -> set:
        now = time.monotonic()
        for cat in [c for c, until in self._unsupported.items() if until <= now]:
            del self._unsupported[cat]
        return set(self._unsupported)

    def mark_unsupported(self, category: str, minutes: int = 30) -> None:
        self._unsupported[category] = time.monotonic() + minutes * 60

    def _note_quota(self, resp) -> None:
        try:
            self.month_remaining = int(resp.headers.get("X-Month-RateLimit-Remaining"))
        except (TypeError, ValueError):
            pass

    def session(self, max_calls: int, calls_used: int = 0) -> "QlooSession":
        return QlooSession(self, max_calls, calls_used)


class QlooSession:
    """One journey's worth of Qloo access, with a hard query budget."""

    def __init__(self, client: QlooClient, max_calls: int, calls: int = 0):
        self.client = client
        self.max_calls = max_calls
        self.calls = calls

    def _spend(self) -> None:
        if self.calls >= self.max_calls:
            raise BudgetExceeded()
        self.calls += 1

    @property
    def remaining(self) -> int:
        return max(0, self.max_calls - self.calls)

    @property
    def unsupported(self) -> set:
        return self.client.unsupported_set()

    async def search(self, name: str, take: int = 5, free: bool = False) -> list:
        if not free:   # free = the visitor just picked from a list we already searched
            self._spend()
        data, _ = await asyncio.to_thread(self.client.request, SEARCH, {"query": name, "take": take})
        return [e for e in (normalize_entity(r) for r in extract_entities(data)) if e["id"]]

    async def insights(self, category: str, entity_ids: list, take: int = 6) -> dict:
        if category in self.client.unsupported_set():
            raise QlooError(400, _friendly(400))  # already known: costs no budget
        self._spend()
        spellings = [category] + (["videogame"] if category == "video_game" else [])
        last: Optional[QlooError] = None
        for spelling in spellings:
            params = {
                "filter.type": f"urn:entity:{spelling}",
                "signal.interests.entities": ",".join(entity_ids),
                "take": take,
            }
            try:
                data, retrieved = await asyncio.to_thread(self.client.request, INSIGHTS, params)
            except QlooError as exc:
                if exc.status in (400, 403):
                    if spelling != spellings[-1]:
                        last = exc
                        continue
                    # Remember only when Qloo says so in words. A bare 400/403 can be a one-off.
                    if "not supported" in (exc.detail or "").lower():
                        self.client.mark_unsupported(category)
                raise
            entities = [e for e in (normalize_entity(r) for r in extract_entities(data)) if e["id"]]
            return {
                "entities": entities,
                "retrieved": {"endpoint": INSIGHTS, "params": params, "retrievedAt": retrieved},
            }
        raise last or QlooError(403, _friendly(403))
