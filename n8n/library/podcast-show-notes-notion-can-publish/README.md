# Draft podcast show notes from transcripts with OpenAI in Notion

Receives an episode transcript by webhook, finds chapter breaks from topic-change phrases and time gaps, pulls out every link (including spoken "example dot com"), writes a summary with OpenAI or by sentence scoring, and creates a draft show notes page in a Notion database.

Import `podcast-show-notes-notion-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Podcasters and small production teams who already get a timestamped transcript from their recording tool and spend an hour per episode writing chapters and show notes by hand.

## How it works

1. Your transcription tool (or a form) posts the transcript and episode details to a webhook. Plain "[00:12:30] Name: text" lines and WebVTT files both work.
2. Chapters start at phrases such as "let's talk about" or "moving on to", at least 3 minutes apart, with a forced break after 12 minutes without one. The first chapter is always 00:00, as YouTube and Spotify expect.
3. URLs and spoken domains like "fieldnote dot io" are collected into a links list.
4. A 3-sentence summary comes from OpenAI or from the highest scoring sentences, and a Notion page is created with status Draft, the summary, chapters and links.

## Sections on the canvas

1. **Receive the transcript.** Your transcription tool posts to `Transcript webhook`, which waits for a respond node so the caller gets the draft back. A manual run feeds `Load sample episode` through the same path.
2. **Find chapters and links.** Chapters come from what the host says, not fixed intervals, because "let's talk about" is where listeners expect a jump point. Spoken domains are rebuilt into URLs, since transcripts rarely contain the link itself.
3. **Write the summary.** Sentence scoring is the default and needs no key: guest sentences with frequent topic words and numbers win. OpenAI is optional and both paths produce the same fields.
4. **Create the Notion draft.** The caller gets chapters and links back before Notion is touched. The page is created with status Draft only when `DRY_RUN` is false, and long text is split under the 2,000 character Notion limit.

## Setup

1. Run it once as imported from `Run manually`. It drafts notes for a sample transcript and stops at `STOP: dry run - Notion untouched`.
2. Create a Notion database with Name (title), Episode (number), Guest (text) and Status (select), share it with your integration and set `NOTION_DATABASE_ID`.
3. Add the Notion credential to `Create the Notion page`, optionally add OpenAI and set `USE_OPENAI = true`, and point your tool at the production webhook URL.
4. Check one draft in the execution, then set `DRY_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `NOTION_DATABASE_ID` | `''` | Notion database for show notes; blank means nothing is written |
| `USE_OPENAI` | `false` | set true after adding an OpenAI credential to the model node |
| `CHAPTER_PHRASES` | `["lets talk about","lets get into","movi` | phrases that start a new chapter (lowercase, apostrophes left out: lets, not let + apostrophe + s) |
| `MIN_CHAPTER_MINUTES` | `3` | shortest chapter |
| `MAX_CHAPTER_MINUTES` | `12` | a chapter longer than this is split at the next speaker change |
| `SUMMARY_SENTENCES` | `3` | sentences in the summary |
| `ALWAYS_LINKS` | `[{"label":"Newsletter","url":"https://ww` | links added to every episode |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Summarise with OpenAI`
- `Summarise with OpenAI model`
- `Create the Notion page`

## Requirements

- A timestamped transcript per episode
- A Notion database for show notes
- Optional: an OpenAI API key

## Customising

- `CHAPTER_PHRASES` lists the phrases that open a new chapter.
- `MIN_CHAPTER_MINUTES` and `MAX_CHAPTER_MINUTES` control chapter length.
- `ALWAYS_LINKS` adds your own links (subscribe, newsletter) to every episode.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (manual sample episode) | 14 | none | `STOP: dry run - Notion untouched` |
| live webhook with VTT and OpenAI | 14 | `Create the Notion page` | `Create the Notion page` |
