# 04, Outbound System Orchestrator

**Post:** *AI-Powered B2B Outbound System Builder, Clay, Apollo, Smartlead, n8n*

## What it does

The supervisor for the whole pipeline. Runs at 07:45 (before the sender) and answers the
four questions a client asks about an outbound system, every morning, unprompted:

1. **Did everything run in the last 24 hours?** (reads the n8n executions API)
2. **Did anything error?**
3. **How many days of sendable leads are left** at the current cap?
4. **Is any reply older than the SLA still untouched?**

If all four are fine it posts one quiet line. If any isn't, it pages the owner.

## Why this is the template that wins "system builder" posts

Anyone can chain five workflows together. What separates a system from a pile of workflows
is that **the system notices when it stops working.** A client who has been burned before
recognises this immediately. Their last automation broke silently in week three and they
found out from a customer.

The runway number is the one they'll remember: *"you have four days of leads left"* is a
sentence that produces a decision. "Pipeline health: degraded" isn't.

## Flow

```text
Weekday 07:45
  └─ [cred] Sheets — read leads
      └─ [cred] n8n — read recent executions      (survives a missing API key)
          └─ build scorecard        stage counts, runway, backlog, stale replies, stalls
              └─ format scorecard   lead with what needs a decision
                  └─ [cred] Notify Slack or Discord
                      └─ something needs a human? ── yes → [cred] Page the owner
                                                    └─ no  → nothing to escalate
```

## Setup (about 20 minutes)

1. Import, set env vars from `.env.example`.
2. Create an n8n API key (Settings → n8n API) and set `N8N_API_KEY` + `N8N_BASE_URL`.
3. Open each pipeline workflow, copy its id from the URL, and build
   `PIPELINE_WORKFLOW_IDS`:

```json
{"08 list build": "aBc123", "14 enrichment": "dEf456", "12 sender": "gHi789", "03 replies": "jKl012"}
```

4. Point `PAGER_WEBHOOK_URL` at a channel someone actually has notifications turned on for.
   If it's the same muted channel as the daily digest, the pager does nothing.

## Thresholds

| Env | Default | Meaning |
|---|---:|---|
| `MIN_RUNWAY_DAYS` | 5 | Below this, "build more list" is in the morning message |
| `REPLY_SLA_HOURS` | 24 | A `replied` lead untouched longer than this is flagged |
| `MIN_CONFIDENCE` | 70 | What counts as a sendable lead (matches template 12) |
| `DAILY_SEND_CAP` | 80 | Denominator for the runway calculation |

> `DAILY_SEND_CAP` here is the **planning** daily volume, not a legal ceiling. Set it to
> whatever template 12 is actually sending (80 for a small client, 636 for the GCC build).
> The statutory limits are per subject line and live in template 12, see
> [_shared/compliance.md](../_shared/compliance.md).


## Degraded mode

Without an n8n API key the scorecard still runs. It just can't detect stalls, and says so.
That's deliberate: a client who won't issue an API key still gets four fifths of the value
on day one, and the key can come later.

## Scope we sell this as

Rarely sold alone. It's the **S$600 add-on** that turns four workflows into "a system", and
it's usually what justifies the monthly retainer. The client is paying for someone to
receive that 07:45 message and act on it.
