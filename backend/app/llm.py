"""Optional language-model helper. Any failure returns None so the agent falls back to rules.

Providers: anthropic, openai, gemini (plain HTTPS, no extra SDKs). Set LLM_PROVIDER=none to
run without a model: the agent then uses its scoring rules and plain-language templates.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Optional

import requests

log = logging.getLogger("culturegraph.llm")


def parse_json(text: Optional[str]) -> Optional[dict]:
    if not text:
        return None
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        value = json.loads(cleaned[start : end + 1])
    except ValueError:
        return None
    return value if isinstance(value, dict) else None


class LLM:
    def __init__(self, provider: str, api_key: str, model: str, max_calls: int = 8, timeout: int = 30):
        self.provider = provider
        self.api_key = api_key
        self.model = model
        self.max_calls = max_calls
        self.timeout = timeout
        self.calls = 0

    @property
    def enabled(self) -> bool:
        return self.provider != "none" and bool(self.api_key) and bool(self.model)

    async def complete(self, system: str, user: str, want_json: bool = False, max_tokens: int = 300) -> Optional[str]:
        if not self.enabled or self.calls >= self.max_calls:
            return None
        self.calls += 1
        try:
            return await asyncio.to_thread(self._call, system, user, want_json, max_tokens)
        except Exception as exc:  # network, quota, bad model name...
            log.warning("LLM call failed (%s): %s", self.provider, type(exc).__name__)
            return None

    def _call(self, system: str, user: str, want_json: bool, max_tokens: int) -> Optional[str]:
        if self.provider == "anthropic":
            r = requests.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": self.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": self.model, "max_tokens": max_tokens, "system": system,
                      "messages": [{"role": "user", "content": user}]},
                timeout=self.timeout,
            )
            r.raise_for_status()
            return "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")
        if self.provider == "openai":
            body = {"model": self.model,
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
            if want_json:
                body["response_format"] = {"type": "json_object"}
            r = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json=body, timeout=self.timeout,
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
        if self.provider == "gemini":
            config = {"maxOutputTokens": max_tokens}
            if want_json:
                config["responseMimeType"] = "application/json"
            r = requests.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent",
                headers={"x-goog-api-key": self.api_key, "Content-Type": "application/json"},
                json={"systemInstruction": {"parts": [{"text": system}]},
                      "contents": [{"role": "user", "parts": [{"text": user}]}],
                      "generationConfig": config},
                timeout=self.timeout,
            )
            r.raise_for_status()
            parts = r.json()["candidates"][0]["content"]["parts"]
            return "".join(p.get("text", "") for p in parts)
        return None
