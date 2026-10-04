# Zoho CRM lead router

**Status: can publish.** Not yet submitted. Submit each `-publish.json` with its `SUBMISSION-*.md` as is.

| File | Template title |
| --- | --- |
| [`01-lead-routing-publish.json`](01-lead-routing-publish.json) | Route inbound leads from forms, email and calls into Zoho CRM |
| [`02-stage-sweep-publish.json`](02-stage-sweep-publish.json) | Create next-action tasks for stalled deals in Zoho CRM |

Workflow 01 reads a lead from a website form, a forwarded email or a phone note, routes it to an owner, status and tags with a first-match rule table, and writes it to Zoho CRM once. Workflow 02 checks every open deal each morning for the next action its stage needs, creates the missing task and escalates overdue deals. Both run with no credentials and show the exact request they would send.

Each `SUBMISSION-*.md` file is the description page for the workflow of the same number. The
`-publish.json` files pass `submission_lint` with no errors: stickies clear of every node, one
yellow description sticky with all five sections, an SEO title, and no credentials, sheet ids or
client references.
