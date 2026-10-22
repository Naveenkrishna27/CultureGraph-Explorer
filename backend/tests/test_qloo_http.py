"""Runs the real Qloo client against a local stub server that imitates the API shape."""
import asyncio
import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from app.cache import DiskCache
from app.qloo import BudgetExceeded, QlooClient, QlooError, category_from_types, category_of, extract_entities, normalize_entity

HITS = []
STATE = {"tv_429_sent": False}


class Stub(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("X-Month-RateLimit-Remaining", "1234")
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        HITS.append((url.path, q, self.headers.get("X-Api-Key")))
        if self.headers.get("X-Api-Key") != "test-key":
            return self._send(401, {"message": "No API key found in request"})
        if url.path == "/search":
            return self._send(200, {"results": [{"entity_id": "id-1", "name": "Stub Film", "types": ["urn:entity", "urn:entity:movie"],
                                                  "properties": {"description": "A stub."}}]})
        if url.path == "/v2/insights":
            ftype = q.get("filter.type", "")
            if ftype == "urn:entity:video_game":
                return self._send(400, {"message": "Bad request"})   # the real API answered 400 here
            if ftype == "urn:entity:tv_show" and not STATE["tv_429_sent"]:
                STATE["tv_429_sent"] = True
                return self._send(429, {"message": "Too many requests"})
            if ftype == "urn:entity:podcast":
                return self._send(200, {"success": True, "results": {"entities": []}})
            if ftype == "urn:entity:person":
                return self._send(400, {"errors": [{"message": "The value urn:entity:person is not supported for filter.type"}]})
            if ftype == "urn:entity:destination":
                return self._send(400, {"errors": [{"message": "Bad parameter"}]})   # a one-off, not "unsupported"
            # Same shape the real API uses for insights: type is generic, the category is in subtype.
            return self._send(200, {"success": True, "results": {"entities": [
                {"entity_id": "id-2", "name": "Stub Band", "type": "urn:entity", "subtype": "urn:entity:artist",
                 "query": {"affinity": 0.83}, "tags": [{"id": "urn:tag:genre:qloo:ambient", "name": "Ambient", "type": "urn:tag:genre:qloo"}]}]}})
        self._send(404, {})


class QlooHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Stub)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        HITS.clear()
        self.tmp = tempfile.TemporaryDirectory()
        self.client = QlooClient(self.base, "test-key", DiskCache(self.tmp.name), timeout=5)

    def tearDown(self):
        self.tmp.cleanup()

    def test_search_and_insights_send_key_in_header_and_parse(self):
        async def go():
            s = self.client.session(12)
            found = await s.search("stub")
            res = await s.insights("artist", [found[0]["id"]])
            return found, res, s.calls
        found, res, calls = asyncio.run(go())
        self.assertEqual(found[0]["category"], "movie")
        self.assertEqual(res["entities"][0]["score"], 0.83)
        self.assertEqual(res["retrieved"]["params"]["filter.type"], "urn:entity:artist")
        self.assertEqual(calls, 2)
        self.assertTrue(all(h[2] == "test-key" for h in HITS))
        self.assertNotIn("test-key", json.dumps(res))      # the key never reaches the browser

    def test_second_identical_call_is_served_from_private_cache(self):
        async def go():
            s = self.client.session(12)
            await s.insights("artist", ["id-1"])
            await s.insights("artist", ["id-1"])
        asyncio.run(go())
        self.assertEqual(len([h for h in HITS if h[0] == "/v2/insights"]), 1)

    def test_empty_answers_are_not_cached(self):
        async def go():
            s = self.client.session(12)
            await s.insights("podcast", ["id-1"])
            await s.insights("podcast", ["id-1"])
        asyncio.run(go())
        self.assertEqual(len([h for h in HITS if h[0] == "/v2/insights"]), 2)

    def test_video_game_falls_back_to_other_spelling(self):
        async def go():
            return await self.client.session(12).insights("video_game", ["id-1"])
        res = asyncio.run(go())
        self.assertEqual(res["retrieved"]["params"]["filter.type"], "urn:entity:videogame")

    def test_per_second_limit_is_retried_and_quota_is_tracked(self):
        STATE["tv_429_sent"] = False
        async def go():
            return await self.client.session(12).insights("tv_show", ["id-1"])
        res = asyncio.run(go())
        self.assertEqual(res["entities"][0]["name"], "Stub Band")
        self.assertEqual(len([h for h in HITS if h[1].get("filter.type") == "urn:entity:tv_show"]), 2)
        self.assertEqual(self.client.month_remaining, 1234)

    def test_requests_are_spaced_out(self):
        import time
        from app.qloo import Pacer
        pacer = Pacer(per_second=20)
        started = time.monotonic()
        for _ in range(5):
            pacer.wait()
        self.assertGreaterEqual(time.monotonic() - started, 0.18)

    def test_bad_key_gives_friendly_error(self):
        bad = QlooClient(self.base, "wrong", DiskCache(self.tmp.name), timeout=5)
        with self.assertRaises(QlooError) as ctx:
            asyncio.run(bad.session(5).search("x"))
        self.assertEqual(ctx.exception.status, 401)
        self.assertNotIn("wrong", ctx.exception.message)

    def test_budget_is_enforced(self):
        async def go():
            s = self.client.session(1)
            await s.search("a")
            await s.search("b")
        with self.assertRaises(BudgetExceeded):
            asyncio.run(go())

    def test_insights_result_category_comes_from_subtype(self):
        async def go():
            return await self.client.session(12).insights("artist", ["id-1"])
        res = asyncio.run(go())
        self.assertEqual(res["entities"][0]["category"], "artist")   # not "other"
        self.assertEqual(res["entities"][0]["tags"], [{"name": "Ambient", "group": "genre"}])

    def test_unsupported_category_is_remembered_and_costs_no_budget(self):
        async def first():
            await self.client.session(12).insights("person", ["id-1"])
        with self.assertRaises(QlooError):
            asyncio.run(first())
        hits_after_first = len(HITS)
        second = self.client.session(5)
        async def again():
            await second.insights("person", ["id-1"])
        with self.assertRaises(QlooError):
            asyncio.run(again())
        self.assertEqual(second.calls, 0)
        self.assertEqual(len(HITS), hits_after_first)    # no network call either

    def test_a_bare_400_is_not_remembered_as_unsupported(self):
        async def once():
            await self.client.session(12).insights("destination", ["id-1"])
        for _ in range(2):
            with self.assertRaises(QlooError):
                asyncio.run(once())
        self.assertEqual(len([h for h in HITS if h[1].get("filter.type") == "urn:entity:destination"]), 2)
        self.assertEqual(self.client.unsupported_set(), set())

    def test_real_response_shape_is_parsed(self):
        raw = {
            "name": "Jóhann Jóhannsson", "entity_id": "5AD69C26", "type": "urn:entity", "subtype": "urn:entity:artist",
            "properties": {
                "description": "A very long description. " * 20,
                "short_descriptions": [
                    {"value": "Compositor islandés.", "languages": ["es"]},
                    {"value": "Icelandic composer known for film scores.", "languages": ["en"]},
                ],
            },
            "tags": [
                {"id": "urn:tag:genre:qloo:ambient", "name": "Ambient", "type": "urn:tag:genre:qloo"},
                {"id": "urn:tag:genre:music:ambient", "name": "Ambient", "type": "urn:tag:genre:music"},
                {"id": "urn:tag:obscurity:qloo:3", "name": "3", "type": "urn:tag:obscurity:qloo"},
                {"id": "urn:tag:audience:qloo:cultured", "name": "Cultured", "type": "urn:tag:audience:qloo"},
            ],
            "query": {"affinity": 0.9407},
        }
        e = normalize_entity(raw)
        self.assertEqual(e["category"], "artist")
        self.assertEqual(e["blurb"], "Icelandic composer known for film scores.")
        self.assertEqual(e["score"], 0.9407)
        self.assertEqual(e["tags"], [{"name": "Ambient", "group": "genre"}, {"name": "Cultured", "group": "audience"}])
        self.assertEqual(category_of({"types": ["urn:entity:movie"]}), "movie")   # search shape

    def test_html_and_boilerplate_never_reach_the_blurb(self):
        junk = {"entity_id": "x", "name": "N", "subtype": "urn:entity:book", "properties": {
            "description": 'Alternate covers of this ISBN can be found <a href="https://www.goodreads.com/book/show/4671">here</a> and <a href="http'}}
        self.assertEqual(normalize_entity(junk)["blurb"], "")
        html = {"entity_id": "x", "name": "N", "subtype": "urn:entity:book", "properties": {
            "description": "A <b>fine</b> novel. See https://example.com/x for more."}}
        blurb = normalize_entity(html)["blurb"]
        self.assertNotIn("<", blurb)
        self.assertNotIn("http", blurb)
        self.assertEqual(blurb, "A fine novel. See for more.")

    def test_popularity_is_read_when_present(self):
        self.assertEqual(normalize_entity({"entity_id": "x", "name": "N", "popularity": 0.99})["popularity"], 0.99)
        self.assertIsNone(normalize_entity({"entity_id": "x", "name": "N"})["popularity"])

    def test_parsing_helpers(self):
        self.assertEqual(category_from_types(["urn:entity", "urn:entity:videogame"]), "video_game")
        self.assertEqual(extract_entities({"results": [{"a": 1}]}), [{"a": 1}])
        self.assertEqual(extract_entities({"results": {"entities": [{"b": 2}]}}), [{"b": 2}])
        self.assertEqual(extract_entities("junk"), [])
        self.assertEqual(normalize_entity({"entity_id": "x", "name": "N", "types": ["urn:entity:book"]})["category"], "book")


if __name__ == "__main__":
    unittest.main()
