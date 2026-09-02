# 09, Booking, Show-up, and the Weekly Report

**Post:** *Cold Email Campaign Specialist, Lead Generation & Call Booking (B2B / GCC
Market)* (post 9)

That brief spans two templates: **[12](../capacity-planner/) sends** at the 14,000/month
volume the post asks for, and **this one books, protects and reports on the calls**. Quote
them together. The 20-calls deliverable is not reachable with either half alone.

Two workflows in this folder:

| File | Runs | Covers |
|---|---|---|
| `workflow.json` | webhook + daily 07:00 | *"20+ qualified calls booked monthly"*, confirm, remind, recover no-shows |
| `workflow-weekly-report.json` | Sunday 07:00 | *"Weekly performance reports with recommendations"* |

### The brief, mapped

| Deliverable in the post | Where it is built |
|---|---|
| 14,000 verified emails/month, deliverability, volume control | **12** |
| 3–5 optimized sequences, A/B subject variants | **12** |
| Verified lead lists, UAE, KSA, Qatar, Bahrain, Oman | **08** + **14** |
| 20+ qualified calls booked monthly | **09**, `workflow.json` |
| Calendar + CRM integration (HubSpot, Notion, Google Calendar) | **02**, field map re-pointed |
| Reply handling → CRM | **03** |
| **Weekly reports: open rate, reply rate, calls booked** | **09**, `workflow-weekly-report.json` |

Nothing in the set covered that last row until now, template 10 grades *campaign health*
daily for the operator, which is a different artefact from a client-facing weekly report.

# Booking and show-up

## What it does

Booking a call isn't the outcome. **Showing up is.** This template covers the gap between
the two, which is where cold-email money actually leaks:

- a booking is confirmed within seconds, with two lines written from what we know about
  them rather than a calendar template;
- a cancellation queues a re-book instead of dying at "cancelled";
- tomorrow's calls get a reminder that **offers to move the call** rather than asking them
  to confirm;
- yesterday's calls that nobody marked get closed out as no-shows after a grace period,
  with a re-book date.

## The number to quote on the call

Cold-email booked calls no-show far more than inbound ones. The prospect said yes to a
stranger four days ago and their week has moved on since. Every hour of a salesperson's
diary that a no-show eats was paid for with a list, an enrichment, and a send. Recovering
even a third of them is usually worth more than adding another 200 leads to the top.

That's the pitch. Most "call booking" posts are written by someone who has the booking part
working and is quietly annoyed about the show-up rate.

## Flow

```text
Webhook /booking     (Cal.com BOOKING_CREATED/CANCELLED, GHL AppointmentCreate/Delete)
  └─ normalise booking
      └─ still on the calendar?
          ├─ yes → [cred] Claude — write the confirmation
          │           └─ attach confirmation   (plain fallback if the model call failed)
          │               └─ [cred] GHL — send confirmation ─┐
          └─ no  → queue a re-book (due in 3 days) ──────────┤
                        merge booking paths ◄────────────────┘
                          └─ [cred] Sheets — upsert booking
                              └─ [cred] Notify the booking

Daily 07:00
  └─ [cred] Sheets — read bookings
      └─ reminders and no-shows
          └─ reminder due?
              ├─ yes → [cred] GHL — send reminder → mark reminded ─┐
              └─ no  → mark no-shows ────────────────────────────── ┤
                          merge daily paths ◄────────────────────── ┘
                            └─ [cred] Sheets — write outcomes
                                └─ daily summary → [cred] Post the calls desk
```

## Two details that matter more than they look

**An unmarked past booking becomes a no-show, not a success.** The alternative, assuming it
went fine because nobody said otherwise. Is how a pipeline fills up with ghosts and a
client stops believing the numbers. `NOSHOW_GRACE_HOURS` (default 4) is the window before
that happens, and the salesperson can always overwrite `outcome` by hand.

**The confirmation has a fallback.** If the model call fails, a plain confirmation still
goes out. A booking must never end up with no confirmation at all. That message is most of
the reason people turn up.

## Setup (about 20 minutes)

1. Import both workflows. **There is no `.env` file and nothing to set on the host**, each
   workflow carries a `config` Code node at its head, and that node *is* the setup. It runs
   unchanged on self-hosted n8n and on n8n Cloud, and needs no
   `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
2. Open `config` in each workflow. Paste the keys you have, leave the rest blank, a blank
   key skips that step instead of failing it (see the table below). `LEADS_SHEET_ID` is the
   one required value. Save.
3. Add a `Bookings` tab keyed on `booking_id`, with headers: `booking_id`, `lead_id`,
   `email`, `name`, `company`, `starts_at`, `timezone`, `event_type`, `ghl_contact_id`,
   `stage`, `reminder_sent`, `reminder_sent_at`, `outcome`, `rebook_due`, `closed_at`.
4. Cal.com → Settings → Webhooks → subscribe `BOOKING_CREATED` and `BOOKING_CANCELLED` to
   the `/booking` URL. GHL → Webhooks → `AppointmentCreate`, `AppointmentDelete`.
5. Put `lead_id` and `ghl_contact_id` into the booking link's metadata so bookings join back
   to the lead. Cal.com does this with URL parameters on the booking link, template 03
   already sends `BOOKING_LINK`, so append them there.

### What a blank key does

| Blank | Effect |
|---|---|
| `LLM_API_KEY` | the plain confirmation fallback is used |
| `GHL_API_TOKEN` | confirmations and reminders are not sent |
| `LEADS_SHEET_ID` | nothing is written to Sheets (required, fill this in) |
| `ALERT_WEBHOOK_URL` | no booking / calls-desk notifications |

---

# The weekly report

`workflow-weekly-report.json`. Sunday 07:00, covering the previous GCC working week
(Sun–Thu).

## Why this is the deliverable that keeps the retainer

The other three deliverables in the brief are things the client can eventually see for
themselves, emails went out, calls appeared in a diary. The weekly report is the only one
that tells them *whether it is working*, and it is the artefact they forward to whoever
approved the budget.

Most freelancers send a screenshot of the ESP dashboard. That is the moment the engagement
becomes a commodity, because the dashboard is something they could have opened themselves.

## What it joins

Three sources, none of which is sufficient alone:

```text
Bookings tab      (this template)   calls booked, held, no-showed, re-booked
SendLedger tab    (template 12)     what WE believe we sent, per subject variant
Instantly API                       what the ESP believes was sent, opened, replied, bounced
```

**Two send counts, deliberately.** The ESP knows what it handed to a mail server; the ledger
knows what we intended to send. When they diverge more than 5%, the report says so, that
gap is usually the actual finding, and quoting either number to a client before reconciling
them is how you end up correcting yourself in week three.

## Flow

```text
Weekly Sunday 07:00        (cron 0 0 7 * * 0)
  └─ [cred] Sheets — read bookings
      └─ [cred] Sheets — read send ledger
          └─ [cred] Instantly — campaign analytics   (degrades cleanly if unreachable)
              └─ compute the week          ← every number in the report is produced here
                  └─ [cred] LLM — write the summary  (two sentences of prose, nothing more)
                      └─ attach summary    ← fabrication check + computed fallback
                          └─ [cred] Sheets — log the week
                              └─ [cred] Post the weekly report
```

## The model never produces a number

`compute the week` calculates everything. The model gets those figures and writes two
sentences of prose over them, then `attach summary` scans its output for any numeral that
is not one of ours and **drops the prose entirely** if it finds one, falling back to a
computed opening.

A fabricated metric in a client performance report is not a typo; it is the kind of thing
that ends an engagement and is very hard to explain afterwards. So the model is allowed to
phrase the week and never to measure it. If the LLM call fails outright, the report still
goes out. A week with no report reads as a week with nothing to report, which is the
opposite of true when the model was what broke.

## Recommendations are rules, not opinions

Each one carries the number that triggered it, so the client can check the reasoning:

| Trigger | What it says |
|---|---|
| Reply rate < 2% | The fix is targeting and copy, not volume, with the calls that rate actually implies |
| Reply rate < 1% | As above, flagged as *far* under |
| Bounce rate > 3% | Stop scaling, re-verify, names the worst sequence |
| One sequence under half the best sequence's reply rate | Retire or rewrite it, with both rates and the sample |
| No-show rate > 30% | Shorten the booking-to-call gap before adding leads |
| Past bookings still unmarked | The daily 07:00 chain is not running |
| Subject variants < the statutory floor | Compliance. Add variants before raising volume |
| A variant within 15% of a ceiling | Compliance, rotate it out now, not when it blocks |
| Ledger and ESP more than 5% apart | Reconcile before quoting either number |
| Calls behind pace | The number, against working days elapsed |

Two guards on top of those:

**Under 100 sends it reports `too early` rather than grading noise**, same floor as
template 10. A 0% reply rate over 40 sends is not a finding.

**A missing rate is never reported as zero.** If the ESP call fails, the report says the
rates are missing and suppresses every recommendation that depends on them. The first
version of this graded an unreachable API as a catastrophic copy failure, which is the exact
kind of confident wrongness that costs you the account.

## On open rate

The brief asks for it, so it is in there. It sits *below* reply rate and calls booked, and
every report carries the same two-line caveat: post-Apple-MPP, opens are largely a proxy
server pre-fetching images rather than a person reading anything.

Report it, rank it last, explain it once in writing, and never argue about it on a call.
That is a credibility moment. It shows you know which numbers survive contact with reality
,  and it costs nothing.

## Setup

Add a **`WeeklyReports`** tab with headers: `week_start`, `week_end`, `sent`, `open_rate`,
`reply_rate`, `bounce_rate`, `booked`, `held`, `no_show`, `no_show_rate`, `month_bookings`,
`calls_target`, `esp_reachable`, `too_early`, `summary_source`, `recommendations`.

Then open the **`config`** node: it holds `INSTANTLY_API_KEY`, `LLM_BASE_URL`,
`LLM_API_KEY`, `MONTHLY_TARGET`, `CALLS_TARGET`, `TARGET_REPLY_RATE`, `MIN_SAMPLE`,
`BOUNCE_CEILING`, `NOSHOW_CEILING`, `REPORT_WEBHOOK_URL` and `ALERT_WEBHOOK_URL`. The
numbers agreed on the call live here in one visible place. The threshold in the contract
and the threshold in the workflow are the same threshold. `LEADS_SHEET_ID` is the one
required value. Blank `INSTANTLY_API_KEY` sends the report out with rates reported as
*missing* rather than zero; blank `LLM_API_KEY` swaps in the computed opening; blank
`REPORT_WEBHOOK_URL` falls back to `ALERT_WEBHOOK_URL`.

`summary_source` in the log is worth watching for the first month, a run of `computed`
means the model call is failing or the fabrication guard keeps firing, and both are worth
knowing before a client notices the prose has gone flat.

Run it by hand once with a full week of data behind it. The first scheduled run on a fresh
deployment will legitimately report `too early`, and that is worth warning the client about
so the first report does not look broken.

---

# Scope we sell this as

| | |
|---|---|
| Booking and show-up (`workflow.json`) | **S$1,000 fixed** |
| Weekly report (`workflow-weekly-report.json`) | **S$600 fixed** |
| Both, quoted together | **S$1,400** |

The booking half is the easiest upsell in the set: quote it against the client's own
no-show rate. Ask for that number on the discovery call. Most people know it, and saying
it out loud tends to close the deal on its own.

The report half is what makes the retainer renewable, so prefer to bundle it. A client who
gets a weekly document with defensible numbers and a ranked list of what to change renews
without a conversation. A client who gets an ESP screenshot starts wondering what they are
paying for around week six.

Against the full post-9 brief, this folder is roughly a quarter of the job. The sending
engine (**12**, S$4,500 build + S$2,200/month) is the bulk of it. Quote the whole thing as
one engagement and make the 2% reply rate an explicit shared assumption in the SOW, the
20-calls deliverable depends on it, and it is the one number a list can move and volume
cannot.
