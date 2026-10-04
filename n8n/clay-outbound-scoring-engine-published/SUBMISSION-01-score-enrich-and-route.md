# Score Clay prospects, enrich only the qualified and route them to Zoho CRM and Smartlead

**Who's it for**
Outbound teams running prospect lists through Clay who pay for enrichment on every row, re-create leads in Zoho CRM by CSV, and paste the good ones into Smartlead by hand.

**How it works**
A Clay HTTP API column posts each row here. `score and tier` scores it on the fields already present against a rule table in `config`, and sets a fit score, an A/B/C/Reject tier, a persona and a recommended action. Disqualifiers and duplicates are caught before anything is spent. Only A and B rows missing an email are enriched, highest score first, up to `ENRICH_BUDGET` a run. Every A/B address is verified, failing closed. A, B and C are upserted to Zoho as Leads matched on email; verified A and B go to a Smartlead campaign per tier. A run summary counts the credits used and saved, and names everyone held back.

**How to set up**
1. Run **Run the demo prospects** first: twelve invented rows, nothing sent.
2. Replace `SCORING`, `TIERS` and `PERSONAS` with your model and map `CLAY_FIELDS`.
3. Add the enrichment, verifier, Zoho and Smartlead keys, and a campaign per tier.
4. Run once with `TEST_CAMPAIGN_ID`, then set `TEST_RUN = false`.

**Requirements**
A Clay table with an HTTP API column, an Apollo key, a MillionVerifier key, a Zoho CRM Self Client, and Smartlead campaigns.

**How to customize**
Every rule, threshold, status and field mapping lives in `config`. Import the companion replies workflow for classification and the daily call list.
