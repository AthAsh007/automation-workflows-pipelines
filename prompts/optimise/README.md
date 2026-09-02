# optimise

Measure a prompt against a labelled set, then try to beat it.

```bash
python -m optimise.run --pipeline classify --labels optimise/labels/tickets.json
```

Unlike the other pipelines here, this one needs a live endpoint. It runs the
whole labelled set through several prompts, so recording every response as a
cassette would mean shipping a few hundred fixture files to demonstrate a
harness. `--dry-run` still works and shows the flow, but the scores will be zero.

## What it does

1. Splits the labelled set into train and holdout, seeded so a run repeats.
2. Scores the current prompt on both.
3. Generates candidate variants, each aimed at one failure mode seen on train.
4. Scores every candidate on train, keeps the best, scores that on holdout.
5. Writes a report and a candidate prompt file, and changes nothing.

## Why it stops there

A candidate that scores three points higher on 40 examples has not necessarily
improved. The report gives a Wilson confidence interval for both accuracies and
states plainly whether they overlap:

> Holdout 75% (95% CI 47-91) against a baseline of 67% (95% CI 39-86). The
> intervals overlap, so on 12 holdout examples this is not evidence of a real
> improvement.

On a set that small the interval is roughly plus or minus 15 points, and a bare
percentage invites a decision the data cannot carry. If you want a result you can
act on, label more examples. Two hundred is a different conversation from twenty.

## Adding a pipeline

`load_adapter()` binds the optimiser to a pipeline by returning four things: the
prompt to optimise, the schema its output must satisfy, the field holding the
answer, and the question that goes above the untrusted content. `classify` and
`route` are wired up; adding `extract` means picking a per-field accuracy metric
first, which is a real decision rather than a line of code.

## The labelled set

`{"input": "...", "expected": "..."}` per item, where `expected` is the value of
the adapter's answer field. [`labels/tickets.json`](labels/tickets.json) has 28
for the classify pipeline, including items that should land in `unknown`: those
are the ones a prompt change is most likely to break.

## Prior art

Treating a prompt as something you measure rather than argue about is DSPy's
idea (Stanford NLP, MIT licensed, <https://github.com/stanfordnlp/dspy>). DSPy
compiles a program of modules against a metric, with optimisers that do far more
than this. This file is deliberately about 200 lines: a scoring harness with a
variant generator, small enough to read before trusting. If you want prompt
optimisation as a capability rather than as a demonstration, use DSPy.
