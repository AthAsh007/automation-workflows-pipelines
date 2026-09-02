"""Route each item into one of N buckets, with a refusal bucket that is used.

    python -m classify.run --input samples/support-tickets.json --dry-run

The buckets, and the rule for each, live in buckets.json next to this file. Edit
that; the code does not change per use case.

Two properties worth keeping if you adapt this:

  * `unknown` is a real bucket, not an error path. A classifier with no way to
    say "I do not know" says something else instead, confidently.
  * The confidence floor is applied after the model answers. Anything below it is
    rewritten to `unknown` and flagged, so the threshold is a policy decision in
    one place rather than a number the model was asked to respect.
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

INSTRUCTIONS = """You classify a single item into exactly one bucket.

The buckets, and the rule for each:
{buckets}

Answer with JSON only:
  {{"bucket": "<one of the bucket ids above>",
    "confidence": <0-100 integer, how certain you are>,
    "reason": "<one sentence, under 200 characters, quoting the phrase that decided it>"}}

Rules:
- Pick exactly one bucket. If two fit, pick the one whose rule matches more
  specifically, and say so in the reason.
- Use "unknown" when the item does not match any rule, or when it is too short or
  too ambiguous to place. "unknown" is a correct answer, not a failure.
- Confidence is about the classification, not about how strongly the item is
  worded. An angry message that clearly belongs in one bucket is high confidence.
- The reason must quote from the item. Do not invent detail that is not there."""


def schema(bucket_ids: list[str]) -> dict:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["bucket", "confidence", "reason"],
        "properties": {
            "bucket": {"type": "string", "enum": bucket_ids},
            "confidence": {"type": "integer", "minimum": 0, "maximum": 100},
            "reason": {"type": "string", "minLength": 3, "maxLength": 200},
        },
    }


def load_buckets(path: Path) -> tuple[list[dict], str, list[str]]:
    buckets = json.loads(path.read_text(encoding="utf-8"))["buckets"]
    ids = [b["id"] for b in buckets]
    if "unknown" not in ids:
        buckets.append({"id": "unknown",
                        "rule": "Nothing above applies, or the item is too ambiguous to place."})
        ids.append("unknown")
    rendered = "\n".join("- %s: %s" % (b["id"], b["rule"]) for b in buckets)
    return buckets, rendered, ids


def classify_one(client, item_text: str, rendered: str, ids: list[str],
                 floor: int) -> dict:
    system, user = prepare(
        INSTRUCTIONS.format(buckets=rendered),
        item_text,
        "Classify the item below.",
    )
    try:
        value, attempts = complete_validated(client, system, user, schema(ids),
                                             max_tokens=300)
    except (ValidationError, ValueError, LLMError) as exc:
        # The deterministic fallback. The pipeline completes; a human sees it.
        return {"bucket": "unknown", "confidence": 0,
                "reason": "classification failed: %s" % str(exc)[:150],
                "needs_review": True, "attempts": 2}

    if value["confidence"] < floor:
        value = dict(value)
        value["reason"] = ("below the confidence floor of %d: %s"
                           % (floor, value["reason"]))[:200]
        value["bucket"] = "unknown"
    value["needs_review"] = value["bucket"] == "unknown"
    value["attempts"] = attempts
    return value


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--input", required=True,
                    help="JSON file: a list of {id, text} objects")
    ap.add_argument("--buckets", default=str(HERE / "buckets.json"))
    ap.add_argument("--field", default="text", help="which key holds the text")
    ap.add_argument("--floor", type=int, default=55,
                    help="confidence below this is rewritten to unknown")
    ap.add_argument("--dry-run", action="store_true",
                    help="replay recorded responses, make no network call")
    ap.add_argument("--out", default="", help="write results here as JSON")
    args = ap.parse_args(argv)

    _, rendered, ids = load_buckets(Path(args.buckets))
    items = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if isinstance(items, dict):
        items = items.get("items", [])

    client = Client(cassette_dir=HERE.parent / "samples" / "cassettes" / "classify",
                    dry_run=args.dry_run)

    results, counts = [], {}
    for item in items:
        verdict = classify_one(client, str(item.get(args.field, "")), rendered,
                               ids, args.floor)
        results.append({"id": item.get("id"), **verdict})
        counts[verdict["bucket"]] = counts.get(verdict["bucket"], 0) + 1

    review = sum(1 for r in results if r["needs_review"])
    print("classified %d item(s) in %d model call(s)" % (len(results), client.calls))
    for bucket in sorted(counts, key=lambda b: -counts[b]):
        print("  %-24s %d" % (bucket, counts[bucket]))
    print("  %-24s %d" % ("flagged for review", review))

    if args.out:
        Path(args.out).write_text(json.dumps(results, indent=2, ensure_ascii=False),
                                  encoding="utf-8")
        print("wrote %s" % args.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
