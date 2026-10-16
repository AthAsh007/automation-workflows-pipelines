# Classify inbound sales emails with OpenAI and create Gmail reply drafts

**Who's it for**
Founders and small sales teams who answer the same five kinds of reply to their outreach every day. Each reply already has a draft waiting in the thread, and nothing is sent without a person pressing Send.

**How it works**
1. The Gmail trigger picks up new inbox emails. A manual run uses 7 sample replies.
2. Senders from your own domains are skipped. The rest are classified by OpenAI when `USE_OPENAI` is true, or by keyword rules checked in a fixed order: unsubscribe, out of office, objection, demo, pricing.
3. Pricing, demo and objection replies get a draft from `REPLY_TEMPLATES`, filled with the sender's first name and your links, and threaded under the original email.
4. Unsubscribe requests get no draft. They are appended to the Suppression tab so outreach tools can exclude them. Out-of-office and unclear emails are left alone.
5. A model answer with an unknown intent or confidence under `MIN_CONFIDENCE` is treated as unclear, so a weak guess never becomes a draft.

**How to set up**
1. Run it once as imported. It classifies the sample emails and stops at `STOP: dry run - no drafts created`.
2. Connect Gmail to `New sales email in Gmail` and `Create the Gmail draft`, and set `OWN_DOMAINS`.
3. Edit `REPLY_TEMPLATES`, `CALENDAR_URL` and `PRICING_URL`. Optionally add an OpenAI credential and set `USE_OPENAI = true`, and set `SUPPRESSION_SHEET_ID`.
4. Check the planned drafts in `Pick a reply template`, then set `DRY_RUN = false`.

**Requirements**
- A Gmail account
- Optional: an OpenAI API key
- Optional: a Google Sheet with a Suppression tab

**How to customize**
- `INTENT_KEYWORDS` lists the phrases behind each rule.
- `REPLY_TEMPLATES` holds one reply per intent; {first_name}, {calendar_url} and {pricing_url} are filled in.
- `MAX_DRAFTS` caps drafts per run.
