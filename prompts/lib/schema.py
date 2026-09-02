"""Validate model output against a schema, and repair it once.

A dependency-free subset of JSON Schema: enough to constrain what a model may
return, small enough to read. Supported keywords are `type`, `properties`,
`required`, `enum`, `items`, `minimum`, `maximum`, `minLength`, `maxLength`,
`additionalProperties` and `nullable`.

The point is not schema completeness. It is that a validation failure produces a
message specific enough to hand back to the model as a repair instruction.
"""

from __future__ import annotations

import json
import re
from typing import Any

TYPES = {
    "string": str,
    "number": (int, float),
    "integer": int,
    "boolean": bool,
    "object": dict,
    "array": list,
}


class ValidationError(ValueError):
    """Carries every problem found, not just the first."""

    def __init__(self, problems: list[str]):
        self.problems = problems
        super().__init__("; ".join(problems))


def _check(value: Any, schema: dict, path: str, out: list[str]) -> None:
    if value is None and schema.get("nullable"):
        return

    expected = schema.get("type")
    if expected:
        py = TYPES.get(expected)
        # bool is a subclass of int in Python, and a model returning true where a
        # score belongs is exactly the mistake worth catching.
        if expected in ("number", "integer") and isinstance(value, bool):
            out.append("%s must be a %s, got a boolean" % (path, expected))
            return
        if py and not isinstance(value, py):
            out.append("%s must be a %s, got %s"
                       % (path, expected, type(value).__name__))
            return

    if "enum" in schema and value not in schema["enum"]:
        out.append("%s must be one of %s, got %r"
                   % (path, json.dumps(schema["enum"]), value))

    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            out.append("%s must be at least %d characters" % (path, schema["minLength"]))
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            out.append("%s must be at most %d characters" % (path, schema["maxLength"]))
        if "pattern" in schema and not re.search(schema["pattern"], value):
            out.append("%s must match %s" % (path, schema["pattern"]))

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            out.append("%s must be at least %s" % (path, schema["minimum"]))
        if "maximum" in schema and value > schema["maximum"]:
            out.append("%s must be at most %s" % (path, schema["maximum"]))

    if isinstance(value, dict):
        props = schema.get("properties", {})
        for key in schema.get("required", []):
            if key not in value:
                out.append("%s is missing required key %r" % (path, key))
        if schema.get("additionalProperties") is False:
            for key in value:
                if key not in props:
                    out.append("%s has an unexpected key %r. Allowed: %s"
                               % (path, key, ", ".join(sorted(props)) or "none"))
        for key, sub in props.items():
            if key in value:
                _check(value[key], sub, "%s.%s" % (path, key) if path != "$" else key, out)

    if isinstance(value, list) and "items" in schema:
        for i, item in enumerate(value):
            _check(item, schema["items"], "%s[%d]" % (path, i), out)


def validate(value: Any, schema: dict) -> None:
    """Raise ValidationError listing every problem, or return None."""
    problems: list[str] = []
    _check(value, schema, "$", problems)
    if problems:
        raise ValidationError(problems)


FENCE = re.compile(r"```(?:json)?\s*(.+?)\s*```", re.S)


def parse_json(text: str) -> Any:
    """Pull a JSON value out of a model response.

    Models wrap JSON in prose and fences even when told not to, and refusing to
    handle that just means paying for a repair call to fix punctuation.
    """
    text = (text or "").strip()
    if not text:
        raise ValueError("model returned an empty response")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = FENCE.search(text)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    # Last resort: the outermost balanced object or array.
    for opener, closer in (("{", "}"), ("[", "]")):
        start, end = text.find(opener), text.rfind(closer)
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                continue
    raise ValueError("no JSON value found in the response: %r" % text[:200])


REPAIR = """Your previous response did not satisfy the required schema.

Your response was:
{previous}

The problems were:
{problems}

Return corrected JSON only. No prose, no code fence, no explanation. Every key in
the schema must be present, and every value must satisfy its constraint."""


def complete_validated(client, system: str, user: str, schema: dict, *,
                       large: bool = False, temperature: float = 0.0,
                       max_tokens: int = 1024) -> tuple[Any, int]:
    """Call, parse, validate, and repair once. Returns (value, attempts).

    Raises ValidationError if the repair also fails. The caller is expected to
    catch that and use its deterministic fallback: a pipeline that stops because
    a model produced bad JSON twice is worse than one that records low confidence
    and carries on.
    """
    text = client.complete(system, user, large=large, temperature=temperature,
                           max_tokens=max_tokens)
    try:
        value = parse_json(text)
        validate(value, schema)
        return value, 1
    except (ValueError, ValidationError) as first:
        problems = (first.problems if isinstance(first, ValidationError)
                    else [str(first)])

    repair_user = REPAIR.format(
        previous=text[:2000],
        problems="\n".join("- " + p for p in problems),
    )
    text2 = client.complete(system, repair_user, large=large,
                            temperature=temperature, max_tokens=max_tokens)
    value = parse_json(text2)          # a parse failure here is a real error
    validate(value, schema)            # so is a second validation failure
    return value, 2
