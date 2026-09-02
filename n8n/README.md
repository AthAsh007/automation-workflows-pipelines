# n8n workflows

Six workflows that run end to end on import, before a single credential exists,
plus fourteen older ones in [`archive/`](archive/).

| Workflow | What it does | Trigger |
| --- | --- | --- |
| [lead-enrichment-and-verification](lead-enrichment-and-verification/) | Raw organisation list, segmented, decision makers found, every address verified, scored, deduplicated, loaded into an email campaign. Everyone held back is recorded with the reason. | Weekdays 07:00 and manual |
| [inbound-enquiry-router](inbound-enquiry-router/) | Website form, tracking sheet, instant reply with the standard questions, routed by postcode, nudged at 48 hours, morning digest. Two workflows. | Form webhook and weekdays 08:30 |
| [crm-data-hygiene](crm-data-hygiene/) | Weekly CRM audit. Formatting is fixed automatically; duplicates, malformed addresses and likely job changes are reported and never auto-resolved. Stale verifications are rechecked and failures suppressed. One health score logged a week. | Sunday 20:00 |
| [personalised-outbound-email](personalised-outbound-email/) | One personalised email per sheet row with real deliverables attached, then the outcome written back to the row. | Weekdays 09:00 and manual |
| [social-post-with-approval](social-post-with-approval/) | Caption drafted, graphic rendered from a deterministic HTML template, draft posted to a chat channel, published only after a human replies. Two workflows. | Daily and on approval |
| [recruiting-candidate-engine](recruiting-candidate-engine/) | ATS job order, scored candidates, an SMS and voice contact ladder, qualification, recruiter booking, ATS write-back. State in Postgres. Three workflows. | ATS webhook, every 15 minutes, inbound webhook |

## Importing one

1. In n8n, **Workflows → Import from file**, and pick the `.json`.
2. Open the node named `config`. It is the only node you edit. Every setting is a
   commented constant at the top of it.
3. Leave `TEST_RUN = true` and every optional key blank. Execute the workflow.
   It completes, and the execution list shows a named `STOP:` node wherever a
   branch was skipped.
4. Fix the `[cred] <Service> - <verb>` nodes next. Those are the only nodes that
   need an n8n credential.

Read [`../docs/SAFETY.md`](../docs/SAFETY.md) before you set `TEST_RUN = false`.

## The conventions

Every workflow here follows [`../docs/CONFIG-NODE.md`](../docs/CONFIG-NODE.md):
one Code node named `config` holds every setting, nothing reads `$env` or `$vars`,
optional integrations degrade to a named skip instead of failing, and the shipped
default does nothing irreversible.

[`crm-data-hygiene/workflow.json`](crm-data-hygiene/workflow.json) is the
reference implementation. Read that one first.

## The build directory

Where a workflow has a `build/`, its Code nodes are real files rather than strings
inside the JSON:

```
build/
├── js/            one file per Code node, named after the node
├── build.py       compiles js/*.js into the workflow JSON
├── validate.py    checks the graph: one config node, no $env, every branch named
└── simulate.js    runs the logic against sample/ with no network access
```

Editing a Code node means editing the `.js` file and running `python build.py`.
Editing the JSON directly means the next build overwrites you.

```bash
cd n8n/<workflow>/build
node simulate.js      # run the logic against the fixtures
python validate.py    # check the graph
python build.py       # write the .js files back into the workflow JSON
```

`simulate.js` makes no network calls. It is the fastest way to see what a workflow
does with a given input, and it is what a change should be checked against before
it reaches an n8n instance.

## Fixtures

`sample/` and `sheet/` hold the data a workflow is developed against. Every
address is at a `.example` domain and every phone number is in the `555-01xx`
range, so importing a workflow and running it against its own fixtures cannot
contact anyone. See [`../NOTICE`](../NOTICE).

## archive/

Fourteen older workflows, one per brief shape, kept for the range of graph shapes
rather than because they are current. Most still read `$env` and predate the
config-node rule. [`../docs/CONFIG-NODE.md`](../docs/CONFIG-NODE.md) §9 has the
five-step conversion.
