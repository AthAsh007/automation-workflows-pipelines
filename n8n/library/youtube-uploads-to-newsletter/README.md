# Turn new YouTube uploads into newsletter blurbs in Google Sheets with OpenAI

Reads the public YouTube feed of one or more channels, skips Shorts, old and already-used videos, writes a short newsletter blurb per video with OpenAI or from the description, and appends them to a Google Sheets tab grouped by newsletter week.

Import `youtube-uploads-to-newsletter-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Creators and small media teams who send a weekly newsletter and copy their latest YouTube videos into it by hand. The blurbs are ready in a sheet by the time you sit down to write.

## How it works

1. Every morning it reads the YouTube feed for each channel in `CHANNEL_IDS` (no API key needed), or a sample feed until it is switched on.
2. Shorts, videos older than 7 days and videos already used are skipped.
3. Each video gets a blurb of up to 280 characters from OpenAI, or from the first two sentences of its description with timestamps, links and sponsor lines removed.
4. One row per video is appended to the Newsletter tab with the week it belongs to (Monday date), so a week's blurbs are one filter away.

## Sections on the canvas

1. **Start and settings.** Runs every morning at 06:30 or by hand. Channels, age limit, blurb length and the sponsor-line words are constants in `config`.
2. **Read the channel feeds.** YouTube serves a public Atom feed per channel, so no API key or quota is involved. `Load sample feed` returns the same XML, including the media:description field the blurbs are built from.
3. **Pick videos for the newsletter.** `Pick new videos` parses the XML itself because generic feed readers drop the description. Shorts, old uploads and used ids are removed before any model call, and an empty week ends at `STOP: no new videos`.
4. **Write the blurbs.** The template path is the default and removes timestamps, links and sponsor reads line by line. OpenAI is optional, and both paths are cut to `BLURB_MAX_CHARS` in code afterwards.
5. **Add to the newsletter sheet.** Rows are appended only with `DRY_RUN` off and a sheet id set. Videos are remembered after the append, so a failed write is picked up again the next morning.

## Setup

1. Run it once as imported. It writes blurbs for the sample feed and stops at `STOP: dry run - sheet untouched`.
2. Put your channel id (starts with UC, found on the channel page) in `CHANNEL_IDS` and set `USE_LIVE_FEED = true`.
3. Connect Google Sheets and set `NEWSLETTER_SHEET_ID`. Optionally add an OpenAI credential and set `USE_OPENAI = true`.
4. Read the blurbs in `Collect the week's blurbs`, then set `DRY_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_LIVE_FEED` | `false` | set true to read the public YouTube feeds for CHANNEL_IDS |
| `CHANNEL_IDS` | `["UCxxxxxxxxxxxxxxxxxxxxxx"]` | YouTube channel ids (start with UC) |
| `USE_OPENAI` | `false` | set true after adding an OpenAI credential to the model node |
| `NEWSLETTER_SHEET_ID` | `''` | Google Sheets id with a Newsletter tab; blank means nothing is written |
| `MAX_AGE_DAYS` | `7` | only videos published in this many days are used |
| `SKIP_SHORTS` | `true` | drop videos tagged #shorts |
| `BLURB_MAX_CHARS` | `280` | longest blurb, cut at a word boundary |
| `DROP_LINE_WORDS` | `["sponsor","use code","affiliate","subsc` | description lines containing these are left out of template blurbs |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Write blurbs with OpenAI`
- `Write blurbs with OpenAI model`
- `Append blurbs to the newsletter sheet`

## Requirements

- A YouTube channel
- A Google Sheet with a Newsletter tab
- Optional: an OpenAI API key

## Customising

- `BLURB_MAX_CHARS` sets the blurb length; `MAX_AGE_DAYS` how far back a video can be.
- `DROP_LINE_WORDS` lists words that remove a description line from the template blurb.
- `SKIP_SHORTS` set to false keeps Shorts in.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run, template blurbs) | 14 | none | `STOP: dry run - sheet untouched` |
| live feed, OpenAI and sheet append | 17 | `Append blurbs to the newsletter sheet` | `Remember used videos` |
