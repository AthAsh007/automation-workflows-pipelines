# Starters

Six single-file workflows. One `.json` each, a README beside it, nothing to compile.

They are here because each one is the shortest complete answer to a common request,
and a short workflow is easier to read than a long one. They are **not** built to
[`../../docs/CONFIG-NODE.md`](../../docs/CONFIG-NODE.md): most have no `config` node, none
have a `STOP:` gate, and a few carry settings on the nodes that use them. That is the
difference between these and the workflows in [`../`](../).

| Workflow | What it does | Trigger |
| --- | --- | --- |
| [ai-news-digest-can-publish](ai-news-digest-can-publish/) | Several RSS feeds merged, judged for relevance by one model, and only the survivors fetched and summarised by a second. Rows appended to a sheet. | Manual |
| [b2b-lead-sourcing-can-publish](b2b-lead-sourcing-can-publish/) | A search brief in, companies sourced, contact addresses found and verified, then a first email drafted per lead and written back for review. | Form and manual |
| [cold-email-and-reply-triage-can-publish](cold-email-and-reply-triage-can-publish/) | A lead list imported and upserted, the first touch sent, and incoming replies matched to a lead and classified against a fixed schema. | Form, schedule, Gmail |
| [newsletter-signup-to-mailchimp-can-publish](newsletter-signup-to-mailchimp-can-publish/) | A signup validated before anything else happens, an existing address updated rather than re-added, a welcome email sent, and the form answered either way. | Webhook |
| [applicant-tracking-sync-can-publish](applicant-tracking-sync-can-publish/) | New applicants read from a sheet, deduplicated against Notion, added, and stage-change emails sent from templates held in Notion. | Schedule and Notion |
| [whatsapp-lead-and-reminders-can-publish](whatsapp-lead-and-reminders-can-publish/) | Three flows on one WhatsApp number: an inbound enquiry scored by a model, overdue invoices chased, and a new customer welcomed. | WhatsApp, schedule, form |

## Before you run one

These ship without the safety switch the rest of the repo relies on, so the first run
of an unedited file can send. Read [`../../docs/SAFETY.md`](../../docs/SAFETY.md), then
either disconnect the send node or point every credential at a test account before you
press Execute.

## Converting one

[`../../docs/CONFIG-NODE.md`](../../docs/CONFIG-NODE.md) section 9 is the five-step
conversion: collect the settings into one `config` node, read them downstream, give each
optional integration a named skip, add the `TEST_RUN` gate, and check that the shipped
default does nothing irreversible. [`../crm-data-hygiene-published/workflow.json`](../crm-data-hygiene-published/workflow.json)
is what the result looks like.

## Fixtures

Where a workflow ships pinned data, every address is at a `.example` domain and every
phone number is in the `555-01xx` range, so running one against its own pinned data
cannot contact anyone. See [`../../NOTICE`](../../NOTICE).

Two workflows had their pinned data removed rather than rewritten, because it held real
scraped contact records and full third-party article text. Each README says so and says
what to pin in its place.
