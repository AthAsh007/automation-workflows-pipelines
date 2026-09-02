# 08, ICP List Builder

**Post:** *B2B Export List Builder, Apollo, Clay, RocketReach*

Also the list-building half of *AI-Powered B2B Outbound System Builder* (04), and what
template 06 tops up from.

## What it does

Turns an ICP written in plain language into a deduped, email-verified list in a Google
Sheet, and marks the rows that still need enrichment so template 14 can pick them up.

The part that wins the job is not the Apollo call. Every applicant has that. It's that the
list is **deduped by a stable key**, **verified before it leaves the workflow**, and
**honest about what it doesn't know** (`email_status: unknown` rather than a guessed
address dressed up as a real one).

## Flow

```text
Run list build
  └─ ICP definition            ← the only node you edit per client
      └─ plan pages            one item per Apollo page, no loop node needed
          └─ [cred] Apollo — search people
              └─ normalise leads      flatten + build lead_id + dedupe within the run
                  ├─ has an email? ── yes ─→ [cred] Verifier — check email ─→ apply verdict
                  └─────────────── no ──→ flag for enrichment (needs_enrichment: true)
                          └─ merge branches
                              └─ STOP: drop invalid
                                  ├─ [cred] Google Sheets — upsert   (dedupe across runs)
                                  └─ STOP: dropped (invalid email)
```

## Setup (about 15 minutes)

1. Import `workflow.json`.
2. Set the env vars from `.env.example` on the n8n host, and restart n8n.
3. Create a Google Sheet with a tab named `Leads` and a header row containing at least:
   `lead_id, first_name, last_name, title, company, domain, linkedin_url, email,
   email_status, email_source, country, industry, size_hint, stage, needs_enrichment`.
4. Attach a Google service-account credential to the Sheets node and share the Sheet with
   the service account's email address.
5. Edit **ICP definition**. Titles and locations are comma-separated; `employee_ranges`
   uses Apollo's `"11,50"` form.

## Demo script (what to show on a call)

Set `pages: 1`, `per_page: 10`, run it, and share the Sheet. Then say the three things
that matter:

- "Fifty rows in, forty-one out. The nine that dropped were catch-all or invalid, and
  here they are in the execution log. You're not paying to email them."
- "Run it again right now and the Sheet doesn't grow. `lead_id` is stable, so re-running is
  free."
- "These six have `needs_enrichment` set. That's the next workflow's input, not a dead row."

## Inputs and outputs

| | |
|---|---|
| **In** | ICP: titles, locations, employee range, page count |
| **Out** | Rows in `Leads`, conforming to the shared lead object in `../_shared/conventions.md` |
| **Cost per 1,000 leads** | ~US$4 verification + Apollo credits from the client's plan |
| **Runtime** | ~2 minutes per 100 leads, dominated by the verifier |

## Guardrails

- The verifier node is `onError: continueRegularOutput` on purpose: if the verifier is
  down, leads land as `unknown`, not as `valid`. Never invert that.
- No email is invented. If Apollo has it locked, the row goes out empty and flagged.
- Apollo's terms forbid re-selling exported data. The client runs this on the client's own
  key. Don't build lists on our key and hand them over.

## Scope we sell this as

**S$900 fixed**, build, credentials wired, one ICP configured, sheet delivered, 30-minute
handover recording. Additional ICPs S$150 each. If they want it run for them rather than
handed over, that's a retainer conversation, not this line item.
