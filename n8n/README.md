# n8n workflows

Twelve workflows that run end to end on import, before a single credential exists,
plus six single-file starters in [`starters/`](starters/) and fourteen older ones in
[`archive/`](archive/).

[`../docs/WORKFLOWS.md`](../docs/WORKFLOWS.md) indexes every one of them by mechanism,
which is the faster way in if you are looking for a technique rather than an industry.

## Publishing status

A folder name ending in `-published` is live on the
[n8n template library](https://n8n.io/creators/athash007/). A name ending in `-can-publish`
holds `-publish.json` files that pass `submission_lint` with no errors and a matching
`SUBMISSION-*.md` description, so they can be submitted as they are.

**Published (13 templates)**

| Folder | Template | n8n id |
| --- | --- | --- |
| [crm-data-hygiene-published](crm-data-hygiene-published/) | Audit CRM lead data quality with Google Sheets and NeverBounce | 19432 |
| [inbound-enquiry-router-published](inbound-enquiry-router-published/) | Capture cleaning enquiries from WordPress forms with Google Sheets and Gmail | 19543 |
| | Chase stalled enquiries and send a weekday morning digest with Google Sheets and Gmail | 19546 |
| [recruiting-candidate-engine-published](recruiting-candidate-engine-published/) | Score ATS candidates and enroll top matches into Supabase outreach campaigns | 19775 |
| | Send scheduled SMS and voice outreach from Supabase via Twilio and Retell | 19776 |
| | Qualify inbound candidate replies and book interviews with Retell and Google Calendar | 19777 |
| [lead-enrichment-and-verification-published](lead-enrichment-and-verification-published/) | Enrich and verify partnership leads from Google Sheets with Apollo and Instantly | 19778 |
| [order-to-ship-engine-published](order-to-ship-engine-published/) | Log Shopify, Etsy and Square orders to Google Sheets and confirm via Gmail | 19867 |
| | Send shipping emails with tracking from Google Sheets via ShipStation and Gmail | 19868 |
| [gold-chain-catalogue-engine-published](gold-chain-catalogue-engine-published/) | Reprice gold chain stock daily and announce it on WhatsApp with Google Sheets, goldapi.io and Twilio | 20020 |
| | Answer WhatsApp gold chain enquiries with Google Sheets, Twilio, and OpenAI | 20021 |
| [clay-outbound-scoring-engine-published](clay-outbound-scoring-engine-published/) | Score Clay prospects, enrich qualified leads, and route them to Zoho CRM and Smartlead | 20022 |
| | Classify Smartlead replies and build a daily call list with Zoho CRM and OpenAI | 20023 |

**Can publish (21 templates)**

| Folder | Template title in the `-publish.json` |
| --- | --- |
| [brand-deal-outreach-engine-can-publish](brand-deal-outreach-engine-can-publish/) | Send personalised brand deal pitches from Airtable with Instantly |
| | Classify outreach replies and report weekly from Airtable to Slack |
| [ghl-lead-intake-router-can-publish](ghl-lead-intake-router-can-publish/) | Route inbound leads from forms, email and calls into GoHighLevel |
| | Send follow-up touches to quiet leads in GoHighLevel |
| [pipedrive-referral-network-can-publish](pipedrive-referral-network-can-publish/) | Create next activities for uncovered open deals in Pipedrive |
| | Report a referral pipeline funnel from Pipedrive to Google Sheets |
| [voice-avatar-reply-engine-can-publish](voice-avatar-reply-engine-can-publish/) | Triage inbound enquiries with AI and queue voice or video replies |
| | Generate avatar video replies with ElevenLabs and HeyGen |
| [social-post-with-approval-can-publish](social-post-with-approval-can-publish/) | Draft LinkedIn posts with AI and send them to Discord for approval |
| | Publish approved LinkedIn posts from a Google Sheets queue |
| [zoho-crm-lead-router-can-publish](zoho-crm-lead-router-can-publish/) | Route inbound leads from forms, email and calls into Zoho CRM |
| | Create next-action tasks for stalled deals in Zoho CRM |
| [support-email-rag-responder-can-publish](support-email-rag-responder-can-publish/) | Answer support emails in Gmail from a Pinecone knowledge base with OpenAI |
| | Load help pages into a Pinecone knowledge base with OpenAI embeddings |
| [trello-sms-notifier-can-publish](trello-sms-notifier-can-publish/) | Send SMS alerts from new Trello cards with Twilio |
| [starters/ai-news-digest-can-publish](starters/ai-news-digest-can-publish/) | Filter and summarise RSS news with AI into Google Sheets |
| [starters/b2b-lead-sourcing-can-publish](starters/b2b-lead-sourcing-can-publish/) | Source and verify B2B leads with Apify into Google Sheets |
| [starters/cold-email-and-reply-triage-can-publish](starters/cold-email-and-reply-triage-can-publish/) | Send cold outreach from a lead file and detect replies in Gmail |
| [starters/newsletter-signup-to-mailchimp-can-publish](starters/newsletter-signup-to-mailchimp-can-publish/) | Subscribe newsletter signups to Mailchimp from a webhook and welcome them by email |
| [starters/applicant-tracking-sync-can-publish](starters/applicant-tracking-sync-can-publish/) | Sync job applicants from Google Sheets to Notion and email them by stage |
| [starters/whatsapp-lead-and-reminders-can-publish](starters/whatsapp-lead-and-reminders-can-publish/) | Score WhatsApp leads with AI and send reminders over Twilio |

## Workflows

| Workflow | What it does | Trigger |
| --- | --- | --- |
| [lead-enrichment-and-verification-published](lead-enrichment-and-verification-published/) | Raw organisation list, segmented, decision makers found, every address verified, scored, deduplicated, loaded into an email campaign. Everyone held back is recorded with the reason. | Weekdays 07:00 and manual |
| [inbound-enquiry-router-published](inbound-enquiry-router-published/) | Website form, tracking sheet, instant reply with the standard questions, routed by postcode, nudged at 48 hours, morning digest. Two workflows. | Form webhook and weekdays 08:30 |
| [crm-data-hygiene-published](crm-data-hygiene-published/) | Weekly CRM audit. Formatting is fixed automatically; duplicates, malformed addresses and likely job changes are reported and never auto-resolved. Stale verifications are rechecked and failures suppressed. One health score logged a week. | Sunday 20:00 |
| [personalised-outbound-email](personalised-outbound-email/) | One personalised email per sheet row with real deliverables attached, then the outcome written back to the row. | Weekdays 09:00 and manual |
| [social-post-with-approval-can-publish](social-post-with-approval-can-publish/) | Caption drafted, graphic rendered from a deterministic HTML template, draft posted to a chat channel, published only after a human replies. Two workflows. | Daily and on approval |
| [recruiting-candidate-engine-published](recruiting-candidate-engine-published/) | ATS job order, scored candidates, an SMS and voice contact ladder, qualification, recruiter booking, ATS write-back. State in Postgres. Three workflows. | ATS webhook, every 15 minutes, inbound webhook |
| [ghl-lead-intake-router-can-publish](ghl-lead-intake-router-can-publish/) | A lead from any source, read in whatever shape it arrived, routed to an owner, stage and tags by a first-match rule table, then written to the CRM as one payload built in one place. A second workflow walks unanswered leads down an ordered ladder and stops on a reply, a stage move or the cap, saying which. Two workflows. | Webhook, manual and weekdays 08:00 |
| [order-to-ship-engine-published](order-to-ship-engine-published/) | Store order parsed and deduplicated, written to the production board first, confirmed with a shipping window the rules can support, then tracking and a personalised shipping and installation email from per-product rules. Two workflows. | Store webhook, weekdays 08:30 and 16:30 |
| [brand-deal-outreach-engine-can-publish](brand-deal-outreach-engine-can-publish/) | Creator-partnership outreach at volume where the quality claims are gates rather than promises. A personalisation audit holds any pitch with an invented number or a template tell; deliverability fails closed per mailbox and per domain. Two workflows. | Weekdays 08:00 and hourly |
| [pipedrive-referral-network-can-publish](pipedrive-referral-network-can-publish/) | The rule an event-driven CRM cannot express, asked of every open deal each morning: no open opportunity without a next activity. A question about absence, which is why nothing event-driven answers it. Two workflows. | Weekdays 07:00 and Mondays 08:00 |
| [voice-avatar-reply-engine-can-publish](voice-avatar-reply-engine-can-publish/) | An enquiry triaged into a written reply, a synthesised voice note or an avatar video. Rendering has to be earned; complaints, legal and press get no automated answer. The render half polls with a bound and gives up rather than hanging. Two workflows. | Webhook and manual |
| [trello-sms-notifier-can-publish](trello-sms-notifier-can-publish/) | A card on a watched list, its fields read from the card name, the description text or a custom field, composed into an SMS and sent. The smallest complete example of the conventions here. | Trello webhook |

## Importing one

1. In n8n, **Workflows → Import from file**, and pick the `.json`.
2. Open the node named `config`. It is the only node you edit. Every setting is a
   commented constant at the top of it.
3. Leave `TEST_RUN = true` and every optional key blank. Execute the workflow.
   It completes, and the execution list shows a named `STOP:` node wherever a
   branch was skipped.
4. Fix the `[cred] <Service> - <verb>` nodes next. Those are the only nodes that
   need an n8n credential.

Read [`../docs/SAFETY.md`](../docs/SAFETY.md) before you set `TEST_RUN = false`.

## The conventions

Every workflow here follows [`../docs/CONFIG-NODE.md`](../docs/CONFIG-NODE.md):
one Code node named `config` holds every setting, nothing reads `$env` or `$vars`,
optional integrations degrade to a named skip instead of failing, and the shipped
default does nothing irreversible.

[`crm-data-hygiene-published/workflow.json`](crm-data-hygiene-published/workflow.json) is the
reference implementation. Read that one first.

## The build directory

Where a workflow has a `build/`, its Code nodes are real files rather than strings
inside the JSON:

```
build/
├── js/            one file per Code node, named after the node
├── build.py       compiles js/*.js into the workflow JSON
├── validate.py    checks the graph: one config node, no $env, every branch named
└── simulate.js    runs the logic against sample/ with no network access
```

Editing a Code node means editing the `.js` file and running `python build.py`.
Editing the JSON directly means the next build overwrites you.

```bash
cd n8n/<workflow>/build
node simulate.js      # run the logic against the fixtures
python validate.py    # check the graph
python build.py       # write the .js files back into the workflow JSON
```

`simulate.js` makes no network calls. It is the fastest way to see what a workflow
does with a given input, and it is what a change should be checked against before
it reaches an n8n instance.

## Fixtures

`sample/` and `sheet/` hold the data a workflow is developed against. Every
address is at a `.example` domain and every phone number is in the `555-01xx`
range, so importing a workflow and running it against its own fixtures cannot
contact anyone. See [`../NOTICE`](../NOTICE).

## starters/

Six single-file workflows: an RSS digest, B2B sourcing, cold email with reply triage,
a Mailchimp signup, an applicant sync, and one WhatsApp number doing three jobs. One
`.json` each, nothing to compile.

They do **not** follow [`../docs/CONFIG-NODE.md`](../docs/CONFIG-NODE.md): most have no
`config` node and none have a `STOP:` gate, so the first run of an unedited file can
send. [`starters/README.md`](starters/README.md) says what to do about that, and
[`../docs/CONFIG-NODE.md`](../docs/CONFIG-NODE.md) section 9 is the conversion.

## archive/

Fourteen older workflows, one per brief shape, kept for the range of graph shapes
rather than because they are current. Most still read `$env` and predate the
config-node rule. [`../docs/CONFIG-NODE.md`](../docs/CONFIG-NODE.md) §9 has the
five-step conversion.
