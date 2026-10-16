# Collect testimonials by form, score them, and queue approved ones in Airtable

**Who's it for**
Founders and marketers who ask happy customers for a testimonial and then lose the replies in an inbox. Strong, approved quotes arrive ready to publish; weak or risky ones wait for a person.

**How it works**
1. A customer fills in the hosted n8n form: name, email, company, role, rating, the testimonial and whether you may publish it.
2. The text is scored out of 100: length, numbers and time frames, outcome words like "saved" or "cut", rating, and a named company and role. Shouting and repeated exclamation marks cost points.
3. A blocked word, a missing permission or a score under 70 sends it to review with the reasons; everything else is queued as Ready to publish. The most specific short sentence becomes the pull quote.
4. The record is created in Airtable and the customer gets a thank-you email that matches their permission choice.

**How to set up**
1. Run it once as imported from `Run manually`. It scores 3 sample testimonials and stops at `STOP: test run - Airtable untouched` and `STOP: preview - nothing sent`.
2. Create an Airtable table with the fields listed in `Shape the Airtable record`, add the token credential and set `AIRTABLE_BASE_ID`.
3. Connect Gmail and share the production form URL with customers.
4. Put your address in `TEST_EMAIL` to receive the thank-you emails yourself, then set `TEST_RUN = false`.

**Requirements**
- An Airtable base
- A Gmail account

**How to customize**
- `AUTO_QUEUE_SCORE` sets the bar for Ready to publish.
- `OUTCOME_WORDS` and `BLOCKED_WORDS` tune what counts as specific and what is never published.
- `THANKS_SUBJECT` and `SENDER_NAME` change the email.
