# Capture form leads with UTM attribution into Airtable

**Who's it for**
Marketers and founders who run ads and content at the same time and cannot say which channel a lead came from. Every form lead gets a channel, and a returning lead keeps the channel that first brought them in.

**How it works**
1. Your website form posts the lead plus the page URL and referrer to a webhook. The form gets an answer straight away.
2. Invalid emails are rejected with a 422 and honeypot submissions are answered quietly and dropped.
3. UTM tags, gclid, fbclid and msclkid are read from the page URL, and the referrer decides between organic, social, referral and direct when there are no tags.
4. The lead is looked up in Airtable by email. A new lead gets first touch = last touch; a returning lead keeps its first touch, gets a new last touch and a touch count, and is upserted on the Email field.

**How to set up**
1. Run it once as imported from `Run manually`. It classifies a sample returning lead and stops at `STOP: dry run - Airtable untouched`.
2. Create a Leads table with the columns listed in `Merge first and last touch`, add an Airtable token credential to both Airtable nodes and fill in `AIRTABLE_BASE_ID`.
3. Point your form at the production webhook URL with fields email, name, company, page_url, referrer and website (left empty, a honeypot).
4. Send one test lead, check the classification in the execution, then set `DRY_RUN = false`.

**Requirements**
- A website form that can post JSON to a URL
- An Airtable base with a Leads table

**How to customize**
- `PAID_MEDIUMS`, `SOCIAL_HOSTS` and `SEARCH_HOSTS` hold the classification rules.
- `OWN_DOMAINS` keeps your own site from showing up as a referral.
- `HONEYPOT_FIELD` names the hidden field that bots fill in.
