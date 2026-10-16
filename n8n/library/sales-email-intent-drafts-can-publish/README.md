# Classify inbound sales emails with OpenAI and create Gmail reply drafts

Reads new sales emails from Gmail, sorts each into pricing, demo, objection, unsubscribe, out-of-office or other with OpenAI or keyword rules, writes a reply draft in the same thread from a template per intent, and adds unsubscribe requests to a Google Sheets suppression list.

Import `sales-email-intent-drafts-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Founders and small sales teams who answer the same five kinds of reply to their outreach every day. Each reply already has a draft waiting in the thread, and nothing is sent without a person pressing Send.

## How it works

1. The Gmail trigger picks up new inbox emails. A manual run uses 7 sample replies.
2. Senders from your own domains are skipped. The rest are classified by OpenAI when `USE_OPENAI` is true, or by keyword rules checked in a fixed order: unsubscribe, out of office, objection, demo, pricing.
3. Pricing, demo and objection replies get a draft from `REPLY_TEMPLATES`, filled with the sender's first name and your links, and threaded under the original email.
4. Unsubscribe requests get no draft. They are appended to the Suppression tab so outreach tools can exclude them. Out-of-office and unclear emails are left alone.
5. A model answer with an unknown intent or confidence under `MIN_CONFIDENCE` is treated as unclear, so a weak guess never becomes a draft.

## Sections on the canvas

1. **Start and settings.** The Gmail trigger polls the inbox every minute; `Run manually` replays sample replies. Keywords, templates, links and the confidence floor all live in `config`.
2. **Read the emails.** `Read the incoming emails` keeps the thread id and Message-ID, which the draft needs to land in the right conversation. A manual run uses `Load sample sales emails`.
3. **Classify intent.** OpenAI is optional. `Classify intent by rules` checks unsubscribe and out of office before anything else, so an auto-reply or opt-out is never answered with a sales pitch.
4. **Choose the action and suppress.** Each email gets one action: draft, suppress or none. Unsubscribes go to the Suppression tab instead of getting a reply, and only on a live run with a sheet id.
5. **Create drafts.** Drafts are created, never sent: a person reads each one in Gmail first. `Create drafts?` opens only when `DRY_RUN` is false, so the first runs only show the planned replies.

## Setup

1. Run it once as imported. It classifies the sample emails and stops at `STOP: dry run - no drafts created`.
2. Connect Gmail to `New sales email in Gmail` and `Create the Gmail draft`, and set `OWN_DOMAINS`.
3. Edit `REPLY_TEMPLATES`, `CALENDAR_URL` and `PRICING_URL`. Optionally add an OpenAI credential and set `USE_OPENAI = true`, and set `SUPPRESSION_SHEET_ID`.
4. Check the planned drafts in `Pick a reply template`, then set `DRY_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_OPENAI` | `false` | set true after adding an OpenAI credential to the agent model |
| `MIN_CONFIDENCE` | `0.6` | model answers below this are treated as unclear |
| `OWN_DOMAINS` | `["northwind.example"]` | emails from these domains are never classified |
| `INTENT_KEYWORDS` | `{"unsubscribe":["unsubscribe","remove me` | phrases per intent; the first intent in this order with a hit wins |
| `REPLY_TEMPLATES` | `{"pricing":"Hi {first_name},\n\nThanks f` | reply body per intent; intents without a template get no draft |
| `SENDER_NAME` | `'Ana Ruiz'` | sign-off |
| `CALENDAR_URL` | `'https://cal.northwind.example/ana/30min'` | booking link used in templates |
| `PRICING_URL` | `'https://northwind.example/pricing'` | pricing page used in templates |
| `SUPPRESSION_SHEET_ID` | `''` | Google Sheets id with a Suppression tab; blank keeps unsubscribes in the run output only |
| `MAX_DRAFTS` | `25` | hard ceiling on drafts per run |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `New sales email in Gmail`
- `Classify intent with OpenAI`
- `Classify intent with OpenAI model`
- `Add to the suppression sheet`
- `Create the Gmail draft`

## Requirements

- A Gmail account
- Optional: an OpenAI API key
- Optional: a Google Sheet with a Suppression tab

## Customising

- `INTENT_KEYWORDS` lists the phrases behind each rule.
- `REPLY_TEMPLATES` holds one reply per intent; {first_name}, {calendar_url} and {pricing_url} are filled in.
- `MAX_DRAFTS` caps drafts per run.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run, sample replies) | 16 | none | `STOP: no reply needed`, `STOP: dry run - no drafts created`, `STOP: dry run - suppression list untouched` |
| live Gmail trigger with OpenAI | 16 | `Create the Gmail draft`, `Add to the suppression sheet` | `STOP: no reply needed`, `Create the Gmail draft`, `Add to the suppression sheet` |
