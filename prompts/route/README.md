# route

Pick the next action for a record, with a deterministic fallback.

```bash
python -m route.run --input samples/inbound-replies.json --dry-run
```

## The difference from classify

A classification is a label. A route has consequences, so three things are
tighter:

**The action list is closed.** [`actions.json`](actions.json) declares every
action, and the output schema's enum is built from those ids. The model cannot
name an action that does not exist, however the input is phrased.

**Arguments are validated against the action's own schema.** A decision envelope
that passes validation can still carry arguments you cannot execute. Each action
declares its own argument schema and it is checked separately, after the action is
known.

**Irreversible actions never run from a model decision alone.** An action marked
`"reversible": false` comes back with `status: "queued_for_approval"` no matter how
confident the model was. In the sample set, `suppress_contact` is the irreversible
one: suppressing the wrong contact is not something you notice or undo.

## The fallback

`hold_for_human` is the declared default, and everything routes there rather than
raising:

- The model chose it.
- Validation of the decision failed twice.
- The arguments failed their action's schema.
- Confidence was below `--floor` (default 60).

`R-08` in the sample set is an instruction aimed at the router rather than a
reply. The boundary in `lib/untrusted.py` and the closed action list are what
make it land in the default rather than booking a meeting.
