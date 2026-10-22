"""Synthetic stand-ins for tests. None of this is Qloo data."""
from app.qloo import BudgetExceeded, QlooError


def ent(id_, name, cat, score=0.8, tags=(), popularity=None, blurb=""):
    return {"id": id_, "name": name, "category": cat, "blurb": blurb, "score": score, "popularity": popularity,
            "tags": [{"name": t, "group": "style"} for t in tags]}


# Parent id -> category -> entities that "Qloo" would return.
GRAPH = {
    "seed": {
        "artist": [ent("a1", "Artist One", "artist", 0.9, ("Cinematic", "Atmospheric")), ent("a2", "Artist Two", "artist", 0.7)],
        "movie": [ent("m1", "Film One", "movie", 0.85)],
        "tv_show": [ent("t1", "Show One", "tv_show", 0.8)],
        "book": [ent("b1", "Book One", "book", 0.75)],
    },
    "a1": {
        "brand": [ent("br1", "Brand One", "brand", 0.6), ent("br2", "Brand Two", "brand", 0.7)],
        "place": [ent("p1", "Place One", "place", 0.5)],
    },
    "br1": {"book": [ent("b9", "Book Nine", "book", 0.55)], "podcast": [ent("pc1", "Cast One", "podcast", 0.5)]},
    "br2": {"book": [ent("b9", "Book Nine", "book", 0.55)], "podcast": [ent("pc1", "Cast One", "podcast", 0.5)]},
}


class FakeSession:
    def __init__(self, max_calls=12, calls=0, graph=None, unsupported=(), unsupported_status=403, search_results=None):
        self.max_calls, self.calls = max_calls, calls
        self.graph = graph if graph is not None else GRAPH
        self.rejects = set(unsupported)   # categories this fake refuses (the real session learns its own set)
        self.unsupported_status = unsupported_status
        self.search_results = search_results
        self.free_searches = 0

    @property
    def remaining(self):
        return max(0, self.max_calls - self.calls)

    def _spend(self):
        if self.calls >= self.max_calls:
            raise BudgetExceeded()
        self.calls += 1

    async def search(self, name, take=5, free=False):
        if free:
            self.free_searches += 1
        else:
            self._spend()
        if self.search_results is not None:
            return [dict(r) for r in self.search_results]
        if name.lower().strip() == "nothing":
            return []
        return [ent("seed", name.title(), "movie", tags=("Cinematic", "Sci-Fi"))]

    async def insights(self, category, entity_ids, take=6):
        self._spend()
        if category in self.rejects:
            raise QlooError(self.unsupported_status, "unsupported")
        items = [dict(e) for e in self.graph.get(entity_ids[0], {}).get(category, [])]
        return {
            "entities": items,
            "retrieved": {
                "endpoint": "/v2/insights",
                "params": {"filter.type": f"urn:entity:{category}", "signal.interests.entities": entity_ids[0]},
                "retrievedAt": "2026-01-01T00:00:00+00:00",
            },
        }


class StubLLM:
    """Returns whatever text it is given, so tests can try good and bad model replies."""

    def __init__(self, replies=None, enabled=True):
        self.replies = list(replies or [])
        self._enabled = enabled
        self.calls = 0

    @property
    def enabled(self):
        return self._enabled

    async def complete(self, system, user, want_json=False, max_tokens=300):
        self.calls += 1
        self.last_user = user
        return self.replies.pop(0) if self.replies else None


class NoLLM(StubLLM):
    def __init__(self):
        super().__init__(enabled=False)
