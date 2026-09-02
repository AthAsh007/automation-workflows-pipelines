# 14, Enrichment Waterfall

**Post:** *Looking for an n8n Expert to Automate Workflows and Boost Lead Generation*

The generalist post, lead with this build, because a provider waterfall with honest
confidence scoring shows more craft in one screen than any other template here. It is also
the enrichment engine templates 02, 06 and 12 depend on.

> **Import `workflow-v2.json`.** It is the config-node version: no environment variables,
> runs on n8n Cloud, and runs with no API keys at all so it can be demonstrated before a
> single credential changes hands. `workflow.json` is the older `$env` build, kept only for
> a client whose admin insists on host environment variables.

## What it does

One lead in, the best address we can actually stand behind out, with a confidence number
and a record of which providers were tried. Apollo first, RocketReach when Apollo comes
back empty, a pattern guess last, and **the guess only survives if an independent verifier
confirms the mailbox exists.**

This is the template that answers every Clay job post, because Clay's own waterfall costs a
credit per provider per row and clients notice. Ours only spends on the steps that run.

## Why the guess gets thrown away

`first.last@domain` is right often enough to be dangerous. Ship it unverified and the
client's bounce rate climbs, the sending domain's reputation drops below the 0.3% complaint
threshold, and the campaign that was working stops working, weeks later, for reasons
nobody connects back to enrichment.

So a `pattern` email that the verifier will not confirm is returned as **empty with
confidence 0**. A blank field is a fact the client can act on. A guess is a liability with
good manners.

## Configuration is one node, not a `.env` file

Open **config**. That is the whole setup. There is no `.env.example` for v2, nothing to set
on the host, and no `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, which also means this is one of
the few templates here that imports and runs on **n8n Cloud** untouched.

```js
const APOLLO_API_KEY = '';
const ROCKETREACH_API_KEY = '';
const VERIFIER_API_KEY = '';
const VERIFIER = 'neverbounce';        // neverbounce | zerobounce | millionverifier
const PATTERN_GUESS_ENABLED = true;
const MIN_CONFIDENCE_TO_SEND = 70;
const MIN_CONFIDENCE_TO_REVIEW = 40;
```

**A blank key skips that step. It does not fail the run.**

| Blank | Effect |
|---|---|
| `APOLLO_API_KEY` | waterfall starts at RocketReach |
| `ROCKETREACH_API_KEY` | waterfall starts at the pattern guess |
| `VERIFIER_API_KEY` | provider hits come back `unknown`; pattern guesses are **dropped** |

Every skip is reported back in `providers_skipped`, so the client can always tell *"we
looked and found nothing"* apart from *"we never looked"*. Enrichment tools are usually
silent about the difference, and it is the difference that decides whether a blank column
means the lead is bad or the setup is broken.

Switching verifier is one line: all three vendors take the key and the address as query
parameters, so `VERIFIER` rewrites the URL and the response reader already speaks all three
vocabularies (`ok`/`valid`, `catch-all`/`catchall`/`catch_all`, and so on).

## Run it before you have any keys

The webhook ships with **pinned sample data**, so this works the moment it is imported:
leave all three keys blank, click **Execute Workflow**, and the response is

```json
{ "email": "", "confidence": 0, "recommended_action": "do_not_send",
  "providers_skipped": ["apollo", "rocketreach", "verifier"] }
```

That is the correct answer, and it is the demo worth showing on a call: **the workflow with
nothing available returns nothing, loudly, instead of a guess that looks like a contact.**
Full three-step demo script in [`demo/README.md`](demo/).

## Flow

```text
Webhook /enrich  (one lead per call)
  └─ config                                  ← the only node you edit
      └─ normalise request                   url → domain, mint lead_id if absent
          └─ Apollo configured? ── no ──────────────────┐
                  │ yes                                 │
                  └─ [cred] Apollo — match person       │
                      └─ read Apollo result             │
                          waterfall after Apollo ◄──────┘
                              └─ Apollo found one? ── yes ───────────────────┐
                                        │ no                                 │
                                        └─ RocketReach configured? ── no ──┐ │
                                                │ yes                      │ │
                                                └─ [cred] RocketReach      │ │
                                                    └─ read result         │ │
                                                  waterfall after RR ◄─────┘ │
                                                      └─ found one? ── yes ──┤
                                                            │ no             │
                                                            └─ guess pattern ┤
                                                                             │
                                collect candidates ◄─────────────────────────┘
                                    └─ anything to verify? ── no ─→ STOP: no address found
                                            │ yes
                                            └─ Verifier configured? ── no ─→ skip
                                                    │ yes
                                                    └─ [cred] Verifier — check email
                                                        └─ read verifier result
                                                            └─ score confidence
                                                                └─ callback? → POST
                                                                    └─ Respond
```

## Confidence scoring

| Source | Base | verifier `valid` | catch-all | `unknown` | no verifier key | `invalid` |
|---|---:|---:|---:|---:|---:|---:|
| Apollo | 70 | **100** send | 75 *review* | 70 send | 70 send | discarded |
| RocketReach | 65 | **95** send | 70 *review* | 65 review | 65 review | discarded |
| Pattern guess | 25 | **55** review | discarded | discarded | discarded | discarded |

**Send at 70+, review 40–69 by hand, never send below 40.** Template 12 enforces exactly
that, and this workflow hands the verdict back as `recommended_action` so both ends agree
without anyone re-deriving it.

Two rules override the number:

- **A catch-all never auto-sends**, however well it scores. A catch-all domain accepts every
  address, so "it didn't bounce" proves nothing about that mailbox. It goes in its own
  segment, sent last, watched on its own, the same rule as the hygiene workflow, except
  here it is in the workflow rather than in a document somebody has to remember.
- **A verifier that errors, times out or runs out of credits returns `unknown`, never
  `valid`.** The failure mode of an outage has to be a lead nobody sends to yet, not a lead
  everybody sends to.

With no verifier key at all, a provider address still scores 70. You are trusting Apollo's
data outright. That is a legitimate way to start and it is also the clearest argument for
US$0.004 a lead: run the same list both ways and show the client the gap.

## Wiring it to Clay

In the Clay table, add an **HTTP API** column:

- Method `POST`, URL = the **production** webhook URL (not the test URL, see the
  QUICKSTART; this is the single most common mistake with these templates).
- Body:

```json
{
  "lead_id": "{{Lead ID}}",
  "first_name": "{{First Name}}",
  "last_name": "{{Last Name}}",
  "domain": "{{Domain}}",
  "company": "{{Company}}",
  "linkedin_url": "{{LinkedIn}}"
}
```

Clay reads the JSON response straight back into columns, `email`, `email_status`,
`confidence`, `recommended_action`, `tried`. No callback needed. `callback_url` is there
for callers that prefer async (template 08 running a large batch, for instance), and it is
stripped from the response so it never lands in a client's sheet.

`lead_id` is the dedupe key everywhere downstream. If the caller omits it, one is minted
from `slug(domain) + "-" + slug(name)` and flagged with `lead_id_generated: true`, so a
caller that thought it was sending an id can see that it did not arrive.

## Setup (about 15 minutes)

1. Import `workflow-v2.json`.
2. Open **config**, paste the keys you have, leave the rest blank. Save.
3. Click **Execute Workflow**. The pinned sample runs immediately. Confirm the shape.
4. Activate, copy the **production** URL, paste it into Clay.
5. Test with someone whose address you already know, then with someone you know is *not* in
   Apollo. The second test is the one that shows the waterfall working.

## Cost per lead

One verifier credit (~US$0.004) for every lead that has an address to check, and none for
leads where every provider missed, because the verifier is gated behind an address existing.
Apollo credit only on a match. RocketReach credit only when Apollo missed. On a typical SME
list that is roughly a third of Clay's per-row cost for the same result.

## Checked, not asserted

```bash
cd demo
node simulate.js     # 16 scenarios through the workflow's real Code nodes
python validate.py   # structure, connections, node references, JS parse
```

`simulate.js` pulls the JavaScript out of every Code node in `workflow-v2.json` and runs it
against a mocked n8n context, so every number in the table above is tested rather than
claimed. Both exit non-zero on failure. Details in [`demo/README.md`](demo/).

## Answering the post

The post asks for four things. Map them out loud, in this order:

| They asked for | Show them |
|---|---|
| "automated workflows for lead generation" | this template, live, in the dry-run demo |
| "connect and integrate different apps" | the Clay column, and the one-line verifier switch |
| "optimize existing workflows for performance and scalability" | the gating. The verifier only fires when there is an address, RocketReach only when Apollo missed. Cost scales with hits, not rows |
| "suggestions for improving automation processes" | `providers_skipped`, and the catch-all rule. Both are opinions about their data quality, which is what they are actually buying |

It is a broad post, so it will land on whoever sounds most specific. The specific thing here
is the discarded guess: everyone else's waterfall returns more addresses than ours, and ours
is the one whose bounce rate stays under 2%.

## Scope we sell this as

**S$1,100 fixed**, build, three providers wired, Clay column configured with them on the
call, confidence thresholds agreed in writing. Adding a fourth provider later: S$250.

Delivery checklist, including the two questions to settle before quoting:
[`../../../docs/COMPLIANCE.md`](../../../docs/COMPLIANCE.md).
