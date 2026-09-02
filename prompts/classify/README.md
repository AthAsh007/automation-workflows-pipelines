# classify

Route each item into one of N buckets, with a refusal bucket that gets used.

```bash
python -m classify.run --input samples/support-tickets.json --dry-run
python -m classify.run --input samples/support-tickets.json --out results.json
```

## What to edit

[`buckets.json`](buckets.json). One entry per bucket: an `id` the schema will
constrain the model to, and a `rule` written as a decision rule rather than a
label. `run.py` does not change per use case.

A rule that says "billing questions" gives the model nothing to decide with. A
rule that says "about money already charged or about to be: an invoice, a refund,
a failed payment, a plan change, a price question" is a test the model can apply
to a specific sentence.

## Why unknown is a real bucket

A classifier with no way to say "I do not know" says something else instead, with
the same confident tone it uses when it is right. `unknown` is added
automatically if your `buckets.json` leaves it out, and it is the fallback for
three separate cases:

- The model chose it.
- The model's confidence was below `--floor` (default 55).
- The call or the validation failed twice.

All three set `needs_review: true`, so the queue a human works is one field away.

## Tuning the floor

Run with `--floor 0` first and look at the confidence distribution against items
you have labelled yourself. The floor belongs where the error rate above it is
one you can live with, which is a different number for spam routing than for
billing. Setting it in the prompt instead ("only answer if you are confident")
does not work: the model's stated confidence and its accuracy are only loosely
related, which is exactly why the threshold is applied in code afterwards.

## Cost

One call per item, two when the first response fails validation. `--dry-run`
replays recorded responses from `../samples/cassettes/classify/` and makes no
network call, so the pipeline can be demonstrated and tested with no endpoint.
