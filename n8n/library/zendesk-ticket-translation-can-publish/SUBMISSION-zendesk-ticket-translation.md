# Translate non-English Zendesk tickets with OpenAI and tag the language

**Who's it for**
Support teams on Zendesk that answer in one language but receive tickets in several, and lose time pasting each one into a translator before they can even triage it.

**How it works**
1. Every 10 minutes it searches Zendesk for unsolved tickets from the last 2 hours not yet tagged `lang_checked`, or uses 6 sample tickets until Zendesk is connected.
2. Language is detected in code: the writing system decides Japanese, Chinese, Korean, Cyrillic, Arabic and others; for Latin text it counts common words in 7 languages and uses accents such as ñ, ã and ß to settle close calls.
3. Every ticket is tagged `lang_xx` and `lang_checked`; a ticket with too few clues is tagged `lang_unknown` rather than guessed.
4. With `USE_OPENAI` on, tickets not in `BASE_LANGUAGE` get an internal note with the subject and body translated. With it off, the note names the detected language.

**How to set up**
1. Run it once as imported. It detects the sample tickets and stops at `STOP: dry run - tickets untouched`.
2. Add a Zendesk credential to `Search new Zendesk tickets` and `Tag and note the ticket`, fill in `ZENDESK_SUBDOMAIN` and set `USE_ZENDESK = true`.
3. Optionally add an OpenAI credential to the model under `Translate with OpenAI` and set `USE_OPENAI = true`.
4. Set `DRY_RUN = false` to start tagging and adding notes.

**Requirements**
- A Zendesk Support account with API access
- Optional: an OpenAI API key

**How to customize**
- `BASE_LANGUAGE` is the language your team answers in.
- `MIN_WORD_HITS` sets how many clues detection needs before it commits.
- Use the `lang_xx` tags in Zendesk triggers to route tickets to agents who speak that language.
