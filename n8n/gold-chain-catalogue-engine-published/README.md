# Gold chain catalogue engine

**Status: published** on the [n8n template library](https://n8n.io/creators/athash007/) (templates 20020 and 20021).

| File | Template title |
| --- | --- |
| [`01-reprice-and-announce-publish.json`](01-reprice-and-announce-publish.json) | Reprice gold chain stock daily and announce it on WhatsApp |
| [`02-whatsapp-enquiries-publish.json`](02-whatsapp-enquiries-publish.json) | Answer WhatsApp gold chain enquiries from a Google Sheets price list |

Workflow 01 reprices a wholesaler's stock sheet every weekday at the day's gold rate (weight x purity x rate, plus making charge and margin). It refuses a rate that moved too far, then sends a "what changed" WhatsApp announcement only after the owner approves it. Workflow 02 answers WhatsApp stock and price questions from the same sheet. The AI only reads what the customer wants; every price comes from the sheet, and orders, bulk requests and complaints go to the owner.

Each `SUBMISSION-*.md` file is the description page for the workflow of the same number. The
`-publish.json` files pass `submission_lint` with no errors: stickies clear of every node, one
yellow description sticky with all five sections, an SEO title, and no credentials, sheet ids or
client references.
