# 06, List Top-Up Keeper

**Post:** *Hourly Lead Gen Assistant, Clay, Apollo, Instantly*

## What it does

The hourly assistant the post is actually asking for. Two jobs, done without being asked:

1. **Clears the enrichment backlog**, rows that have a name and a domain but no address get
   pushed through template 14, up to `ENRICH_BATCH` per hour, results written straight back.
2. **Keeps the buffer full**. If sendable leads fall below `BUFFER_DAYS × DAILY_SEND_CAP`,
   it triggers a list build, or says loudly that nobody can.

## Why an hourly job has to be quiet

A workflow that posts every hour gets muted in a week, and once it's muted the real
failures are invisible too. So this one **posts only when it did something or needs a
human**, otherwise it runs silently. That single design choice is the difference between
an assistant and a notification firehose, and it's worth saying out loud on the call.

## Flow

```text
Hourly 09:05–18:05, weekdays
  └─ [cred] Sheets — read leads
      └─ measure the buffer     sendable vs target, backlog, broken rows
          └─ enrichment backlog?
              ├─ yes → one item per backlog row
              │          └─ [cred] Call template 14 — enrich   (5/sec)
              │              └─ collect enrichment results     (counts the attempt)
              │                  └─ [cred] Sheets — write enriched rows
              └─ no  → backlog is clear
                  └─ merge paths
                      └─ buffer below target?
                          ├─ yes → [cred] Trigger a list build
                          └─ no  → buffer is fine
                              └─ merge again
                                  └─ shift note (quiet by default)
                                      └─ [cred] Post the shift note
```

## Retry policy

`enrich_attempts` is incremented whether the enrichment found anything or not. After three
attempts a row stops being retried. Without that counter an unfindable lead is re-enriched
every hour forever, and the client pays a provider credit each time. The kind of bill that
gets an automation switched off.

## Setup (about 15 minutes)

1. Import, set env vars from `.env.example`.
2. `ENRICH_WEBHOOK_URL` is template 14's `/enrich` production URL. This is the one that
   makes the backlog clear itself.
3. `LIST_BUILD_WEBHOOK_URL` is optional. To use it, add a Webhook trigger to template 08
   alongside its manual trigger and paste the URL here. Leave it empty and the workflow
   still runs. It just asks a human to build more list instead of doing it.
4. Add columns to `Leads`: `enrich_attempts`, `updated_at`.

## Sizing

| Env | Default | Notes |
|---|---:|---|
| `BUFFER_DAYS` | 7 | A week of runway. Below three days, the shift note escalates. |
| `ENRICH_BATCH` | 25 | Per hour. At 9 working hours that's 225 enrichments a day. |
| `MIN_CONFIDENCE` | 70 | Matches templates 12 and 14. |

> `DAILY_SEND_CAP` here is the **planning** daily volume, not a legal ceiling. Set it to
> whatever template 12 is actually sending (80 for a small client, 636 for the GCC build).
> The statutory limits are per subject line and live in template 12, see
> [_shared/compliance.md](../_shared/compliance.md).


## Scope we sell this as

This is the natural **hourly retainer** deliverable: **S$700/month** to run and watch the
desk, or **S$800 fixed** to build and hand over. Clients hiring "an hourly assistant" are
usually surprised to learn the hourly part can be a workflow, lead with that, and price
the retainer against what they were about to pay a part-time VA.
