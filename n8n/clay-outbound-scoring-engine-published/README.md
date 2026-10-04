# Clay outbound scoring engine

**Status: published** on the [n8n template library](https://n8n.io/creators/athash007/) (templates 20022 and 20023).

| File | Template title |
| --- | --- |
| [`01-score-enrich-and-route-publish.json`](01-score-enrich-and-route-publish.json) | Score Clay prospects, enrich only the qualified and route them to Zoho CRM and Smartlead |
| [`02-classify-replies-and-call-list-publish.json`](02-classify-replies-and-call-list-publish.json) | Classify Smartlead replies into Zoho CRM tasks and send a daily call list |

Workflow 01 scores Clay rows on the fields already present (tier A, B, C or Reject), enriches only A and B within a per-run credit budget, verifies every email, then upserts to Zoho CRM and adds each lead to the Smartlead campaign for its tier. Every held lead carries its reason. Workflow 02 classifies Smartlead replies, creates a Zoho task for interested ones, suppresses unsubscribes and builds a prioritised call list each weekday morning.

Each `SUBMISSION-*.md` file is the description page for the workflow of the same number. The
`-publish.json` files pass `submission_lint` with no errors: stickies clear of every node, one
yellow description sticky with all five sections, an SEO title, and no credentials, sheet ids or
client references.
