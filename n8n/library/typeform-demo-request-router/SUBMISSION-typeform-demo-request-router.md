# Route Typeform demo requests to Airtable by company size and region

**Who's it for**
Sales and marketing teams that collect demo requests in Typeform and sort them by hand into a shared Airtable base. Each request lands with the right owner within seconds, with a deadline that respects their working hours.

**How it works**
1. Typeform posts each submission to the webhook. A manual run uses a sample submission. Answers are read by field ref, so reordering the form does not break anything.
2. Airtable is searched for earlier requests from the same email. A retried delivery of the same Typeform event stops here. A repeat within `REPEAT_WINDOW_DAYS` goes back to the owner who already has it, and if the lookup fails the request carries on with a flag.
3. Company size picks the tier, country picks the region, and `ROUTING` picks the owner. Missing and disposable emails are rejected.
4. A respond-by time is counted in the region's business hours from `RESPONSE_SLA_HOURS`, so a Friday evening request is due Monday morning, not Saturday.
5. The requester gets a confirmation, the owner of a sales-led tier gets a heads-up with the deadline, and Airtable gets a new record or an update to the earlier one.

**How to set up**
1. Run it once from `Run manually`. It routes a sample request against sample Airtable history and stops at `STOP: preview - nothing sent`.
2. In Typeform, set a ref on each question that matches `FIELD_REFS`, then add the production URL of `Typeform demo request` as a webhook.
3. Add an Airtable token credential to the three Airtable nodes and fill `AIRTABLE_BASE_ID`. The table needs Email, Owner, Submitted at and Typeform event fields. Connect Gmail.
4. Put your address in `TEST_EMAIL` to receive both emails yourself, then set `TEST_RUN = false`.

**Requirements**
- A Typeform account with webhooks
- An Airtable base with a Demo requests table
- A Gmail account

**How to customize**
- `SIZE_TIERS`, `REGIONS` and `ROUTING` change the cut-offs, country lists and owners.
- `BUSINESS_HOURS`, `WORK_DAYS` and `RESPONSE_SLA_HOURS` set the deadline maths. A tier with no SLA gets no owner alert.
- `REPEAT_WINDOW_DAYS` sets how long a repeat request stays with the same owner.
