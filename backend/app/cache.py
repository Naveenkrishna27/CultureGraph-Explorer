"""Private on-disk cache for Qloo responses.

Qloo's terms allow server-side caching but forbid putting response data in a public
repository. The cache folder is git-ignored. Keep it that way.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Optional


class DiskCache:
    def __init__(self, directory: Path):
        self.dir = Path(directory)
        self.dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def make_key(path: str, params: dict) -> str:
        return path + "?" + json.dumps(params, sort_keys=True, separators=(",", ":"))

    def _file(self, key: str) -> Path:
        return self.dir / (hashlib.sha256(key.encode("utf-8")).hexdigest() + ".json")

    def get(self, key: str) -> Optional[dict]:
        try:
            return json.loads(self._file(key).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def set(self, key: str, value: dict) -> None:
        target = self._file(key)
        tmp = target.with_suffix(".tmp")
        try:
            tmp.write_text(json.dumps(value), encoding="utf-8")
            os.replace(tmp, target)
        except OSError:
            pass  # a cache failure must never break a request
