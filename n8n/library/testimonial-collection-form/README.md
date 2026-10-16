# Collect testimonials by form, score them, and queue approved ones in Airtable

Collects customer testimonials through an n8n form, scores each one for length, specific detail, rating and attribution, checks publishing permission and language, picks a pull quote, files it in Airtable as ready to publish or needs review, and thanks the customer by email.

Import `testimonial-collection-form-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Founders and marketers who ask happy customers for a testimonial and then lose the replies in an inbox. Strong, approved quotes arrive ready to publish; weak or risky ones wait for a person.

## How it works

1. A customer fills in the hosted n8n form: name, email, company, role, rating, the testimonial and whether you may publish it.
2. The text is scored out of 100: length, numbers and time frames, outcome words like "saved" or "cut", rating, and a named company and role. Shouting and repeated exclamation marks cost points.
3. A blocked word, a missing permission or a score under 70 sends it to review with the reasons; everything else is queued as Ready to publish. The most specific short sentence becomes the pull quote.
4. The record is created in Airtable and the customer gets a thank-you email that matches their permission choice.

## Sections on the canvas

1. **Collect the testimonial.** The hosted `Testimonial form` asks for permission as a required Yes or No, so consent is never inferred. A manual run feeds `Load sample testimonials` through the same path.
2. **Score and pick a pull quote.** Specific numbers and outcomes are worth more than praise, because "cut close from six days to two" sells and "great product" does not. Every point is kept in parts, so a reviewer can see why a quote landed in review.
3. **File in Airtable and say thanks.** Airtable is written only on a live run with a base id, review or not, so nothing is lost. The thank-you follows the usual preview and test gates and is redirected to `TEST_EMAIL` in test mode.

## Setup

1. Run it once as imported from `Run manually`. It scores 3 sample testimonials and stops at `STOP: test run - Airtable untouched` and `STOP: preview - nothing sent`.
2. Create an Airtable table with the fields listed in `Shape the Airtable record`, add the token credential and set `AIRTABLE_BASE_ID`.
3. Connect Gmail and share the production form URL with customers.
4. Put your address in `TEST_EMAIL` to receive the thank-you emails yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `AIRTABLE_BASE_ID` | `''` | Airtable base id (starts with app); blank means nothing is stored |
| `AIRTABLE_TABLE` | `'Testimonials'` | table name or id |
| `AUTO_QUEUE_SCORE` | `70` | score from 0 to 100 needed for Ready to publish |
| `OUTCOME_WORDS` | `["saved","cut","reduced","faster","incre` | words that signal a concrete outcome |
| `BLOCKED_WORDS` | `["damn","crap","hell","shit","wtf"]` | whole words that send a testimonial to review |
| `THANKS_SUBJECT` | `'Thank you for the kind words'` | subject of the thank-you email |
| `SENDER_NAME` | `'Mara, Tallyroom'` | sign-off on the thank-you email |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Create the Airtable record`
- `Email the thank-you`

## Requirements

- An Airtable base
- A Gmail account

## Customising

- `AUTO_QUEUE_SCORE` sets the bar for Ready to publish.
- `OUTCOME_WORDS` and `BLOCKED_WORDS` tune what counts as specific and what is never published.
- `THANKS_SUBJECT` and `SENDER_NAME` change the email.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (manual sample testimonials) | 12 | none | `STOP: test run - Airtable untouched`, `STOP: preview - nothing sent` |
| live form submission | 12 | `Create the Airtable record`, `Email the thank-you` | `Create the Airtable record`, `Email the thank-you` |
