# 05, LinkedIn Task Queue

**Post:** *Lead Generation & Outreach Manager, Apollo, Clay, Instantly, Expandi*

## What it does

Every weekday at 09:00 it builds a prioritised LinkedIn queue, who to touch, which step
they're on, and the exact words to send. And posts it as a numbered checklist. A human
works down it in about fifteen minutes. When a touch is done, one webhook call advances the
sequence and sets the next due date.

## The Expandi question, answered head-on

The post asks for Expandi. This template **deliberately does not automate LinkedIn**, no
logged-in session, no browser driver, no automation tool attached to the client's account.

Say this in the proposal, in this order:

1. The account belongs to the client, not to us. LinkedIn restricts accounts for automated
   activity, and a restriction isn't recoverable by apologising.
2. The weekly invite ceiling (~100) is the real constraint, and it applies whether a human
   or a bot sends them. Automation doesn't buy volume here, it only buys risk.
3. What automation *does* buy is the part that actually takes the time: deciding who to
   touch today, remembering where each person is in the sequence, and writing the note.
   That's what this builds. The sending is fifteen minutes of clicking.

Some clients will still want the bot. That's a fine disqualification to find on call one
rather than in week six.

## The four-step sequence

| Step | Action | Written by | Waits |
|---:|---|---|---:|
| 0 | View profile (warm-up, no action) | instruction only | 1 day |
| 1 | Connect with a note | Claude, hard 300-char limit | 4 days |
| 2 | Message, if they accepted | Claude, under 90 words | 6 days |
| 3 | Comment on a recent post | instruction only | ends |

`replied` or `declined` at any step ends the LinkedIn lane. One means a human has taken
over, the other is a no.

## Flow

```text
Weekday 09:00
  └─ [cred] Sheets — read leads
      └─ select today's touches        cap 20/day, best fit first, every drop counted
          └─ needs written copy?
              ├─ yes → [cred] Claude — write the note → attach copy (enforces 300 chars)
              └─ no  → instruction only
                  └─ merge tasks
                      └─ [cred] Sheets — write task list
                          └─ format the queue → [cred] Post the queue

Webhook /li-done   {"lead_id": "...", "outcome": "accepted|ignored|replied|declined"}
  └─ advance the sequence → [cred] Sheets — update li_step
```

## Setup (about 20 minutes)

1. Import, set env vars from `.env.example`.
2. Add columns to `Leads`: `li_step`, `li_next_due`, `li_last_outcome`.
3. Add a `LinkedIn Tasks` tab with headers: `task_date`, `lead_id`, `name`, `company`,
   `linkedin_url`, `action`, `copy`, `done`.
4. Show the operator the two ways to mark a touch done, the sheet's `done` column, or the
   `/li-done` webhook (a Slack workflow button or a phone shortcut both work).

## Guardrails

- `LI_DAILY_CAP` is clamped to **25 in code**, regardless of what the env var says. The
  weekly ceiling is real and a restricted account ends the engagement.
- Connection notes are truncated to 300 characters here, not left to the model. LinkedIn
  silently cuts them off and the operator never notices the sentence that went missing.
- No profile is touched twice in a day; `li_next_due` enforces the gaps.

## Scope we sell this as

**S$900 fixed**, build, sequence and copy tuned to their voice, operator walkthrough.
Pairs naturally with template 13 (multichannel cadence) when they want email and LinkedIn
coordinated rather than running as two separate habits.
