# Collect NPS from an n8n form and create HubSpot tasks for detractors

Hosts an NPS survey as an n8n form, scores and tags each answer, creates a HubSpot task for the account owner and a Slack alert when someone scores 0 to 6, asks promoters for a review by Gmail, and logs every answer to Google Sheets.

Import `nps-detractor-follow-up-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Customer success teams at B2B companies who want an NPS survey without a survey tool, and want unhappy customers to reach a named person the same day.

## How it works

1. Customers answer a four-question n8n form: email, score from 0 to 10, reason and company. A manual run uses a sample answer.
2. The contact and its owner are looked up in HubSpot by email. The score sets the category (promoter 9-10, passive 7-8, detractor 0-6) and keywords tag the reason with themes such as support or pricing.
3. Every answer is appended to a Google Sheets log with its category and themes.
4. A detractor creates a high-priority HubSpot task for the account owner, due in one business day, and tags that owner in Slack. A promoter gets a short email asking for a review. Passives are logged only.

## Sections on the canvas

1. **Start and settings.** The n8n form is the survey, so there is no survey tool to pay for. `Run manually` replays a sample detractor. Themes, owners and links live in `config`.
2. **Find the owner, score and log.** The owner is looked up before scoring so the log row names who is responsible. Every answer is logged, including passives, but only on a live run with `NPS_SHEET_ID` set.
3. **Act on the category.** `Route by category` sends detractors to a HubSpot task and a Slack alert, promoters to a review request, passives to the log only. A blank or out-of-range score ends at `STOP: no valid score`. Each action has its own gate.

## Setup

1. Run it once from `Run manually`. It handles a sample detractor and stops at `STOP: not live - no task created`, `STOP: preview - nothing posted` and `STOP: not live - nothing logged`.
2. Add a HubSpot private app credential to both HubSpot nodes and set `USE_HUBSPOT = true`. Map owner ids to Slack ids in `OWNERS`.
3. Connect Google Sheets with `NPS_SHEET_ID`, Slack with `SLACK_CHANNEL_ID`, and Gmail. Set `REVIEW_URL` to your review page.
4. Put your address in `TEST_EMAIL` to receive review requests yourself, then set `TEST_RUN = false` and share the form URL.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_HUBSPOT` | `false` | set true after adding the HubSpot credential to both HubSpot nodes |
| `OWNERS` | `{"101":{"name":"Maya Ortiz","slack_id":"` | HubSpot owner id -> name and Slack member id |
| `FALLBACK_OWNER_ID` | `'101'` | owner for detractors whose contact has no owner or is not in HubSpot |
| `THEMES` | `{"support":["support","response","ticket` | theme -> words in the reason that tag it |
| `REVIEW_URL` | `'https://www.g2.com/products/yourcompa...'` | link promoters are asked to review on |
| `NPS_SHEET_ID` | `''` | Google Sheets id with an NPS tab; blank logs nothing |
| `SLACK_CHANNEL_ID` | `''` | channel for detractor alerts; blank posts nothing |
| `SENDER_NAME` | `'Maya at Fieldnote'` | sign-off on the review request |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Find the contact in HubSpot`
- `Append to the NPS log`
- `Create the HubSpot task`
- `Alert the owner in Slack`
- `Email the review request`

## Requirements

- A HubSpot account with a private app token
- A Google Sheet for the log
- A Gmail account
- Optional: a Slack workspace

## Customising

- `THEMES` maps each theme to the words that tag it.
- `FALLBACK_OWNER_ID` takes detractors whose contact has no owner.
- `REVIEW_URL` and `SENDER_NAME` shape the promoter email.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview, sample detractor) | 16 | none | `STOP: not live - nothing logged`, `STOP: not live - no task created`, `STOP: preview - nothing posted` |
| promoter from the form, test send | 14 | `Email the review request` | `STOP: not live - nothing logged`, `Email the review request` |
| live detractor with HubSpot, Slack and Sheets | 17 | `Append to the NPS log`, `Create the HubSpot task`, `Alert the owner in Slack` | `Append to the NPS log`, `Create the HubSpot task`, `Alert the owner in Slack` |
| passive is logged only | 13 | none | `STOP: passive - logged only`, `STOP: not live - nothing logged` |
