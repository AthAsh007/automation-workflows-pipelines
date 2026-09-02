# 10, Deliverability Watchdog

**Post:** *Smartlead, Apollo & Clay Cold Email Expert*

## What it does

Runs at 08:00 (before the sender) pulls campaign and per-mailbox stats from Smartlead,
grades them, pauses the campaign if it's over the stop line, names the mailboxes to pull
out, and logs one row a day so the trend is visible.

## The thing that marks you as having done this before

**It grades on bounce and reply. It does not grade on open rate.**

Apple Mail Privacy Protection pre-fetches images, so a meaningful share of every "open" is
a proxy server, not a person. Open rate has been a vanity metric since 2021 and most cold
email dashboards still lead with it. This template logs it and labels it unreliable in the
report itself.

Say that on the call. Clients hiring a "Smartlead expert" have usually been shown an open
rate by the last three applicants, and the one who explains why it's noise is the one they
remember.

## Thresholds

| Signal | Warn | Stop | Why |
|---|---:|---:|---|
| Bounce | 3% | **5% → auto-pause** | Past this, the sending domain's reputation is going |
| Unsubscribe | 1% | (| Not a deliverability problem) a copy or targeting one |
| Reply | below 1% |, | The campaign is landing and being ignored |
| Sample |, |, | Under 100 sends it reports `too early` rather than grading noise |

The sample floor matters more than it looks. A campaign three sends in with one bounce is
at 33%, and a watchdog that pauses it has just cost the client a week for nothing.

## Per-mailbox view

One bad mailbox drags the campaign average down while hiding inside it, the campaign shows
3.5% and looks survivable, while one inbox of six is at 11% and quietly burning. Bad
mailboxes are named in the report with their own bounce rate and send count, so they can be
pulled and replaced without stopping everything.

## Flow

```text
Daily 08:00
  └─ [cred] Smartlead — campaign analytics
      └─ [cred] Smartlead — email accounts       (per-mailbox stats)
          └─ grade the campaign     bounce + reply + unsub, sample floor, per-inbox
              └─ over the stop line?
                  ├─ yes → [cred] Smartlead — PAUSE the campaign ─┐
                  └─ no  → leave it running ─────────────────────┤
                              merge ◄─────────────────────────────┘
                                └─ [cred] Sheets — log the day
                                    └─ build the report → [cred] Post the report
```

## Setup (about 15 minutes)

1. Import, set env vars from `.env.example`.
2. Add a `Deliverability` tab with headers: `date`, `sent`, `bounce_pct`, `reply_pct`,
   `unsub_pct`, `verdict`, `paused`.
3. **Using Instantly instead?** Two nodes change: `GET
   https://api.instantly.ai/api/v2/campaigns/analytics` with an `Authorization: Bearer`
   header, and the pause call becomes Instantly's campaign status endpoint. The node notes
   carry the details.
4. Decide `AUTO_PAUSE` with the client, in writing. Some want the workflow to pull the
   trigger; some want to be told. Both are defensible, assuming is not.

## Scope we sell this as

**S$800 fixed.** Frequently the *first* thing to sell a client who already has campaigns
running, because it needs no access to their list and pays for itself the first time it
catches a bad mailbox. It's also a clean way into a bigger rebuild: the trend line makes the
list-quality argument for you.
