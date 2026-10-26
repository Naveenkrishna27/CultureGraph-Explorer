import asyncio
import unittest

from app.warm import warm_cache
from tests.fakes import FakeSession


class WarmTests(unittest.TestCase):
    def test_every_seed_gets_a_journey_and_uses_its_own_session(self):
        sessions = []

        def new_session():
            s = FakeSession()
            sessions.append(s)
            return s

        done = asyncio.run(warm_cache(["Alpha", "Beta", "Gamma"], new_session, pause=0))
        self.assertEqual(done, 3)
        self.assertEqual(len(sessions), 3)
        self.assertTrue(all(s.calls > 1 for s in sessions))     # real queries were made for each

    def test_a_failing_seed_does_not_stop_the_rest(self):
        calls = {"n": 0}

        def new_session():
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("boom")
            return FakeSession()

        done = asyncio.run(warm_cache(["Bad", "Good"], new_session, pause=0))
        self.assertEqual(done, 1)

    def test_an_empty_seed_list_is_a_no_op(self):
        self.assertEqual(asyncio.run(warm_cache([], FakeSession, pause=0)), 0)


if __name__ == "__main__":
    unittest.main()
