# What each workflow proves

A mechanism index. Most automation briefs want one of about a dozen mechanisms wearing a
different industry's clothes, so the useful question is not "is there a workflow for this
client" but "which workflow already proves this mechanism".

Twelve workflows in [`../n8n/`](../n8n/) follow [`CONFIG-NODE.md`](CONFIG-NODE.md): every
setting in one `config` node, no `$env`, a named `STOP:` on every gate, and a shipped
default that does nothing irreversible. Six more in [`../n8n/starters/`](../n8n/starters/)
are single-file templates that do not.

## Outbound and lead generation

### [brand-deal-outreach-engine-can-publish](../n8n/brand-deal-outreach-engine-can-publish/)
- **Mechanism:** personalised outbound at volume where the quality claims are gates rather than promises. A personalisation audit holds any pitch carrying an invented number or a template tell; a deliverability gate fails closed per mailbox and per domain; same-day logging is reconciled; reply routing never guesses.
- **Worth copying for:** turning "personalised at volume" into something checkable, suppression and DNC handling, per-mailbox and per-domain ceilings, a weekly report that shows what the gates cost.
- **Stack:** Airtable, Instantly, a writing model.

### [personalised-outbound-email](../n8n/personalised-outbound-email/)
- **Mechanism:** one personalised email per sheet row with real deliverables attached, then the outcome written back to the row.
- **Worth copying for:** facts assembled in code with the model only rewriting the subject and opener, per-row merge fields, an outcome that is recorded whether the send worked or not.
- **Stack:** Google Sheets, SMTP, a writing model.

### [lead-enrichment-and-verification-published](../n8n/lead-enrichment-and-verification-published/)
- **Mechanism:** a raw organisation list, segmented, decision makers found, every address verified, scored, deduplicated, loaded into a campaign. Everyone held back is recorded with the reason.
- **Worth copying for:** a bounce rate held as a gate outcome rather than hoped for, rule-first segmentation with an AI fallback, scoring you can read off the row.
- **Stack:** Apollo, Instantly, Google Sheets, a classifying model.

## Inbound and intake

### [inbound-enquiry-router-published](../n8n/inbound-enquiry-router-published/)
- **Mechanism:** a website form, tracked before any email goes out, acknowledged instantly, routed by postcode, chased at 48 hours, digested each morning.
- **Worth copying for:** writing the row first so an enquiry survives a mail failure, reading a form whatever the plugin calls its fields, business rules that live in config rather than in nodes.
- **Stack:** Google Sheets, SMTP.

### [ghl-lead-intake-router-can-publish](../n8n/ghl-lead-intake-router-can-publish/)
- **Mechanism:** a lead from any source, read in whatever shape it arrived, routed to an owner, stage and tags by a first-match rule table, then written to the CRM as one payload built in a single place. A second workflow walks unanswered leads down an ordered ladder of touches and stops on a reply, a stage move or the cap, saying which.
- **Worth copying for:** one rule table instead of branching nodes, a refused write landing on a named STOP with the response attached, the whole thing demonstrating with no account at all.
- **Stack:** GoHighLevel over HTTP, two workflows on one shared config.

### [recruiting-candidate-engine-published](../n8n/recruiting-candidate-engine-published/)
- **Mechanism:** an ATS job order, scored candidates, an SMS and voice contact ladder, qualification, recruiter booking, ATS write-back, with the state in Postgres.
- **Worth copying for:** a contact ladder as durable state rather than a wait node, a human-action fallback, signature verification on the inbound webhook.
- **Stack:** Postgres or Supabase, Twilio, Retell AI, Bullhorn and Ceipal shapes.

## CRM and data

### [crm-data-hygiene-published](../n8n/crm-data-hygiene-published/)
- **Mechanism:** a weekly audit. Formatting is fixed automatically; duplicates, malformed addresses and likely job changes are reported and never auto-resolved. Stale verifications are rechecked and failures suppressed.
- **Worth copying for:** the split between information-preserving fixes and anything lossy, duplicates listed with their ids so a human decides, one health score logged a week. This is the reference implementation of the config rule.
- **Stack:** Google Sheets, an address verifier.

### [pipedrive-referral-network-can-publish](../n8n/pipedrive-referral-network-can-publish/)
- **Mechanism:** a rule an event-driven CRM cannot express, asked of every open deal each morning. Event automations fire on a stage change or a deal created; they cannot answer "which deals have nothing scheduled right now", because that is a question about absence and nothing happens when nothing happens.
- **Worth copying for:** scheduled enforcement of a negative rule, overdue items escalated rather than stacked, a field boundary that stops the run rather than logging a warning, and a funnel report that spans objects the CRM's own reporting cannot join.
- **Stack:** Pipedrive.

## Content and publishing

### [social-post-with-approval-can-publish](../n8n/social-post-with-approval-can-publish/)
- **Mechanism:** a caption drafted, a graphic rendered from a deterministic HTML template, the draft posted to a chat channel, and publication only after a human replies.
- **Worth copying for:** the approval being a human in the channel they already watch, so the workflow cannot approve itself; a layout validated before it is sent rather than after.
- **Stack:** Google Sheets, an HTML-to-image renderer, a chat channel, the LinkedIn API.

## Operations and fulfilment

### [order-to-ship-engine-published](../n8n/order-to-ship-engine-published/)
- **Mechanism:** a store webhook, parsed and deduplicated, written to the production board first, confirmed with a shipping window the rules can support, then tracking and a personalised shipping and installation email built from per-product rules.
- **Worth copying for:** an order that is never typed twice, never promised a date the rules cannot support, and never shipped unconfirmed.
- **Stack:** Shopify, Etsy and Square shapes, Google Sheets, ShipStation, SMTP.

### [trello-sms-notifier-can-publish](../n8n/trello-sms-notifier-can-publish/)
- **Mechanism:** a card lands on a watched list, its fields are read from wherever they are (card name, description text or a custom field), and an SMS is composed and sent.
- **Worth copying for:** the smallest complete example of the conventions: one config node, preview mode, named STOP nodes, and a simulation that traces every branch. A good first read.
- **Stack:** Trello, Twilio.

## Voice and avatar

### [voice-avatar-reply-engine-can-publish](../n8n/voice-avatar-reply-engine-can-publish/)
- **Mechanism:** an inbound enquiry triaged by a low-latency model, or by keyword rules when no key is set, into a written reply, a synthesised voice note or an avatar video. Rendering has to be earned: low confidence drops back to text, and complaints, legal and press get no automated answer at all. The second workflow renders, with the avatar driven on a bounded poll that gives up rather than hanging.
- **Worth copying for:** an asynchronous render with a real timeout, TTS bytes proved to be audio before anything trusts them, every stage stamping its latency against a budget.
- **Stack:** ElevenLabs, HeyGen.

## Starters

Single-file workflows in [`../n8n/starters/`](../n8n/starters/). They do not follow the
config-node rule, so read [`../n8n/starters/README.md`](../n8n/starters/README.md) before
running one.

| Workflow | Mechanism | Stack |
| --- | --- | --- |
| [ai-news-digest-can-publish](../n8n/starters/ai-news-digest-can-publish/) | Feeds merged, filtered by one model, and only survivors fetched and summarised by a second. Filtering before fetching is the design. | RSS, Browserless, Google Sheets |
| [b2b-lead-sourcing-can-publish](../n8n/starters/b2b-lead-sourcing-can-publish/) | A search brief in, companies sourced, addresses found and verified, a first email drafted and written back for review rather than sent. | Apify, Google Sheets |
| [cold-email-and-reply-triage-can-publish](../n8n/starters/cold-email-and-reply-triage-can-publish/) | A lead list upserted, the first touch sent, replies matched to a lead and classified. Only the prospect's own messages reach the classifier. | Gmail, n8n data tables |
| [newsletter-signup-to-mailchimp-can-publish](../n8n/starters/newsletter-signup-to-mailchimp-can-publish/) | A signup validated before anything else happens, an existing address updated rather than re-added, both outcomes answered explicitly. | Mailchimp, Gmail |
| [applicant-tracking-sync-can-publish](../n8n/starters/applicant-tracking-sync-can-publish/) | Applicants deduplicated against Notion before insert, and stage emails driven by a stored previous stage because the trigger says a page changed, not what changed. | Notion, Google Sheets, Gmail |
| [whatsapp-lead-and-reminders-can-publish](../n8n/starters/whatsapp-lead-and-reminders-can-publish/) | Three flows on one number: an enquiry scored against a fixed schema, overdue invoices chased, a new customer welcomed. | Twilio WhatsApp, n8n data tables |

## Running any of the twelve

Import the JSON, open the `config` node, leave `TEST_RUN = true` and every optional key
blank, and execute. The run completes and the execution list shows a named `STOP:` node
wherever a branch was skipped. Nodes that need a credential are prefixed `[cred]`, and
they are the only ones that do.

Read [`SAFETY.md`](SAFETY.md) before setting `TEST_RUN = false`.
