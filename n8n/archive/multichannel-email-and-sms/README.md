# 03, Reply Triage and Booking

**Post:** *AI Lead Gen Expert, Clay, Apollo, Email/SMS, CRM*

The reply-to-CRM half of that post. Pair with 14 (enrichment) for the Clay/Apollo half, and
09 if they want the hot path to end in a booked call.

## What it does

A reply arrives. Within seconds it is classified, routed to one of three destinations, and
posted to Slack or Discord with a drafted response the client can send from their phone.

This is the template that makes the other four worth paying for. Everyone can send email;
what clients actually lose money on is the reply that sat unread for four days.

## Three destinations, no fourth

| Classification | Where it goes | Why |
|---|---|---|
| `unsubscribe`, `not_interested` | **Suppression tab**, template 12 reads it before every run, and it is never cleared | This is also the GDPR/PDPA deletion mechanism |
| `interested` | **GHL**: contact upserted, opportunity opened, booking link sent | The moment that pays for the system |
| `not_now`, `out_of_office`, `wrong_person`, `auto_reply`, `unclear` | **Followups tab** with a drafted reply and a date if one was stated | A human decides |

An unparseable classifier response becomes `unclear` and goes to a human. **Silence is the
one outcome a reply must never get**, that's the rule the whole template is built around.

## Flow

```text
Webhook /reply   (200 immediately — Instantly and Smartlead retry slow webhooks)
  └─ normalise reply           one shape from Instantly, Smartlead or a forwarder
      └─ [cred] Claude — classify the reply     JSON schema, conservative on opt-outs
          └─ read classification
              └─ opted out? ── yes → [cred] Sheets — add to suppression ─┐
                    │ no                                                  │
                    └─ interested? ── yes → [cred] GHL — upsert contact   │
                          │                   └─ create opportunity       │
                          │                       └─ send booking link ───┤
                          └─ no → [cred] Sheets — park for follow-up ─────┤
                                                                          │
                                              merge paths ◄───────────────┘
                                                  └─ build alert
                                                      └─ [cred] Notify Slack/Discord
```

## Two decisions worth defending on a call

**Unsubscribe suppresses the whole domain; a soft "not interested" suppresses the person.**
Someone who says *stop* is speaking for their company. Someone who says *not for us right
now* isn't. And their colleague may be a real buyer. Getting this backwards either burns
accounts or wastes them.

**The classifier is told the reply is data, not instructions.** A cold-email reply is
untrusted text from a stranger, going straight into a model prompt. Keep that line if you
edit the prompt. It's also a good thing to be asked about in an interview.

## Setup (about 25 minutes)

1. Import, set env vars from `.env.example`.
2. GHL: create a Private Integration token with contacts and opportunities scopes; take
   `locationId`, `pipelineId`, and the stage id you want new replies to land in.
3. Sheet tabs: `Suppression` (`email`, `domain`, `reason`, `added_at`) and `Followups`
   (`lead_id`, `email`, `intent`, `summary`, `follow_up_on`, `suggested_reply`,
   `received_at`).
4. Paste the production webhook URL into Instantly (Reply Received) or Smartlead (Email
   Reply).
5. Test by replying to a live campaign email with "not right now, ask me in January" , 
   watch it land in Followups with `follow_up_on` filled in.

## Demo script

Send three replies to the test address, in this order: *"stop"*, *"sounds interesting, how
does it work?"*, *"I'm on leave until the 3rd"*. Then show the Slack channel. Three
messages, three different routes, one of them with a GHL opportunity already open, under
ten seconds each. That demo has closed jobs on its own.

## Scope we sell this as

**S$1,200 fixed**, build, GHL pipeline wired, classification tuned on 20 of the client's
real past replies (ask for them; it's the fastest trust-builder in the whole engagement).
Bundled with 04: **S$2,600** for both.
