"""Score a draft against a rubric and return line-level notes.

    python -m review.run --input samples/draft-copy.md --rubric review/rubrics/copy.json --dry-run

Deterministic checks run first and are not delegated to the model. A regex knows
whether an em dash is present; asking a model costs money and is less reliable.
The model is used only for the criteria that need judgement, and it is given the
deterministic findings so it does not spend its attention re-finding them.

The output is per-criterion scores plus notes anchored to a line number, so the
result can be rendered as review comments rather than as a paragraph of opinion.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.client import Client, LLMError            # noqa: E402
from lib.schema import ValidationError, complete_validated  # noqa: E402
from lib.untrusted import prepare                  # noqa: E402

HERE = Path(__file__).resolve().parent

INSTRUCTIONS = """You review a draft against a rubric and return structured notes.

The criteria, each scored 0-100:
{criteria}

A separate deterministic pass has already run and found these. Do not repeat
them; assume they will be fixed:
{mechanical}

Answer with JSON only:
  {{"scores": {{"<criterion id>": <0-100 integer>, ...}},
    "notes": [{{"line": <1-based line number>, "criterion": "<criterion id>",
               "problem": "<what is wrong, under 160 characters>",
               "suggestion": "<the replacement text, or an empty string>"}}],
    "summary": "<two sentences: the single most valuable change, and why>"}}

Rules:
- Score every criterion in the list, including ones you have no notes for.
- Every note must carry a line number that exists in the draft.
- A note without a concrete suggestion is worth less than no note. If you cannot
  say what it should say instead, leave the suggestion empty and say why in the
  problem.
- Do not comment on the subject matter. You are reviewing the writing."""


def mechanical_checks(text: str, rules: list[dict]) -> list[dict]:
    """Run the rubric's regex rules. Cheap, exact, and not the model's job."""
    found = []
    for n, line in enumerate(text.split("\n"), 1):
        for rule in rules:
            for m in re.finditer(rule["pattern"], line, re.I):
                found.append({"line": n, "rule": rule["id"],
                              "match": m.group(0)[:60], "message": rule["message"]})
    return found


def schema(ids: list[str]) -> dict:
    return {
        "type": "object", "additionalProperties": False,
        "required": ["scores", "notes", "summary"],
        "properties": {
            "scores": {"type": "object",
                       "properties": {i: {"type": "integer", "minimum": 0, "maximum": 100}
                                      for i in ids},
                       "required": ids},
            "notes": {"type": "array", "items": {
                "type": "object", "additionalProperties": False,
                "required": ["line", "criterion", "problem", "suggestion"],
                "properties": {
                    "line": {"type": "integer", "minimum": 1},
                    "criterion": {"type": "string", "enum": ids},
                    "problem": {"type": "string", "minLength": 3, "maxLength": 160},
                    "suggestion": {"type": "string", "maxLength": 400},
                }}},
            "summary": {"type": "string", "minLength": 3, "maxLength": 400},
        },
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--input", required=True)
    ap.add_argument("--rubric", default=str(HERE / "rubrics" / "copy.json"))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out", default="")
    ap.add_argument("--fail-under", type=int, default=0,
                    help="exit 1 if any criterion scores below this. 0 disables")
    args = ap.parse_args(argv)

    rubric = json.loads(Path(args.rubric).read_text(encoding="utf-8"))
    draft = Path(args.input).read_text(encoding="utf-8")
    lines = draft.split("\n")

    mech = mechanical_checks(draft, rubric.get("mechanical", []))
    ids = [c["id"] for c in rubric["criteria"]]

    numbered = "\n".join("%4d| %s" % (i, l) for i, l in enumerate(lines, 1))
    criteria = "\n".join("- %s: %s" % (c["id"], c["rule"]) for c in rubric["criteria"])
    mech_text = ("\n".join("  line %d: %s (%r)" % (m["line"], m["message"], m["match"])
                           for m in mech[:40]) or "  none")

    system, user = prepare(
        INSTRUCTIONS.format(criteria=criteria, mechanical=mech_text),
        numbered, "Review the draft below. Line numbers are in the left margin.")

    client = Client(cassette_dir=HERE.parent / "samples" / "cassettes" / "review",
                    dry_run=args.dry_run)
    try:
        result, attempts = complete_validated(client, system, user, schema(ids),
                                              large=True, max_tokens=2000)
        result["attempts"] = attempts
    except (ValidationError, ValueError, LLMError) as exc:
        # The fallback is the deterministic pass on its own. It is a smaller
        # review, but it is a real one, and it never disagrees with itself.
        result = {"scores": {i: None for i in ids}, "notes": [], "attempts": 2,
                  "summary": "Model review unavailable (%s). Mechanical findings only."
                             % str(exc)[:120]}

    result["mechanical"] = mech
    # Drop any note pointing at a line that does not exist.
    result["notes"] = [n for n in result["notes"] if 1 <= n["line"] <= len(lines)]

    print("reviewed %s (%d lines) in %d model call(s)"
          % (args.input, len(lines), client.calls))
    print("  mechanical findings: %d" % len(mech))
    for cid in ids:
        score = result["scores"].get(cid)
        print("  %-22s %s" % (cid, "n/a" if score is None else score))
    print("  notes: %d" % len(result["notes"]))
    if result.get("summary"):
        print("  " + result["summary"])

    if args.out:
        Path(args.out).write_text(json.dumps(result, indent=2, ensure_ascii=False),
                                  encoding="utf-8")
        print("wrote %s" % args.out)

    if args.fail_under:
        low = [c for c, s in result["scores"].items()
               if s is not None and s < args.fail_under]
        if low or mech:
            print("\nfailing: %s"
                  % (", ".join(low) if low else "%d mechanical finding(s)" % len(mech)))
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
