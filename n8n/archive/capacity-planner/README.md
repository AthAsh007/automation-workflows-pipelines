# 12, Cold Email Sequencer (GCC volume build)

**Post:** *Cold Email Lead-Gen Specialist, Instantly, Apollo, Clay* (post 12)

**Also the sending engine for post 9** (*Cold Email Campaign Specialist) Lead Generation
& Call Booking (B2B / GCC Market)*. That brief needs two templates: this one sends,
[09 - Cold Email Campaign Specialist](../campaign-and-call-booking/) books. It is built to post 9's numbers
because they are the harder constraint: **14,000 verified emails/month, 20+ qualified
calls/month, 3–5 sequences, GCC decision makers.** A smaller post-12 client just sets
`MONTHLY_TARGET` lower and everything scales down.

## The four numbers that decide whether this brief is deliverable

| | |
|---|---|
| **636 emails/day** | 14,000 ÷ 22 working days. The GCC week is **Sunday–Thursday**. |
| **~18 mailboxes** | 636 ÷ 35 per mailbox/day, across **~6 sending domains**. |
| **17 subject variants minimum** | Not a style choice, see below. |
| **2.0% reply rate** | The number that must hold to reach 20 calls. |

### The funnel, honestly

| Reply rate | Replies | Positive (25%) | Booked (30%) | Verdict |
|---:|---:|---:|---:|---|
| 1.0% | 140 | 35 | **10.5** | misses the target |
| 1.5% | 210 | 52 | **15.8** | misses |
| 2.0% | 280 | 70 | **21.0** | ✅ hits |
| 3.0% | 420 | 105 | **31.5** | comfortable |

**14,000 sends does not guarantee 20 calls. A 2% reply rate does.** Volume is the input
the client controls; reply rate is the one we're actually being hired for. Say this on the
call and put it in the SOW: the deliverable is *20 calls at ≥2% reply*, and if reply rate
sits at 1% the answer is better targeting, not more sending.

## The compliance point that makes 14,000/month possible

I had this too blunt in an earlier draft of `_shared/compliance.md` and have corrected it
there. **Singapore's Spam Control Act thresholds are per *subject line*, not per campaign:**

- more than **100** messages with the **same subject** in 24 hours,
- more than **1,000** in 30 days,
- more than **10,000** in a year.

So the question isn't "is 14,000/month legal", it's "how many subject lines does 14,000/month
need". Working it out:

| Threshold | Volume against it | Variants needed |
|---|---:|---:|
| 100 / 24h | 636/day | 6.4 |
| 1,000 / 30d | 14,000/month | 14.0 |
| 10,000 / year | 168,000/year | **16.8** |

**The annual ceiling binds: 17 subject variants minimum.** The allocator computes this from
`MONTHLY_TARGET` at runtime and **refuses to start** if `SEQUENCES_JSON` has fewer. The
shipped default has 4 sequences × 4–5 subjects = 19.

This is the sentence that wins the job: *"14,000 a month is fine from a Singapore sender
provided at least 17 subject lines rotate, here's the arithmetic, and here's the workflow
that enforces it."* Anyone who says "sure, 14k, no problem" hasn't read the statute, and
anyone who says "that's illegal" has read it too coarsely.

Still get a Singapore lawyer to sign it off before the first send. And note the client's own
obligations: UAE's PDPL and Saudi's PDPL both cover B2B outreach, and Saudi is the stricter
of the two.

## Three ceilings, enforced in one node

`allocate subjects and mailboxes` is the heart of this template. It's the only node that
knows about all three limits at once, because they interact. The binding one changes hour
to hour:

1. **Statute**, per subject line (90/24h, 900/30d, 9,000/yr as shipped, sitting under the
   legal lines for headroom).
2. **Deliverability**, per mailbox, 35/day, round-robin across warmed boxes only.
3. **Target**, monthly number ÷ working days ÷ hourly slots, × the warmup ramp.

Whichever binds first wins, and the reason is recorded either way, `no_subject_headroom`,
`no_mailbox_headroom`, `held_by_cap`. When the monthly number doesn't land, the summary
already says why.

## Flow

```text
Hourly 08:00–16:00, Sunday–Thursday        (cron 0 0 8-16 * * 0-4)
  └─ preflight and ramp        refuses to run on unverified domains; applies the ramp
      └─ sending this hour? ── no → STOP: seasonal pause
          └─ yes
             └─ read Leads → Suppression → Mailboxes → SendLedger
                 └─ allocate subjects and mailboxes    ← the three ceilings
                     └─ [cred] LLM — write the email   (per sequence angle + A/B variant)
                         └─ assemble message           subject, unsubscribe, flags
                             └─ send without review?
                                 ├─ auto   → [cred] Instantly — queue on assigned mailbox
                                 └─ review → [cred] Sheets — park drafts
                                     └─ roll the subject ledger  → write
                                         └─ roll the mailbox counters → write
                                             └─ mark leads queued → update stage
                                                 └─ slot summary → notify
```

## GCC specifics that most applicants miss

- **The working week is Sunday–Thursday.** Every other template in this folder uses
  `* * 1-5` (Mon–Fri). This one uses `* * 0-4`. Sending Mon–Fri wastes Friday and misses
  Sunday, that's 40% of the week wrong.
- **Ramadan and Eid.** Working hours shorten sharply and reply rates collapse. Set
  `SEASONAL_PAUSE=true`; the run stops cleanly and the ledger is untouched.
- **No honorifics, no gender guessed from a name.** Enforced in the copy prompt, and
  `Mr.`/`Mrs.` in a draft trips `needs_human_look` even in auto mode.
- **No reference to religion, politics or the local weekend.** Also in the prompt.
- **Hourly slices, not one daily blast.** Nine sends of ~71 rather than one of 636, better
  for mailbox reputation and it looks like a person.

## Warmup ramp

`RAMP_DAY` is the working day since go-live: **≤5 → 25%, ≤10 → 50%, ≤15 → 75%, then full**.
So the first month builds to volume rather than opening at 636/day on fresh mailboxes,
which is the fastest way to burn six domains at once.

Realistically: **week 1 at ~160/day, full volume from week 4.** Month one lands around
9,000–10,000, not 14,000. Say that up front. A client who expects 14,000 in month one and
gets 9,500 thinks you failed, and a client who was told will just nod.

## Setup

1. Import, fill `.env.example`.
2. Sheet tabs: `Leads`, `Suppression`, `Drafts`, plus two new ones:
   - **`Mailboxes`**, `mailbox_email`, `domain`, `daily_cap`, `warmed`, `active`,
     `day_key`, `sent_today`
   - **`SendLedger`**, `subject_id`, `subject`, `day_key`, `sent_today`, `month_key`,
     `sent_month`, `year_key`, `sent_year`, `last_sent`
3. Create one Instantly campaign **per sequence id**. The workflow sends `campaign:
   sequence_id`, which keeps per-sequence and A/B stats clean.
4. Add every warmed mailbox to the `Mailboxes` tab with `warmed=true`, `active=true`.
   Un-warmed boxes are ignored, silently and on purpose.
5. Start with `RAMP_DAY=1`, `APPROVAL_MODE=review`, `SENDING_DOMAINS_VERIFIED=false`. Flip
   the last one only after you've personally checked the DNS on all six domains.

## What completes the brief

This template covers sending. The posted brief also asks for booking and reporting:

| Brief item | Template |
|---|---|
| 14,000 emails, sequences, deliverability, volume control | **12** (this one) |
| Calendar booking integration, call reminders, no-show recovery | **09** |
| Reply handling → CRM | **03** |
| Verified lead lists for UAE/KSA/Qatar/Bahrain/Oman | **08** + **14** |
| Weekly reports on open, reply, calls booked | **10**, extended, see below |
| HubSpot / Notion CRM | **02**, with the field map re-pointed |

**On the weekly report:** the brief asks for open rate. Template 10's README explains why
open rate is noise post-Apple-MPP. Report it because they asked, put reply rate and calls
booked above it, and explain the caveat once in the first report. That's a credibility
moment, not a fight.

## Scope we sell this as

**S$4,500 build**, 6 domains and 18 mailboxes specified and configured, 4 sequences × 19
subject variants written, ramp scheduled, ledger and caps live, two weeks in review mode.
Then **S$2,200/month** to run it, tune copy against reply rate, and produce the weekly
report.

Do not price this as a send-volume job. Price it against the 20 calls, and make the 2%
reply rate an explicit shared assumption in the SOW, with a review at week 6 if it's
tracking under.
