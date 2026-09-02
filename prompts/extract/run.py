"""Turn unstructured text into a validated record, with per-field confidence.

    python -m extract.run --input samples/enquiries.txt --schema extract/schemas/enquiry.json --dry-run

The schema file is the contract. It is used three ways: rendered into the prompt
so the model knows the shape, enforced after the response so nothing invalid gets
through, and quoted back in the repair message when validation fails.

The rule that matters: a field the text does not support is null, not a guess.
Extraction pipelines fail in production by inventing a plausible value for a field
that was never there, and a null is recoverable where a confident invention is not.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.client import Client, LLMError            # noqa: E402
from lib.schema import ValidationError, complete_validated  # noqa: E402
from lib.untrusted import prepare                  # noqa: E402

HERE = Path(__file__).resolve().parent

INSTRUCTIONS = """You extract a structured record from a piece of text.

Return JSON matching exactly this schema:
{schema}

Rules, in order of importance:
1. Every value must be supported by the text. If the text does not state a field,
   return null for it. Never infer, never complete a partial value, never use
   general knowledge about the world to fill a gap.
2. Return every key in the schema, including the ones you set to null.
3. Copy values as written, then normalise only the format: trim whitespace,
   lowercase email addresses and domains, keep phone digits and the leading +.
   Do not rewrite, translate, expand an abbreviation or correct a spelling.
4. `field_confidence` holds one 0-100 integer per extracted field. Score how
   clearly the text states that field, not how plausible the value looks. A field
   you set to null scores 0.
5. `quotes` holds the exact substring you took each non-null value from. If you
   cannot quote it, the field is not supported and belongs at null."""


def render_schema(schema: dict) -> str:
    lines = []
    for name, spec in schema.get("properties", {}).items():
        if name in ("field_confidence", "quotes"):
            continue
        bits = [spec.get("type", "any")]
        if spec.get("nullable"):
            bits.append("or null")
        if "enum" in spec:
            bits.append("one of " + json.dumps(spec["enum"]))
        note = spec.get("description", "")
        lines.append("  %-18s %s%s" % (name, " ".join(bits), "  # " + note if note else ""))
    return "{\n" + "\n".join(lines) + "\n  field_confidence   object, one 0-100 integer per field above" \
           "\n  quotes             object, the exact substring each non-null value came from\n}"


def build_full_schema(user_schema: dict) -> dict:
    """Add the confidence and quote objects the pipeline always requires."""
    full = json.loads(json.dumps(user_schema))
    props = full.setdefault("properties", {})
    field_names = [k for k in props if k not in ("field_confidence", "quotes")]
    props["field_confidence"] = {
        "type": "object",
        "properties": {k: {"type": "integer", "minimum": 0, "maximum": 100}
                       for k in field_names},
        "required": field_names,
    }
    props["quotes"] = {
        "type": "object",
        "properties": {k: {"type": "string", "nullable": True} for k in field_names},
    }
    full["required"] = sorted(set(full.get("required", []) + field_names
                                  + ["field_confidence", "quotes"]))
    full["additionalProperties"] = False
    return full


def empty_record(user_schema: dict, note: str) -> dict:
    names = [k for k in user_schema.get("properties", {})
             if k not in ("field_confidence", "quotes")]
    return {
        **{k: None for k in names},
        "field_confidence": {k: 0 for k in names},
        "quotes": {k: None for k in names},
        "needs_review": True,
        "extraction_note": note[:200],
    }


def verify_quotes(record: dict, source: str) -> list[str]:
    """A quote the source does not contain means the value was invented.

    This is the check that catches the failure mode the rules are aimed at, and
    it costs nothing: the model has already told you where it claims to have read
    each value.
    """
    bad = []
    haystack = " ".join(source.split()).lower()
    for field, quote in (record.get("quotes") or {}).items():
        if not quote:
            continue
        if " ".join(str(quote).split()).lower() not in haystack:
            bad.append(field)
    return bad


def extract_one(client, text: str, user_schema: dict, full_schema: dict,
                floor: int) -> dict:
    system, user = prepare(
        INSTRUCTIONS.format(schema=render_schema(user_schema)),
        text,
        "Extract the record from the text below.",
    )
    try:
        record, attempts = complete_validated(client, system, user, full_schema,
                                              max_tokens=900)
    except (ValidationError, ValueError, LLMError) as exc:
        return empty_record(user_schema, "extraction failed: %s" % exc)

    record = dict(record)
    record["attempts"] = attempts

    unsupported = verify_quotes(record, text)
    for field in unsupported:
        # The model quoted something the source does not contain. Drop the value.
        record[field] = None
        record["field_confidence"][field] = 0
        record["quotes"][field] = None

    low = [f for f, c in record["field_confidence"].items() if 0 < c < floor]
    record["unsupported_fields"] = unsupported
    record["low_confidence_fields"] = low
    record["needs_review"] = bool(unsupported or low)
    return record


def read_items(path: Path) -> list[dict]:
    if path.suffix.lower() == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else data.get("items", [])
    # A text file: records separated by a line of three or more dashes.
    chunks = [c.strip() for c in
              __import__("re").split(r"\n-{3,}\n", path.read_text(encoding="utf-8"))]
    return [{"id": "item-%d" % (i + 1), "text": c} for i, c in enumerate(chunks) if c]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--input", required=True)
    ap.add_argument("--schema", default=str(HERE / "schemas" / "enquiry.json"))
    ap.add_argument("--field", default="text")
    ap.add_argument("--floor", type=int, default=50,
                    help="per-field confidence below this is flagged for review")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out", default="")
    args = ap.parse_args(argv)

    user_schema = json.loads(Path(args.schema).read_text(encoding="utf-8"))
    full_schema = build_full_schema(user_schema)
    items = read_items(Path(args.input))

    client = Client(cassette_dir=HERE.parent / "samples" / "cassettes" / "extract",
                    dry_run=args.dry_run)

    results = []
    for item in items:
        text = str(item.get(args.field, ""))
        record = extract_one(client, text, user_schema, full_schema, args.floor)
        results.append({"id": item.get("id"), **record})

    review = sum(1 for r in results if r["needs_review"])
    dropped = sum(len(r.get("unsupported_fields") or []) for r in results)
    print("extracted %d record(s) in %d model call(s)" % (len(results), client.calls))
    print("  %-28s %d" % ("flagged for review", review))
    print("  %-28s %d" % ("values dropped as unquotable", dropped))

    if args.out:
        Path(args.out).write_text(json.dumps(results, indent=2, ensure_ascii=False),
                                  encoding="utf-8")
        print("wrote %s" % args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
