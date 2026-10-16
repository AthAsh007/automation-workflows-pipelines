# Capture form leads with UTM attribution into Airtable

Receives website form leads by webhook, reads UTM tags and click ids from the page URL, classifies the channel (paid, organic, social, email, referral, direct), keeps first touch and last touch per email and upserts the lead into Airtable.

Import `utm-lead-attribution-airtable-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Marketers and founders who run ads and content at the same time and cannot say which channel a lead came from. Every form lead gets a channel, and a returning lead keeps the channel that first brought them in.

## How it works

1. Your website form posts the lead plus the page URL and referrer to a webhook. The form gets an answer straight away.
2. Invalid emails are rejected with a 422 and honeypot submissions are answered quietly and dropped.
3. UTM tags, gclid, fbclid and msclkid are read from the page URL, and the referrer decides between organic, social, referral and direct when there are no tags.
4. The lead is looked up in Airtable by email. A new lead gets first touch = last touch; a returning lead keeps its first touch, gets a new last touch and a touch count, and is upserted on the Email field.

## Sections on the canvas

1. **Receive the lead.** The form posts to `Lead form webhook`, which waits for a respond node so the visitor gets an answer within the same request. A manual run feeds `Load sample lead` through the same path.
2. **Validate, classify and answer.** Rules run in a fixed order: click id or paid medium, then email, social, search and referral. The form is answered before Airtable is touched, so a slow lookup never delays the visitor. Spam gets a normal reply and is dropped.
3. **Look up the email.** A lookup by lowercased email finds a returning lead before anything is written. Without a base id `Load sample existing record` returns a first touch from 23 days ago, so the merge rule is visible.
4. **Keep first touch, write last touch.** First touch fields are copied from the existing record and never overwritten. The upsert merges on Email, so a double submit updates one row instead of creating two. It runs only when `DRY_RUN` is false.

## Setup

1. Run it once as imported from `Run manually`. It classifies a sample returning lead and stops at `STOP: dry run - Airtable untouched`.
2. Create a Leads table with the columns listed in `Merge first and last touch`, add an Airtable token credential to both Airtable nodes and fill in `AIRTABLE_BASE_ID`.
3. Point your form at the production webhook URL with fields email, name, company, page_url, referrer and website (left empty, a honeypot).
4. Send one test lead, check the classification in the execution, then set `DRY_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `AIRTABLE_BASE_ID` | `''` | Airtable base id (starts with app); blank uses the sample lookup |
| `AIRTABLE_TABLE` | `'Leads'` | table name or id holding the leads |
| `OWN_DOMAINS` | `["yourcompany.example"]` | your own sites; a referrer from these counts as direct |
| `PAID_MEDIUMS` | `["cpc","ppc","paid","paid_social","paids` | utm_medium values that mean paid |
| `EMAIL_MEDIUMS` | `["email","newsletter","e-mail"]` | utm_medium values that mean email |
| `SOCIAL_HOSTS` | `["facebook.com","instagram.com","linkedi` | referrer hosts or utm_source values that mean social |
| `SEARCH_HOSTS` | `["google.","bing.com","duckduckgo.com","` | referrer hosts that mean organic search |
| `HONEYPOT_FIELD` | `'website'` | hidden form field; a filled value marks the submission as spam |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Find the lead in Airtable`
- `Upsert the lead in Airtable`

## Requirements

- A website form that can post JSON to a URL
- An Airtable base with a Leads table

## Customising

- `PAID_MEDIUMS`, `SOCIAL_HOSTS` and `SEARCH_HOSTS` hold the classification rules.
- `OWN_DOMAINS` keeps your own site from showing up as a referral.
- `HONEYPOT_FIELD` names the hidden field that bots fill in.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (manual run, sample returning lead) | 15 | none | `STOP: dry run - Airtable untouched` |
| live webhook, new social lead | 14 | `Upsert the lead in Airtable` | `Upsert the lead in Airtable` |
| honeypot and bad email | 9 | none | `STOP: spam dropped` |
| invalid email is rejected | 8 | none | `Reject the submission` |
