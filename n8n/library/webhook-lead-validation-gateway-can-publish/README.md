# Validate, normalise and deduplicate webhook leads before forwarding to a CRM

Sits between your web forms and your CRM: checks required fields, email syntax, common domain typos and disposable domains, normalises phone numbers to E.164 and names to proper case, drops repeats inside a dedupe window, answers 200 or 422 with reasons and forwards clean leads to a CRM webhook.

Import `webhook-lead-validation-gateway-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Marketing and sales ops teams whose landing pages, ad forms and partners all post leads straight into the CRM, along with typos, throwaway addresses, bots and the same person three times. The CRM only sees leads that pass.

## How it works

1. Each form posts its lead to `Receive a lead`. A manual run pushes 7 sample leads through the same rules.
2. Field names are matched loosely (email, Email, email_address), and a filled honeypot field marks the lead as a bot.
3. The email is trimmed and lower-cased, common typos like gmial.com are corrected, and syntax and `DISPOSABLE_PROVIDERS` are checked. Phone numbers become E.164 and names become proper case, including O'Neill and Smith-Jones.
4. A lead whose email or phone was accepted in the last `DEDUPE_HOURS` hours is a duplicate. The hash is kept in workflow static data on live runs.
5. The form gets 200 with a lead id, 200 with duplicate true, or 422 with every reason. Accepted leads are posted to `CRM_WEBHOOK_URL` on a live run.

## Sections on the canvas

1. **Start and settings.** Forms post to `Receive a lead`, which waits for a reply node so the form learns the outcome. Typo and disposable lists, the dedupe window and required fields all live in `config`.
2. **Read the lead.** `Read the incoming lead` rejects an empty body before any rule runs. A manual run uses `Load sample leads`, seven leads that between them trip every rule once.
3. **Validate, dedupe and reply.** All reasons are collected, not just the first, so a form can highlight every bad field in one round trip. Typos are fixed before the disposable check, and duplicates get a 200 so the visitor sees no error.
4. **Forward clean leads.** The reply goes out before the CRM call, so a slow CRM never delays the form. Forwarding needs a live run and a `CRM_WEBHOOK_URL`; otherwise the lead ends at the STOP with its normalised fields visible.

## Setup

1. Run it once as imported. It validates the sample leads and stops at `STOP: not live - lead not forwarded`.
2. Point your forms at the production URL of `Receive a lead` and show the 422 reasons next to the form fields.
3. Set `CRM_WEBHOOK_URL` to your CRM or automation inbound webhook and check `REQUIRED_FIELDS`.
4. Send a few test submissions and read the replies, then set `TEST_RUN = false` to forward.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `CRM_WEBHOOK_URL` | `''` | inbound webhook of your CRM; blank keeps leads here |
| `REQUIRED_FIELDS` | `["name"]` | fields that must be present; at least one of email or phone is always required |
| `DISPOSABLE_PROVIDERS` | `["mailinator","guerrillamail","10minutem` | throwaway mail providers, matched on the domain name before the TLD |
| `DOMAIN_TYPOS` | `{"gmial":"gmail","gmai":"gmail","gamil":` | mistyped provider name -> correct one (gmial.com -> gmail.com) |
| `DEFAULT_COUNTRY_CODE` | `'1'` | country code for phone numbers written without + |
| `DEDUPE_HOURS` | `72` | same email or phone inside this window is a duplicate |
| `HONEYPOT_FIELD` | `'website'` | hidden form field; bots fill it, people do not |
| `MAX_LINKS_IN_MESSAGE` | `2` | more links than this in the message is treated as spam |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- none

## Requirements

- Web forms that can POST JSON
- A CRM or tool with an inbound webhook URL

## Customising

- `DISPOSABLE_PROVIDERS` and `DOMAIN_TYPOS` are plain lists you can extend.
- `DEDUPE_HOURS` sets how long a repeat counts as a duplicate.
- `DEFAULT_COUNTRY_CODE` decides how local phone numbers are read.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample leads) | 14 | none | `Reply 422 with reasons`, `STOP: duplicate not forwarded`, `STOP: not live - lead not forwarded` |
| live webhook lead forwarded | 10 | `Post the lead to the CRM webhook` | `Post the lead to the CRM webhook` |
| bad webhook lead gets 422 | 8 | none | `Reply 422 with reasons` |
