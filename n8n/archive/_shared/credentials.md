# Credentials - what to ask the client for

Ask for all of it in one message, on day one. Chasing credentials one at a time is the
single biggest reason a two-week build takes six.

| Service | Used by | What to ask for | Rough cost to client |
|---------|---------|-----------------|----------------------|
| Apollo.io | 01, 03 | API key, plus confirmation the plan includes **API access** (the entry tier does not) | from ~US$49/user/mo |
| RocketReach | 01, 03 | API key | from ~US$70/mo |
| Clay | 03 | Nothing from us - they add an **HTTP API** column pointing at our webhook | their existing plan |
| Email verifier (NeverBounce / ZeroBounce / MillionVerifier) | 01, 03 | API key and a credit balance | ~US$0.004 per email |
| Instantly **or** Smartlead | 04 | API key, campaign ID, sending domain | from ~US$37/mo |
| GoHighLevel | 05 | Private Integration token, Location ID, pipeline and stage IDs | their existing plan |
| Anthropic | 02, 03, 04, 05 | API key on a workspace whose spend we can see | ~US$5-40/mo at these volumes |
| Google | 01 | Service account, with the target Sheet shared to its address | free |
| Slack or Discord | 04, 05 | Incoming webhook URL for the alerts channel | free |

## The two questions to ask before quoting

1. **"Is your Apollo plan on a tier with API access?"** More builds stall here than
   anywhere else. If it is not, 01 and 03 fall back to RocketReach plus pattern-guessing
   and list quality drops measurably. Say so before the quote, not after.
2. **"Which domain will send, and is it warmed?"** If the answer is the primary domain,
   the first deliverable is a new domain and three weeks of warmup, not a workflow.

## Handling

Keys go into the n8n host's environment (see `conventions.md`) or into n8n credentials.
Never into a workflow JSON, never into a shared doc, never into chat. Every `.env.example`
in this folder ships with placeholders only - check yours still does before sending a
template out as a work sample.

## A note on API terms

Apollo, RocketReach and Clay all restrict re-selling or re-exporting their data to third
parties. We build a workflow the client runs on the client's own keys; we never resell
records pulled on our keys. Keep it that way and none of this is a problem.
