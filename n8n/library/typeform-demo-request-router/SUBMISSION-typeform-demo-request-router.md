# Route Typeform demo requests to Airtable by company size and region

**Who's it for**
Sales and marketing teams that collect demo requests in Typeform and sort them by hand into a shared Airtable base. Each request lands with the right owner within seconds, and the requester hears back straight away.

**How it works**
1. Typeform posts each submission to the webhook. A manual run uses a sample submission.
2. Answers are read by field ref, not by position, so reordering the form does not break anything. Company size picks the tier: SMB under 50, Mid-market up to 999, Enterprise from 1,000.
3. Country picks the region (AMER, EMEA, APAC), and `ROUTING` picks the owner for that tier and region. SMB requests go to self-serve with a booking link.
4. Requests with no valid email, or from a disposable domain, are rejected. Personal email addresses are flagged. The confirmation goes out through Gmail and the request is added to Airtable.

**How to set up**
1. Run it once from `Run manually`. It routes a sample request and stops at `STOP: preview - nothing sent`.
2. In Typeform, set a ref on each question that matches `FIELD_REFS`, then add the production URL of `Typeform demo request` as a webhook.
3. Add an Airtable token credential to `Add the request to Airtable` and fill `AIRTABLE_BASE_ID`. Connect Gmail.
4. Put your address in `TEST_EMAIL` to receive confirmations yourself, then set `TEST_RUN = false`.

**Requirements**
- A Typeform account with webhooks
- An Airtable base with a Demo requests table
- A Gmail account

**How to customize**
- `SIZE_TIERS` and `REGIONS` change the cut-offs and country lists.
- `ROUTING` maps each tier and region to an owner and meeting link.
- `FIELD_REFS` matches your own question refs.
