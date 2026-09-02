"""A small client for any OpenAI-compatible chat completions endpoint.

Deliberately not a framework. It does four things: build the request, enforce a
call ceiling, retry on the failures that are worth retrying, and record or replay
responses so a pipeline can run with no network at all.

Configuration comes from the environment. See .env.example.
"""

from __future__ import annotations

import hashlib
import json
import os
import random
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError:  # --dry-run does not need it
    requests = None


class LLMError(RuntimeError):
    """A call failed in a way the pipeline has to handle."""


class CallBudgetExceeded(LLMError):
    """The run hit its ceiling. Almost always a loop that is not terminating."""


# Retrying a 400 just burns the budget: the request is wrong and will stay wrong.
RETRYABLE_STATUS = {408, 409, 425, 429, 500, 502, 503, 504}


@dataclass
class Config:
    base_url: str = ""
    api_key: str = ""
    model: str = ""
    model_large: str = ""
    timeout: int = 60
    max_calls: int = 200

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            base_url=os.environ.get("LLM_BASE_URL", "http://localhost:11434/v1").rstrip("/"),
            api_key=os.environ.get("LLM_API_KEY", ""),
            model=os.environ.get("LLM_MODEL", "qwen2.5:7b-instruct"),
            model_large=os.environ.get("LLM_MODEL_LARGE", ""),
            timeout=int(os.environ.get("LLM_TIMEOUT", "60")),
            max_calls=int(os.environ.get("LLM_MAX_CALLS", "200")),
        )


@dataclass
class Client:
    config: Config = field(default_factory=Config.from_env)
    cassette_dir: Path | None = None
    dry_run: bool = False
    calls: int = 0

    # -- recording ---------------------------------------------------------

    # The untrusted-content delimiter is random per call by design, so it has to
    # be normalised out before hashing or no two runs would ever share a key.
    _TAG = re.compile(r"UNTRUSTED_[0-9A-F]{16}")

    def _key(self, payload: dict[str, Any]) -> str:
        stable = json.dumps(payload, sort_keys=True, ensure_ascii=False)
        stable = self._TAG.sub("UNTRUSTED_TAG", stable)
        return hashlib.sha256(stable.encode("utf-8")).hexdigest()[:16]

    def _cassette(self, key: str) -> Path | None:
        if self.cassette_dir is None:
            return None
        return self.cassette_dir / (key + ".json")

    # -- the call ----------------------------------------------------------

    def complete(
        self,
        system: str,
        user: str,
        *,
        large: bool = False,
        temperature: float = 0.0,
        max_tokens: int = 1024,
        json_object: bool = True,
    ) -> str:
        """Return the assistant's message content as a string.

        `json_object` asks the endpoint for JSON mode where it supports it. Not
        every server does, which is why the caller still validates and repairs.
        """
        if self.calls >= self.config.max_calls:
            raise CallBudgetExceeded(
                "run hit LLM_MAX_CALLS=%d. Check for a loop that is not terminating."
                % self.config.max_calls
            )

        model = self.config.model_large or self.config.model if large else self.config.model
        payload: dict[str, Any] = {
            "model": model,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        if json_object:
            payload["response_format"] = {"type": "json_object"}

        key = self._key(payload)
        cassette = self._cassette(key)

        if self.dry_run:
            if cassette is not None and cassette.exists():
                self.calls += 1
                return json.loads(cassette.read_text(encoding="utf-8"))["content"]
            raise LLMError(
                "dry run has no recorded response for this request (%s). "
                "Run once without --dry-run to record it, or add the cassette by hand." % key
            )

        content = self._post(payload)
        self.calls += 1
        if cassette is not None:
            cassette.parent.mkdir(parents=True, exist_ok=True)
            cassette.write_text(
                json.dumps({"request": payload, "content": content}, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
        return content

    def _post(self, payload: dict[str, Any], attempts: int = 4) -> str:
        if requests is None:
            raise LLMError("requests is not installed. pip install -r requirements.txt")
        url = self.config.base_url + "/chat/completions"
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = "Bearer " + self.config.api_key

        last = None
        for attempt in range(attempts):
            try:
                r = requests.post(url, headers=headers, json=payload,
                                  timeout=self.config.timeout)
            except Exception as exc:  # network layer, worth one more try
                last = exc
            else:
                if r.status_code == 200:
                    body = r.json()
                    try:
                        return body["choices"][0]["message"]["content"] or ""
                    except (KeyError, IndexError, TypeError):
                        raise LLMError("unexpected response shape: %s" % json.dumps(body)[:400])
                if r.status_code not in RETRYABLE_STATUS:
                    raise LLMError("%s returned %d: %s"
                                   % (url, r.status_code, r.text[:400]))
                last = LLMError("%d from %s" % (r.status_code, url))

            if attempt < attempts - 1:
                # Full jitter. A fixed backoff synchronises every worker onto the
                # same retry instant, which is how a recovering endpoint gets
                # knocked over a second time.
                time.sleep(random.uniform(0, min(8.0, 0.5 * (2 ** attempt))))

        raise LLMError("gave up after %d attempts: %s" % (attempts, last))
