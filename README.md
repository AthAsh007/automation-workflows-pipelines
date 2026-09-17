# Automation Workflows and Pipelines

Working automation templates across n8n, agent runtimes, data orchestrators, CI,
CRM platforms and LLM prompt pipelines. Every template runs before you configure
a single credential, and every fixture address is under a reserved `.example`
domain, so a first run cannot email, call or text a real person.

## Everything here starts free

No template requires a paid plan to run. Each one runs on a self-hosted community
edition, a free tier, or your own machine. Where a service has no usable free
tier, the template treats it as optional: leave the key blank and that branch is
skipped with a named node saying so, and the run still completes.

| Layer | The free path | What you pay for later |
| --- | --- | --- |
| Visual workflows | n8n Community, self-hosted with Docker | Cloud hosting, more concurrent executions |
| Workflow settings | The `config` node in this repo | n8n Custom Variables (`$vars`) need Enterprise or Pro Cloud, so nothing here uses them |
| Spreadsheets and storage | Google Sheets, SQLite, Postgres in Docker | Managed Postgres, higher API quotas |
| Data orchestration | Airflow, Dagster, Prefect, Kestra, Windmill, all Apache-2.0 and self-hostable | Their managed clouds |
| CI | GitHub Actions free minutes on public repositories | Private-repo minutes, larger runners |
| LLM calls | A local model through an OpenAI-compatible endpoint, or a provider free tier | Frontier model tokens at volume |
| Email sending | Your own SMTP, or a provider free tier | Volume, dedicated IPs, deliverability tooling |
| Enrichment and verification | Optional. Every enrichment node degrades to a named skip | Apollo, Instantly, verification credits |
| CRM | Salesforce Developer Edition, free and permanent | Production org licences |

Starting is free. Scaling is what costs money, and the templates are built so the
first cost you hit is volume rather than a locked feature.

```
n8n/           visual workflow automation, importable JSON
agents/        long-running agent profiles: skills, scheduled jobs, memory policy
prompts/       LLM prompt pipelines: classification, extraction, review, routing
orchestration/ Airflow, Dagster, Prefect, Temporal, Kestra, Windmill
ci/            GitHub Actions, GitLab CI, reusable release and quality gates
crm/           Salesforce Apex and Flow, HubSpot, GoHighLevel
integrations/  webhook receivers, retry and idempotency helpers, queue workers
docs/          the conventions every template follows
```

## Start here

| You want to | Read |
| --- | --- |
| Import a workflow and watch it run | [`n8n/README.md`](n8n/README.md) |
| Find the workflow that proves a mechanism | [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md) |
| Understand why nothing reads `$env` | [`docs/CONFIG-NODE.md`](docs/CONFIG-NODE.md) |
| Run an agent on a schedule | [`agents/README.md`](agents/README.md) |
| Build a prompt pipeline that returns typed output | [`prompts/README.md`](prompts/README.md) |
| Schedule a data pipeline | [`orchestration/README.md`](orchestration/README.md) |
| Automate inside Salesforce | [`crm/salesforce/README.md`](crm/salesforce/README.md) |
| Gate a repo in CI without copying 60 lines into it | [`ci/README.md`](ci/README.md) |
| Receive a webhook without processing it five times | [`integrations/README.md`](integrations/README.md) |
| See which of the eight mechanisms your problem is | [`docs/PATTERNS.md`](docs/PATTERNS.md) |
| Know what is safe to publish | [`docs/SANITIZATION.md`](docs/SANITIZATION.md) |

## The three rules every template follows

**1. Settings live in one place, not in the environment.**
An n8n workflow reads nothing from `$env`. Every setting is a literal in a single
Code node named `config` at the head of the graph. That is what lets a workflow
import into n8n Cloud, run on a laptop, and degrade to a dry run instead of
returning 401 when a key is missing. [`docs/CONFIG-NODE.md`](docs/CONFIG-NODE.md)
has the full pattern and the five-step conversion for a workflow that still reads
the environment.

**2. Every destructive step has a gate in front of it.**
Nothing sends mail, writes to a CRM, publishes a post or places a call until a
guard node has confirmed the run is not a preview, the address passed
verification, and the record is not on the suppression list. Templates that
publish to a third party additionally require a human reply in a chat channel.

**3. The logic is a file, not a string in a JSON blob.**
Where a template has a `build/` directory, its Code nodes live there as real
`.js` files. `build.py` compiles them into the workflow JSON, `validate.py`
checks the graph structure, and `simulate.js` runs the logic against the fixtures
in `sample/` with no network access at all. Edit the `.js` file, rebuild, import.

## n8n workflows

| Workflow | What it does | Trigger |
| --- | --- | --- |
| [lead-enrichment-and-verification](n8n/lead-enrichment-and-verification/) | Raw organisation list, segmented, decision makers found, every address verified, scored, deduplicated, loaded into an email campaign. Records everyone held back and why. | Weekdays 07:00 and manual |
| [inbound-enquiry-router](n8n/inbound-enquiry-router/) | Website form, tracking sheet, instant reply with the standard questions, routed by postcode, nudged at 48 hours, morning digest. Two workflows. | Form webhook and weekdays 08:30 |
| [crm-data-hygiene](n8n/crm-data-hygiene/) | Weekly CRM audit. Whitespace, case and domain formatting are fixed automatically; duplicates, malformed addresses and likely job changes are reported and never auto-resolved. Logs one health score a week. | Sunday 20:00 |
| [personalised-outbound-email](n8n/personalised-outbound-email/) | Sends a personalised email per sheet row with real deliverables attached, then writes the outcome back to the row. Facts are assembled in code; the model rewrites only the subject line and the opening sentence. | Weekdays 09:00 and manual |
| [social-post-with-approval](n8n/social-post-with-approval/) | Drafts a caption, renders a graphic from a deterministic HTML template, posts the draft to a chat channel, and publishes only after a human replies. | Daily and on approval |
| [recruiting-candidate-engine](n8n/recruiting-candidate-engine/) | ATS job order, scored candidates, an SMS and voice contact ladder, qualification, recruiter booking, ATS write-back. State lives in Postgres. Three workflows. | ATS webhook, every 15 minutes, inbound webhook |
| [ghl-lead-intake-router](n8n/ghl-lead-intake-router/) | A lead from any source, read in whatever shape it arrived, routed to an owner, stage and tags by a first-match rule table, then written to the CRM as one payload. A follow-up ladder stops on a reply, a stage move or the cap, and says which. Two workflows. | Webhook, manual and weekdays 08:00 |
| [order-to-ship-engine](n8n/order-to-ship-engine/) | Store order captured once and written to the production board first, confirmed with a shipping window the rules can support, then tracking and a personalised installation email built from per-product rules. Two workflows. | Store webhook, weekdays 08:30 and 16:30 |
| [brand-deal-outreach-engine](n8n/brand-deal-outreach-engine/) | Creator-partnership outreach where the quality claims are gates: a personalisation audit holds any pitch with an invented number, and deliverability fails closed per mailbox and per domain. Replies routed, weekly report shows what the gates cost. Two workflows. | Weekdays 08:00 and hourly |
| [pipedrive-referral-network](n8n/pipedrive-referral-network/) | The rule an event-driven CRM cannot express, asked of every open deal each morning: no open opportunity without a next activity. Overdue deals escalate rather than stack. Two workflows. | Weekdays 07:00 and Mondays 08:00 |
| [voice-avatar-reply-engine](n8n/voice-avatar-reply-engine/) | An enquiry triaged into a written reply, a voice note or an avatar video. Rendering has to be earned, low confidence drops back to text, and complaints get no automated answer. The render half polls with a bound and gives up rather than hanging. Two workflows. | Webhook and manual |
| [trello-sms-notifier](n8n/trello-sms-notifier/) | A card on a watched list, its fields read from the card name, the description or a custom field, composed into an SMS and sent. The smallest complete example of the conventions. | Trello webhook |

[`n8n/starters/`](n8n/starters/) holds six single-file workflows: an RSS digest, B2B
sourcing, cold email with reply triage, a Mailchimp signup, an applicant sync and a
WhatsApp number doing three jobs. They are short and readable, and they do **not**
follow the config-node rule, so read their README before running one.

[`n8n/archive/`](n8n/archive/) holds fourteen more, one per brief shape. They are
older, most still read `$env`, and they are kept because they show the range of
graph shapes rather than because they are current.

[`docs/WORKFLOWS.md`](docs/WORKFLOWS.md) indexes all of them by mechanism, which is
the faster way in if you are looking for a technique rather than an industry.

## Agent profiles

[`agents/`](agents/) targets a filesystem-configured agent runtime: a `config.yaml`,
a `SOUL.md` that states what the agent will not do, one folder per skill, and a
`cron/jobs.json` of scheduled jobs pointing at prompt files.

| Profile | The problem it solves |
| --- | --- |
| [memory-architecture](agents/memory-architecture/) | The agent forgets between sessions, or drags its whole history into every prompt |
| [mcp-tool-orchestration](agents/mcp-tool-orchestration/) | Twelve tools with overlapping descriptions, so it picks the wrong one and loops |
| [customer-service-agent](agents/customer-service-agent/) | Triage an inbox with an escalation path and a tone the business can stand behind |
| [autonomous-research-agent](agents/autonomous-research-agent/) | Run a research brief on a schedule and produce a citation-backed report |
| [personal-assistant-setup](agents/personal-assistant-setup/) | A morning brief and a day-close review a person will actually read |
| [social-post-agent](agents/social-post-agent/) | Scheduled posting to a company page behind an approval gate and 29 layout guardrails |

## Running a template safely

Read [`docs/SAFETY.md`](docs/SAFETY.md) before pointing any of these at a real
account. In short:

- Import with `preview: true` in the `config` node. Every send, write and publish
  node sits behind a guard that stops the branch in preview mode.
- Fixture contacts are at `.example` domains. RFC 2606 reserves that TLD, so it
  cannot resolve and cannot receive mail. Do not replace them with a real address
  to "test properly".
- Outbound email and SMS are regulated. `docs/COMPLIANCE.md` covers consent,
  suppression lists, unsubscribe handling and per-mailbox sending caps. None of
  it is legal advice.

## Attribution and licence

Everything in this repository was written for it or rewritten for it. Where a
template implements a pattern that is widely documented elsewhere, the source is
cited in that template's README under **Prior art**, and the implementation is
original. See [`NOTICE`](NOTICE) for the full statement and
[`LICENSE`](LICENSE) for the terms (MIT).

Third-party product names (n8n, Salesforce, Apollo, Instantly, Twilio and others)
are trademarks of their respective owners and are used here only to name the API
a template integrates with.
