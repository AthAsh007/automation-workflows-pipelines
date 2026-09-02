# 11, Inbound Funnel Capture

**Post:** *Lead Generation Automation Specialist, Clay, AI, Sales Funnel*

## What it does

Any form (Webflow, Framer, Tally, Typeform, a plain HTML POST) lands here and comes out
screened, triaged, scored, routed, and in the CRM, with a human paged inside seconds if it's
worth interrupting them for.

## Speed-to-lead is the pitch

Responses inside five minutes convert several times better than responses an hour later.
That's the entire economic argument for automating inbound, and it's in **every hot alert**,
written as *"Reached you 11s after they hit submit. The clock is running."*

Most funnel builds report volume. Reporting response time is what makes the client feel the
difference in week one.

## Three gates, in order

**1. Screen.** Honeypot field, disposable domains, link stuffing, absurd message length.
Two thirds of what hits a public form isn't a lead, and everything that gets past this node
costs a model call plus a salesperson's attention. Screened-out submissions are **logged to
a `Screened Out` tab**, not silently binned. So when a client says "we got a form and you
never told me", the answer is already waiting.

**2. Triage.** Segment, score, urgency, and the opening line of a human reply. Six segments,
and three of them route *away* from sales: `not_a_fit`, `vendor_pitch` (people selling to
us) and `support` (existing customers with a problem). A funnel that dumps all three into
the sales pile is the most common reason a sales team stops trusting inbound.

**3. Route.** Hot pages a human immediately with the suggested opening line. Everything else
lands in the sheet with an explicit `routed_to`.

## Flow

```text
Webhook /inbound
  └─ normalise and screen
      └─ looks like a person?
          ├─ no  → log the screened-out → [cred] Sheets — log screened-out ─┐
          └─ yes → [cred] Claude — triage and score                         │
                     └─ apply triage    (computes speed_to_lead_seconds)    │
                         └─ hot enough to interrupt someone?                │
                             ├─ yes → [cred] GHL — upsert contact           │
                             │           └─ [cred] Page a human now ────────┤
                             └─ no  → route the rest ──────────────────────┤
                                          merge routes ◄───────────────────┘
                                            └─ [cred] Sheets — upsert lead
                                                └─ Respond to the form
```

## Two deliberate choices

**Both paths return the same response.** A screened-out submission gets the identical
"thanks, we've got it" as a real one. Never tell a bot it was caught, it just tells the
operator which filter to work around.

**An unparseable triage defaults to `needs_human_now: true`.** When the classifier fails,
the failure mode is "a person looks at it", never "it disappears".

## Setup (about 20 minutes)

1. Import, set env vars from `.env.example`.
2. Add a hidden field named `website_url` to the form, that's the honeypot. Humans never
   fill it; most bots always do.
3. Add a `Screened Out` tab with headers: `submitted_at`, `email`, `reasons`, `message`.
4. Point the form's POST at the `/inbound` production URL. If the form platform can send
   `submitted_at`, pass it. The speed-to-lead number is more honest measured from their
   clock than ours.
5. Point `PAGER_WEBHOOK_URL` at a channel with notifications actually turned on. A hot-lead
   alert in a muted channel is worse than no alert, because everyone believes it's covered.

## Scope we sell this as

**S$1,200 fixed**, build, triage tuned on 20 of their real past submissions (ask for them;
it's the fastest way to make the segments fit their business), forms wired, speed-to-lead
reporting turned on. Pairs with template 09 when the hot path should end in a booked call
rather than an alert.
