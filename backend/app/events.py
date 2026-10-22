"""Builds the streaming events the front end understands (see frontend/src/lib/contract.js)."""
from __future__ import annotations

import uuid
from typing import Optional


def _sid() -> str:
    return "s" + uuid.uuid4().hex[:8]


def step(type_: str, title: str, detail: Optional[str] = None, tool: Optional[str] = None, calls: Optional[int] = None) -> dict:
    s = {"id": _sid(), "type": type_, "title": title}
    if detail:
        s["detail"] = detail
    if tool:
        s["tool"] = tool
    if calls is not None:
        s["calls"] = calls
    return {"type": "step", "step": s}


def node(ent: dict, role: str, depth: int) -> dict:
    return {
        "type": "node",
        "node": {
            "id": ent["id"],
            "name": ent["name"],
            "category": ent["category"],
            "role": role,
            "depth": depth,
            "blurb": ent.get("blurb") or "",
            "qlooId": ent["id"],
        },
    }


def edge(source: dict, target: dict, score, retrieved: dict, interpretation: str, kind: str = "direct",
         shared_tags=None, target_tags=None, interpreted_by: Optional[str] = None) -> dict:
    e = {
        "id": f"{source['id']}__{target['id']}",
        "source": source["id"],
        "target": target["id"],
        "kind": kind,
        "crossCategory": source["category"] != target["category"],
        "interpretation": interpretation,
    }
    if score is not None:
        e["score"] = round(float(score), 4)
    if retrieved:
        e["retrieved"] = retrieved
    if interpreted_by:
        e["interpretedBy"] = interpreted_by   # "template" (app wording) or "model" (language model)
    if shared_tags:
        e["sharedTags"] = list(shared_tags)
    if target_tags:
        e["targetTags"] = list(target_tags)
    return {"type": "edge", "edge": e}


def budget(used: int, max_: int) -> dict:
    return {"type": "budget", "used": used, "max": max_}


def done(path: Optional[list] = None, summary: Optional[str] = None) -> dict:
    d: dict = {"type": "done"}
    if path:
        d["path"] = path
    if summary:
        d["summary"] = summary
    return d


def error(message: str) -> dict:
    return {"type": "error", "message": message}


def status(message: str) -> dict:
    """A short 'what I am doing right now' line for the map. Not saved in the log."""
    return {"type": "status", "message": message}


def choices(query: str, options: list) -> dict:
    """The name matched several things. The visitor picks one."""
    return {"type": "choices", "query": query, "options": options}
