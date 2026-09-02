"""Measure a prompt against a labelled set, then try to beat it.

    python -m optimise.run --pipeline classify --labels optimise/labels/tickets.json --dry-run

What it does, in order:

  1. Splits the labelled set into train and holdout, seeded so a run is repeatable.
  2. Scores the current prompt on both.
  3. Builds candidate variants, each from one failure mode observed on train.
  4. Scores every candidate on train, keeps the best, scores that on holdout.
  5. Writes a report and a candidate prompt file. Changes nothing.

The last line is the point. The output is evidence for a human decision, not a
committed change. A candidate that scores three points higher on 40 examples has
not necessarily improved anything, and the report says so when the margin is
inside the noise.

Prior art: optimising a prompt against a metric rather than by argument is DSPy's
idea (Stanford NLP, MIT, https://github.com/stanfordnlp/dspy). This is a much
smaller thing: a scoring harness with a variant generator, meant to be read in one
sitting. For real optimisation, use DSPy.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.client import Client, LLMError            # noqa: E402
from lib.schema import ValidationError, complete_validated  # noqa: E402
from lib.untrusted import prepare                  # noqa: E402

HERE = Path(__file__).resolve().parent

VARIANT_INSTRUCTIONS = """You rewrite a prompt to fix one specific failure.

The current prompt:
---
{prompt}
---

On a labelled set it got these wrong. Each line is: input, expected, predicted.
{failures}

Answer with JSON only:
  {{"diagnosis": "<one sentence naming the single failure mode these share>",
    "change": "<one sentence describing the edit you made>",
    "prompt": "<the full rewritten prompt>"}}

Rules:
- Make one targeted change addressing the diagnosis. Do not rewrite wholesale.
- Keep every structural requirement of the original: the output shape, the key
  names, the constraints. Only the guidance changes.
- Do not add examples from the failure list. A prompt that memorises its own
  test set scores well and generalises badly."""

VARIANT_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "required": ["diagnosis", "change", "prompt"],
    "properties": {
        "diagnosis": {"type": "string", "minLength": 3, "maxLength": 300},
        "change": {"type": "string", "minLength": 3, "maxLength": 300},
        "prompt": {"type": "string", "minLength": 50},
    },
}


def wilson_interval(correct: int, n: int, z: float = 1.96):
    """A confidence interval for accuracy, so a margin can be read honestly.

    On 40 examples the interval is roughly plus or minus 15 points. Reporting a
    bare percentage on a set that size invites a decision the data cannot carry.
    """
    if n == 0:
        return 0.0, 0.0, 0.0
    p = correct / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    spread = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return p, max(0.0, centre - spread), min(1.0, centre + spread)


def score(client, prompt, examples, adapter, dry_run):
    """Run one prompt over the examples. Returns (correct, total, failures)."""
    correct, failures = 0, []
    for ex in examples:
        system, user = prepare(prompt, ex["input"], adapter["question"])
        try:
            value, _ = complete_validated(client, system, user, adapter["schema"],
                                          max_tokens=adapter.get("max_tokens", 300))
            predicted = value.get(adapter["field"])
        except (ValidationError, ValueError, LLMError):
            predicted = None
        if predicted == ex["expected"]:
            correct += 1
        else:
            failures.append({"input": ex["input"][:180],
                             "expected": ex["expected"],
                             "predicted": predicted})
    return correct, len(examples), failures


def load_adapter(name):
    """Bind the optimiser to a pipeline: its prompt, its schema, its answer field."""
    if name == "classify":
        from classify.run import INSTRUCTIONS, load_buckets, schema
        _, rendered, ids = load_buckets(HERE.parent / "classify" / "buckets.json")
        return {"prompt": INSTRUCTIONS.format(buckets=rendered),
                "schema": schema(ids), "field": "bucket",
                "question": "Classify the item below.", "max_tokens": 300}
    if name == "route":
        from route.run import INSTRUCTIONS, load_actions, decision_schema
        actions, default, rendered = load_actions(HERE.parent / "route" / "actions.json")
        return {"prompt": INSTRUCTIONS.format(actions=rendered, default=default),
                "schema": decision_schema(list(actions)), "field": "action",
                "question": "Choose the next action for the item below.",
                "max_tokens": 500}
    raise SystemExit("no adapter for pipeline %r. Add one in load_adapter()." % name)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--pipeline", default="classify", choices=["classify", "route"])
    ap.add_argument("--labels", required=True,
                    help="JSON list of {input, expected}")
    ap.add_argument("--candidates", type=int, default=3)
    ap.add_argument("--holdout", type=float, default=0.4)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out", default=str(HERE / "report.json"))
    args = ap.parse_args(argv)

    adapter = load_adapter(args.pipeline)
    examples = json.loads(Path(args.labels).read_text(encoding="utf-8"))
    if len(examples) < 8:
        print("warning: %d examples is too few to distinguish two prompts."
              % len(examples))

    rng = random.Random(args.seed)
    shuffled = examples[:]
    rng.shuffle(shuffled)
    cut = max(1, int(len(shuffled) * (1 - args.holdout)))
    train, holdout = shuffled[:cut], shuffled[cut:]

    client = Client(cassette_dir=HERE.parent / "samples" / "cassettes" / "optimise",
                    dry_run=args.dry_run)

    base_train = score(client, adapter["prompt"], train, adapter, args.dry_run)
    base_hold = score(client, adapter["prompt"], holdout, adapter, args.dry_run)
    print("baseline  train %d/%d   holdout %d/%d"
          % (base_train[0], base_train[1], base_hold[0], base_hold[1]))

    results = []
    for i in range(args.candidates):
        sample = base_train[2][:6]
        if not sample:
            print("baseline is perfect on train. Nothing to learn from.")
            break
        failures = "\n".join(
            "- %r expected %r, predicted %r" % (f["input"][:110], f["expected"], f["predicted"])
            for f in sample)
        system, user = ("You improve prompts. Answer with JSON only.",
                        VARIANT_INSTRUCTIONS.format(prompt=adapter["prompt"],
                                                    failures=failures))
        try:
            variant, _ = complete_validated(client, system, user, VARIANT_SCHEMA,
                                            large=True, temperature=0.7 if i else 0.2,
                                            max_tokens=2000)
        except (ValidationError, ValueError, LLMError) as exc:
            print("candidate %d could not be generated: %s" % (i + 1, str(exc)[:120]))
            continue
        c = score(client, variant["prompt"], train, adapter, args.dry_run)
        print("candidate %d  train %d/%d   %s" % (i + 1, c[0], c[1], variant["change"]))
        results.append({"candidate": i + 1, "train_correct": c[0], "train_total": c[1],
                        **variant})

    report = {"pipeline": args.pipeline, "seed": args.seed,
              "train_size": len(train), "holdout_size": len(holdout),
              "baseline": {"train_correct": base_train[0], "train_total": base_train[1],
                           "holdout_correct": base_hold[0], "holdout_total": base_hold[1]},
              "candidates": results, "calls": client.calls}

    if results:
        best = max(results, key=lambda r: r["train_correct"])
        h = score(client, best["prompt"], holdout, adapter, args.dry_run)
        best["holdout_correct"], best["holdout_total"] = h[0], h[1]
        report["best"] = {k: best[k] for k in
                          ("candidate", "diagnosis", "change", "train_correct",
                           "holdout_correct", "holdout_total")}

        bp, blo, bhi = wilson_interval(base_hold[0], base_hold[1])
        cp, clo, chi = wilson_interval(h[0], h[1])
        overlap = not (clo > bhi or blo > chi)
        report["verdict"] = (
            "Holdout %.0f%% (95%% CI %.0f-%.0f) against a baseline of %.0f%% "
            "(95%% CI %.0f-%.0f). The intervals %s, so on %d holdout examples this "
            "%s a real improvement."
            % (cp * 100, clo * 100, chi * 100, bp * 100, blo * 100, bhi * 100,
               "overlap" if overlap else "do not overlap",
               base_hold[1],
               "is not evidence of" if overlap else "is evidence of"))
        print("\nbest: candidate %d" % best["candidate"])
        print("  diagnosis: %s" % best["diagnosis"])
        print("  holdout    %d/%d" % (h[0], h[1]))
        print("\n" + report["verdict"])

        cand_path = HERE / ("candidate-%s.txt" % args.pipeline)
        cand_path.write_text(best["prompt"], encoding="utf-8")
        print("\nwrote %s. Nothing has been changed in the pipeline." % cand_path)

    Path(args.out).write_text(json.dumps(report, indent=2, ensure_ascii=False),
                              encoding="utf-8")
    print("wrote %s (%d model calls)" % (args.out, client.calls))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
