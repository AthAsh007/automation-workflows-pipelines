# review

Score a draft against a rubric and return notes anchored to line numbers.

```bash
python -m review.run --input samples/draft-copy.md --dry-run
python -m review.run --input README.md --rubric review/rubrics/copy.json --fail-under 60
```

## The split that makes it cheap

Deterministic checks run first, in code. A regex knows whether an em dash is
present, whether "streamline workflows" appears, and whether a sentence claims
"studies show" without naming one. Asking a model to find those costs money and
is less reliable than `re.finditer`.

The model gets only the criteria that need judgement, and it is handed the
mechanical findings so it does not spend its attention re-finding them.

On `samples/draft-copy.md`, a deliberately bad landing page, the mechanical pass
alone finds 19 problems before a single token is spent.

## The rubric

[`rubrics/copy.json`](rubrics/copy.json) has two halves:

- `mechanical`: `{id, pattern, message}`. Regexes, run per line, in code.
- `criteria`: `{id, rule}`. Sent to the model, scored 0-100.

The rules encode [`../../docs/SANITIZATION.md`](../../docs/SANITIZATION.md).
Adding a rule there means adding a pattern here.

## Using it as a gate

`--fail-under N` exits 1 if any criterion scores below N, or if the mechanical
pass found anything. That makes it usable in CI over a docs directory:

```yaml
- run: python -m review.run --input docs/index.md --fail-under 60
```

Start with the mechanical half only. Gating on a model score is a decision to let
a model block a merge, and the scores move between model versions.

## The fallback

If the model call or its validation fails twice, the review completes with the
mechanical findings and every criterion scored `n/a`. A smaller review that is
always available beats a richer one that sometimes blocks the pipeline.
