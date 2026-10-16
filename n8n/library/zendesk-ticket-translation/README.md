# Translate non-English Zendesk tickets with OpenAI and tag the language

Detects the language of new Zendesk tickets from writing system, stopwords and accents without any API, tags each ticket lang_xx, and for tickets not in your team's language adds an internal note with an OpenAI translation (or the detected language when OpenAI is off).

Import `zendesk-ticket-translation-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Support teams on Zendesk that answer in one language but receive tickets in several, and lose time pasting each one into a translator before they can even triage it.

## How it works

1. Every 10 minutes it searches Zendesk for unsolved tickets from the last 2 hours not yet tagged `lang_checked`, or uses 6 sample tickets until Zendesk is connected.
2. Language is detected in code: the writing system decides Japanese, Chinese, Korean, Cyrillic, Arabic and others; for Latin text it counts common words in 7 languages and uses accents such as ñ, ã and ß to settle close calls.
3. Every ticket is tagged `lang_xx` and `lang_checked`; a ticket with too few clues is tagged `lang_unknown` rather than guessed.
4. With `USE_OPENAI` on, tickets not in `BASE_LANGUAGE` get an internal note with the subject and body translated. With it off, the note names the detected language.

## Sections on the canvas

1. **Start and settings.** Runs every 10 minutes so a translated note is waiting before an agent opens the ticket. The base language and detection threshold live in `config`.
2. **Read new tickets.** The search skips tickets already tagged `lang_checked`, so each ticket is handled once even though the 2 hour window overlaps runs. `Load sample tickets` covers five languages until `USE_ZENDESK` is true.
3. **Detect, then translate.** Detection is free and runs on every ticket; the model is only called for tickets outside `BASE_LANGUAGE`, and not at all when there are none. A short reply like "ok gracias" is tagged unknown instead of guessed.
4. **Tag and note in Zendesk.** Tags are added, never replaced, and the note is internal so the customer never sees a machine translation. Nothing is written while `DRY_RUN` is true.

## Setup

1. Run it once as imported. It detects the sample tickets and stops at `STOP: dry run - tickets untouched`.
2. Add a Zendesk credential to `Search new Zendesk tickets` and `Tag and note the ticket`, fill in `ZENDESK_SUBDOMAIN` and set `USE_ZENDESK = true`.
3. Optionally add an OpenAI credential to the model under `Translate with OpenAI` and set `USE_OPENAI = true`.
4. Set `DRY_RUN = false` to start tagging and adding notes.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_ZENDESK` | `false` | set true after adding the Zendesk credential to both Zendesk nodes |
| `ZENDESK_SUBDOMAIN` | `'yourcompany'` | the part before .zendesk.com |
| `LOOKBACK_HOURS` | `2` | tickets created in this window are checked |
| `USE_OPENAI` | `false` | set true after adding an OpenAI credential to the model under Translate with OpenAI |
| `BASE_LANGUAGE` | `'en'` | language your team answers in; tickets in it are only tagged |
| `MIN_WORD_HITS` | `3` | for Latin-script text, the winning language needs at least this many common-word hits |
| `MAX_CHARS` | `2000` | longest ticket body sent for translation |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Search new Zendesk tickets`
- `Translate with OpenAI`
- `Translate with OpenAI model`
- `Tag and note the ticket`

## Requirements

- A Zendesk Support account with API access
- Optional: an OpenAI API key

## Customising

- `BASE_LANGUAGE` is the language your team answers in.
- `MIN_WORD_HITS` sets how many clues detection needs before it commits.
- Use the `lang_xx` tags in Zendesk triggers to route tickets to agents who speak that language.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 12 | none | `STOP: dry run - tickets untouched` |
| live with Zendesk and OpenAI | 15 | `Tag and note the ticket` | `Tag and note the ticket` |
