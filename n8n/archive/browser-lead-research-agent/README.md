# 01, AI Lead Research Agent

**Post:** *AI Lead Research Agent, Browser Automation + LLM Data Extraction*

Also the right demo for the scraping half of *CRM & Lead Data Specialist* (07).

## What it does

Takes one company (a domain is enough), reads its site, searches the web for what the site
doesn't say, and returns a **structured, sourced, scored record**. Every claim carrying a
URL, and everything it couldn't establish listed as an unknown rather than quietly invented.

## The design decision worth explaining on the call

**Two model calls, not one.**

1. **Research**, web search enabled, allowed to write prose, told to report only what it
   can source.
2. **Extract**. No tools, no browsing, pinned to a JSON schema with
   `output_config.format`, and told it may not introduce a fact that isn't in the notes.

One call doing both is cheaper and produces confident, plausible headcounts that are wrong.
Separating "find things" from "commit to fields" is what keeps fabricated data out of the
client's CRM, and it's the difference between a demo that impresses and one that survives
a spot-check. Say that out loud when you demo it, buyers who've been burned by an AI
scraper recognise it immediately.

## Flow

```text
Webhook /lead-research ─┐
Run one company (test) ─┴─ normalise request
   └─ Fetch homepage (failure is survivable)
       └─ strip html to text  (12k char cap)
           └─ [cred] Claude — research with web search
               └─ collect research  (prose + source URLs)
                   └─ [cred] Claude — extract structured record  (JSON schema)
                       └─ to lead object   (throws on unparseable output, deliberately)
                           └─ fit score high enough?
                               ├─ yes → [cred] Google Sheets — upsert → Respond
                               └─ no  → STOP: low fit → Respond
```

## Setup (about 20 minutes)

1. Import `workflow.json`, set the env vars from `.env.example`.
2. Optional: attach a Google credential to the Sheets node, or delete that node if the
   caller only wants the webhook response.
3. Activate the workflow to get the production webhook URL.

Call it with:

```bash
curl -X POST https://YOUR-N8N/webhook/lead-research \
  -H "Content-Type: application/json" \
  -d '{"lead_id":"acme-jane-doe","company":"Acme Pte Ltd","domain":"acme.example"}'
```

## Output

```json
{
  "lead_id": "acme-jane-doe",
  "industry": "Freight forwarding",
  "size_hint": "~40 staff (careers page, Jun 2026)",
  "what_they_sell": "Sea and air freight forwarding for SME importers in SEA.",
  "recent_trigger": "Opened a Johor office in March 2026.",
  "visible_pain": "Three open ops-coordinator roles; job ad describes manual booking entry.",
  "decision_maker_role": "Operations Director",
  "fit_score": 78,
  "fit_reason": "Manual booking entry named in their own job ad, and one named ops owner.",
  "evidence": [{"claim": "Manual booking entry", "source_url": "https://acme.example/careers/..."}],
  "unknowns": ["revenue", "current software"]
}
```

## Guardrails

- `Fetch homepage` continues on error. A dead site degrades the record; it doesn't fail the
  run.
- `to lead object` **throws** on an unparseable extraction. That's intentional, a visible
  failed execution beats a row with three empty fields nobody notices.
- The extractor gets no tools, so it cannot browse to "check" a fact and pick up something
  the research pass never saw.
- Fetching is polite: homepage only, no crawl, no login, no session. If a target genuinely
  needs a logged-in browser, that's a separate scoped piece, say so rather than reaching
  for a headless browser on a client's account.

## Cost and runtime

~US$0.05–0.15 and 30–90 seconds per company, mostly the research call. At 200 companies a
month that's under US$30, worth repeating to a client who has been quoted per-enrichment
pricing by a data vendor.

## Scope we sell this as

**S$1,400 fixed**, build, one ICP tuned, webhook handed over, 50 companies researched live
during handover so they see it working on their own list. Retainer to run it: from
S$600/month at 250 companies.
