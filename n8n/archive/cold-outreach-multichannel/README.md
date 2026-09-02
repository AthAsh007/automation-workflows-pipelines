# 13, Multichannel Cadence

**Post:** *Cold Outreach Expert, Apollo, LinkedIn, Email*

## What it does

Decides **who gets touched, on which channel, today**. And queues it into the right lane.
It writes no copy and sends nothing: template 12 owns email, template 05 owns LinkedIn, a
human owns the phone. This is the conductor, not the orchestra.

## Why a conductor exists

Run email and LinkedIn as two separate workflows and they become two separate habits.
Then one Tuesday a prospect gets a connection request in the morning and a break-up email in
the afternoon, and the whole operation reads as automated and careless, which it was.

One place deciding the next touch is what makes multichannel look deliberate. It's also the
answer to the interview question behind this post: *"how do you keep the channels from
stepping on each other?"*

## The default cadence

Business days only, weekends are never counted, so a day-4 follow-up never lands on a
Sunday.

| Day | Channel | Action |
|---:|---|---|
| 0 | email | opener |
| 2 | linkedin | view profile |
| 4 | email | follow-up |
| 6 | linkedin | connect with a note |
| 9 | call | call attempt |
| 12 | email | break-up |

Override the whole thing with `CADENCE_JSON`, it's an env var, so a per-client cadence is
a config change, not a code edit.

## Separate cap per channel

Email 80 · LinkedIn 20 (clamped to 25 in code) · calls 15. One channel running out never
starves another, and each cap is enforced against that channel's own real-world limit
rather than a shared budget.

## Flow

```text
Weekday 07:30
  └─ [cred] Sheets — read leads
      └─ decide the next touch     business days, caps per channel, every drop counted
          └─ email lane? ── yes → [cred] Sheets — queue email touch ────────┐
                │ no                                                        │
                └─ LinkedIn lane? ── yes → [cred] Sheets — queue LinkedIn ──┤
                          │ no                                              │
                          └────────→ [cred] Sheets — queue call task ───────┤
                                          merge lanes ◄─────────────────────┘
                                            └─ advance the cadence
                                                └─ [cred] Sheets — write cadence state
                                                    └─ cadence summary → [cred] Post
```

## Exit conditions

A lead leaves the cadence the moment `stage` becomes `replied`, `booked` or `suppressed`.
That's checked every morning before anything is queued. So a reply that arrives at 4pm
stops tomorrow's touch without anyone doing anything.

## Setup (about 20 minutes)

1. Import, set env vars from `.env.example`.
2. Add columns to `Leads`: `cadence_step`, `cadence_started_at`, `last_channel`,
   `last_action`, `phone`.
3. Add three tabs: `Email Queue`, `LinkedIn Tasks`, `Call Tasks`.
4. Agree the cadence with the client before building `CADENCE_JSON`. Sixteen days across
   six touches is a starting point, not a law. Some markets want half that.

## Quiet when there's nothing to do

If no lead is due, the workflow returns nothing and the lanes never run, no post. A daily
message saying "0 touches queued" is how a channel gets muted, and a muted channel hides
the days that mattered.

## Scope we sell this as

**S$1,100 fixed** as the conductor on top of the lanes. Sold alone it's a hard pitch, the
value only shows once two lanes exist. So lead with 12 and 05, then add this in week two
when the client notices the channels aren't talking.
