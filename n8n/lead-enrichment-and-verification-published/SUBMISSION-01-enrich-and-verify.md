# Enrich and verify partnership leads from Google Sheets into Instantly

**Who's it for**
Partnership, referral and B2B outreach teams who have a raw list of organisations and need the
decision maker found, the address proved deliverable, and only the safe contacts handed to a
sending tool. Built for anyone whose bounce rate is a number somebody checks.

**How it works**
Each weekday it takes a batch from the raw list in Google Sheets, normalises each organisation and
classifies it — by keyword rules, or by an AI call when the rules are not confident. Apollo is asked
for the decision makers, everyone is scored against your ICP, and every address goes to a verifier.
The gate is the point of the whole workflow: it **fails closed**. A verifier that times out, runs
out of credits or returns something unrecognised produces `unknown`, and `unknown` is held back.
Catch-all addresses are held by default too, because they pass a verifier and still bounce. What
survives is written to two sheet tabs and pushed to an Instantly campaign; everything held is
written down with the reason in plain words.

**How to set up**
1. Open **`config`** and set your sheet id, the batch size and `ACCEPT_STATUSES`.
2. Add Apollo, verifier, AI and Instantly keys as you get them — each is optional.
3. Leave `TEST_RUN = true` and `TEST_CAMPAIGN_ID` blank for the first run.

**Requirements**
A Google Sheet with a raw organisation list. Apollo, an email verifier, an OpenAI-compatible
endpoint and Instantly are each optional — a blank key skips that step rather than failing the run.

**How to customize**
The ICP scoring is in **`score against the ICP`** and the accept list is in `config`. To swap the
verifier or the sending tool, replace that one HTTP node — nothing else changes.
