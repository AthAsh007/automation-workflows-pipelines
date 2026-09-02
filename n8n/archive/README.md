# Archive

Fourteen older workflows, kept for the range of graph shapes rather than because
they are current. Most read `$env`, which predates the config-node rule and does
not run on n8n Cloud or on a Community instance with the default security setting.
[`../../docs/CONFIG-NODE.md`](../../docs/CONFIG-NODE.md) §9 has the five-step
conversion.

Two of them already follow the rule and run with no keys at all:
[`email-finder-waterfall`](email-finder-waterfall/) (`workflow-v2.json`) and
[`campaign-and-call-booking`](campaign-and-call-booking/). Start with those.

| Workflow | What it does | Trigger | Reads `$env` |
| --- | --- | --- | --- |
| [browser-lead-research-agent](browser-lead-research-agent/) | Visits a page, extracts a structured record with an LLM, returns typed JSON | Webhook or manual | Yes |
| [b2b-leadgen-crm-sync](b2b-leadgen-crm-sync/) | Two-way sync between a lead sheet and a CRM, with conflict rules | Every 15 minutes and CRM webhook | Yes |
| [multichannel-email-and-sms](multichannel-email-and-sms/) | Classifies an inbound reply, routes it, books or suppresses | Reply webhook | Yes |
| [outbound-system-builder](outbound-system-builder/) | Supervises the other outbound workflows and refuses to run an unverified sending domain | Daily 07:45 | Yes |
| [outreach-manager](outreach-manager/) | Builds a per-day task queue for manual channels | Daily 09:00 | Yes |
| [hourly-leadgen-assistant](hourly-leadgen-assistant/) | Tops a campaign list back up to a floor, hourly | Hourly | Yes |
| [export-list-builder](export-list-builder/) | Turns an ICP definition into a deduplicated export list | Manual or schedule | Yes |
| [campaign-and-call-booking](campaign-and-call-booking/) | Booking confirmation, reminder ladder, show-up tracking, weekly report | Calendar webhook and daily | No |
| [smartlead-cold-email](smartlead-cold-email/) | Watches campaign deliverability and pauses on a complaint-rate breach | Daily 08:00 | Yes |
| [funnel-automation](funnel-automation/) | Inbound form capture, scoring, routing into a funnel stage | Form webhook | Yes |
| [capacity-planner](capacity-planner/) | Computes the subject-line variants a monthly target needs, tracks per-subject counters across three windows, refuses to start under-provisioned | Hourly | Yes |
| [cold-outreach-multichannel](cold-outreach-multichannel/) | Runs a multi-step cadence across email and manual channels | Daily 07:30 | Yes |
| [email-finder-waterfall](email-finder-waterfall/) | Tries providers in order, stops at the first confident hit, records which provider answered | Webhook | No (v2) |
| [workflow-assistant-agent](workflow-assistant-agent/) | Answers questions about the running workflows by reading recent executions | Webhook | Yes |

## How they compose

Numbered separately, but they were built as one system:

```
export-list-builder ──> email-finder-waterfall ──> cold-outreach-multichannel ──┬──> capacity-planner ──> multichannel-email-and-sms ──> campaign-and-call-booking
                              ^                                                └──> outreach-manager
                              │
                    hourly-leadgen-assistant
                                                        funnel-automation ──> b2b-leadgen-crm-sync
                                                                                      ^
                    outbound-system-builder supervises ───────────────────────────────┤
                    crm-data-hygiene cleans weekly ──────────────────────────────────-┤
                    smartlead-cold-email watches deliverability ─────────────────────-┤
                    workflow-assistant-agent answers questions about it ─────────────-┘
```

The workflow that used to sit at position 07 in this archive is now
[`../crm-data-hygiene/`](../crm-data-hygiene/). It is the reference implementation
of the config-node rule and belongs where it gets read.

## Shared notes

- [`_shared/conventions.md`](_shared/conventions.md) node naming and canvas layout
- [`_shared/compliance.md`](_shared/compliance.md) superseded by
  [`../../docs/COMPLIANCE.md`](../../docs/COMPLIANCE.md), kept for the per-workflow
  caps it records
- [`_shared/credentials.md`](_shared/credentials.md) which node needs which key
- [`QUICKSTART.md`](QUICKSTART.md) importing, keys, and the three failures you
  actually hit
