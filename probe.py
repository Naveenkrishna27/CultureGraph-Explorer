"""
Day-1 probe for the Qloo hackathon API.

Goal: find out what the API REALLY returns, and which cross-category hops work
(e.g. film -> artist, film -> book, film -> place), before we design anything.

Usage:
    python probe.py                      # seed = Interstellar (movie)
    python probe.py "Daft Punk" artist   # seed name + seed type
    python probe.py "Blade Runner" movie 1   # use the 2nd search result (index 1)

Never commit your .env file or paste your key anywhere.
"""
import json
import os
import re
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

BASE = os.getenv("QLOO_API_URL", "https://hackathon.api.qloo.com").rstrip("/")
KEY = os.getenv("QLOO_API_KEY")
OUT = Path("probe_out")
OUT.mkdir(exist_ok=True)

# Entity types we try as "targets" for a hop from the seed.
TARGET_TYPES = [
    "urn:entity:artist",
    "urn:entity:movie",
    "urn:entity:tv_show",
    "urn:entity:book",
    "urn:entity:brand",
    "urn:entity:place",
    "urn:entity:podcast",
    "urn:entity:video_game",
    "urn:entity:person",
    "urn:entity:destination",
]

SEED_TYPES = {
    "movie": "urn:entity:movie",
    "artist": "urn:entity:artist",
    "book": "urn:entity:book",
    "tv_show": "urn:entity:tv_show",
    "brand": "urn:entity:brand",
    "place": "urn:entity:place",
    "videogame": "urn:entity:video_game",
    "video_game": "urn:entity:video_game",
    "podcast": "urn:entity:podcast",
}

calls_made = 0


def slug(text: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "_", text).strip("_")[:60]


def call(path: str, params: dict, label: str):
    """GET helper. Saves raw JSON to probe_out/ and returns (status, data, seconds)."""
    global calls_made
    calls_made += 1
    started = time.time()
    try:
        resp = requests.get(
            f"{BASE}{path}",
            params=params,
            headers={"X-Api-Key": KEY, "Accept": "application/json"},
            timeout=30,
        )
    except requests.RequestException as exc:
        print(f"  ! network error on {label}: {exc}")
        return None, None, time.time() - started

    elapsed = time.time() - started
    try:
        data = resp.json()
    except ValueError:
        data = {"_non_json_body": resp.text[:500]}

    (OUT / f"{slug(label)}.json").write_text(json.dumps(data, indent=2)[:200_000])

    # Show any rate-limit style headers so we learn our quota early.
    for name, value in resp.headers.items():
        if "rate" in name.lower() or "limit" in name.lower() or "quota" in name.lower():
            print(f"  [header] {name}: {value}")

    return resp.status_code, data, elapsed


def extract_entities(data):
    """Be tolerant: Qloo wraps results differently across endpoints."""
    if not isinstance(data, dict):
        return []
    results = data.get("results", data)
    if isinstance(results, dict):
        for key in ("entities", "results", "items"):
            if isinstance(results.get(key), list):
                return results[key]
        return []
    if isinstance(results, list):
        return results
    return []


def entity_id(e: dict):
    return e.get("entity_id") or e.get("id")


def main():
    if not KEY:
        sys.exit("Missing QLOO_API_KEY. Copy .env.example to .env and add your key.")

    seed_name = sys.argv[1] if len(sys.argv) > 1 else "Interstellar"
    seed_kind = sys.argv[2] if len(sys.argv) > 2 else "movie"
    pick = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    seed_type = SEED_TYPES.get(seed_kind, "urn:entity:movie")

    print(f"\n== 1) SEARCH: '{seed_name}' ({seed_type}) ==")
    # Note: take must be greater than 1 in the Qloo API.
    status, data, secs = call(
        "/search", {"query": seed_name, "types": seed_type, "take": 5}, f"search_{seed_name}"
    )
    print(f"  status={status} time={secs:.2f}s")
    candidates = extract_entities(data)
    if not candidates:
        print("  Nothing with the types filter. Retrying without it (search types differ from insights types)...")
        status, data, secs = call("/search", {"query": seed_name, "take": 5}, f"search_{seed_name}_notypes")
        print(f"  status={status} time={secs:.2f}s")
        candidates = extract_entities(data)
    if not candidates:
        print("  No results parsed. Open probe_out/ and look at the raw JSON,")
        print("  then send me the first ~40 lines (NOT your key).")
        return
    for i, e in enumerate(candidates[:5]):
        pop = e.get("popularity")
        print(f"  [{i}] {e.get('name')}  id={entity_id(e)}  types={e.get('types')}  pop={None if pop is None else round(pop, 3)}  tags={len(e.get('tags') or [])}")

    seed = candidates[min(pick, len(candidates) - 1)]
    seed_id = entity_id(seed)
    print(f"\n  Using seed: {seed.get('name')} ({seed_id})")

    print("\n== 2) HOPS: what can this seed connect to? ==")
    matrix = {}
    first_hit = None  # (type, entity) of the first hop that returned something
    for target in TARGET_TYPES:
        params = {"filter.type": target, "signal.interests.entities": seed_id, "take": 8}
        label = f"insights_{seed_name}_to_{target.split(':')[-1]}"
        status, data, secs = call("/v2/insights", params, label)
        if status != 200 and data is not None:
            print(f"    body: {json.dumps(data)[:200]}")
        if status in (400, 403) and target.endswith("video_game"):
            print(f"  (video_game gave {status}; retrying with the spelling videogame)")
            target = "urn:entity:videogame"
            params["filter.type"] = target
            status, data, secs = call("/v2/insights", params, label + "_alt")
        ents = extract_entities(data)
        if status == 200 and not ents:
            print(f"    empty answer: {json.dumps(data)[:200]}")
        names = [e.get("name") for e in ents][:5]
        matrix[target] = {"status": status, "count": len(ents), "sample": names, "secs": round(secs, 2)}
        if status == 200 and ents and first_hit is None:
            first_hit = (target, ents[0])
        flag = "OK " if status == 200 and ents else "-- "
        print(f"  {flag}{target.split(':')[-1]:<12} status={status} n={len(ents)} {secs:.2f}s  {names}")

    print("\n== 2b) TASTE TAGS and AUDIENCE for the seed (best-guess params; failures are fine) ==")
    # If these work, "why are A and B linked?" can be answered from Qloo's own data
    # (shared taste tags) instead of only from the language model.
    for label, ftype in (("tags", "urn:tag"), ("demographics", "urn:demographics")):
        status, data, secs = call(
            "/v2/insights",
            {"filter.type": ftype, "signal.interests.entities": seed_id, "take": 5},
            f"insights_{seed_name}_{label}",
        )
        preview = json.dumps(data)[:240] if data is not None else "no data"
        print(f"  {label:<13} status={status} {secs:.2f}s  {preview}")
        matrix[ftype] = {"status": status, "secs": round(secs, 2)}

    if first_hit:
        t_type, t_ent = first_hit
        t_id = entity_id(t_ent)
        print(f"\n== 2c) CHECK A HOP TWO WAYS: {seed.get('name')} -> {t_ent.get('name')} (best-guess params) ==")
        # filter.results.entities asks "how strongly does THIS entity match the input?".
        # If it works, the agent can test its own guesses instead of trusting them.
        status, data, secs = call(
            "/v2/insights",
            {"filter.type": t_type, "signal.interests.entities": seed_id, "filter.results.entities": t_id, "take": 2},
            "verify_with_filter_results",
        )
        ents = extract_entities(data)
        print(f"  filter.results.entities  status={status} n={len(ents)} {secs:.2f}s")
        matrix["verify:filter.results.entities"] = {"status": status, "count": len(ents)}
        # compare asks for the tags two entities share or differ on.
        status, data, secs = call(
            "/v2/insights/compare",
            {"a.signal.interests.entities": seed_id, "b.signal.interests.entities": t_id, "filter.type": "urn:tag", "take": 5},
            "compare_seed_vs_first_hit",
        )
        res = data.get("results") if isinstance(data, dict) else None
        shape = {k: (len(v) if isinstance(v, (list, dict)) else v) for k, v in res.items()} if isinstance(res, dict) else "unexpected shape"
        print(f"  compare                  status={status} {secs:.2f}s  result sizes: {shape}")
        matrix["compare"] = {"status": status, "secs": round(secs, 2)}

    print("\n== 3) TAGS SEARCH ==")
    status, data, secs = call("/v2/tags", {"filter.query": "science fiction", "take": 5}, "tags_scifi")
    print(f"  status={status} time={secs:.2f}s")

    (OUT / "capability_matrix.json").write_text(json.dumps(
        {"seed": seed.get("name"), "seed_id": seed_id, "matrix": matrix}, indent=2))

    working = [t.split(":")[-1] for t, v in matrix.items() if v.get("status") == 200 and v.get("count")]
    print(f"\n== SUMMARY ==\n  API calls made: {calls_made}")
    print(f"  Hops that returned results: {working}")
    print("  Empty 200 responses usually mean a parameter was silently ignored. Check the")
    print("  Entity Type Parameter Guide before blaming the data.")
    print("  Raw responses are saved in ./probe_out/ (git-ignored). NEVER commit them: Qloo's")
    print("  terms say response data must not be stored in a public repository.")
    print("  Send me this summary + the first ~40 lines of one insights JSON (never your key).")


if __name__ == "__main__":
    main()
