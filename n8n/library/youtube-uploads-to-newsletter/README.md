# Turn new YouTube uploads into newsletter blurbs in Google Sheets with OpenAI

Reads the public YouTube feed of one or more channels, skips Shorts and old uploads, writes a newsletter blurb (OpenAI or from the description) only for videos not used before, ranks each week's videos by views per hour into lead, feature and also slots, re-ranks them daily, and upserts them into a Google Sheets tab. A dead channel feed is reported, and the run fails if every feed fails.

Import `youtube-uploads-to-newsletter-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Creators and small media teams who send a weekly newsletter and copy their latest YouTube videos into it by hand. The blurbs are ready in a sheet by the time you sit down to write.

## How it works

1. Every morning it reads the YouTube feed for each channel in `CHANNEL_IDS` (no API key needed), or a sample feed until it is switched on.
2. A channel whose feed fails is listed in `failed_channels`; if every feed fails the run stops with an error instead of finishing quietly with nothing.
3. Shorts and videos older than 7 days are skipped. Videos not used before get a blurb of up to 280 characters from OpenAI, or from the first two sentences of the description with timestamps, links and sponsor lines removed.
4. Every eligible video, new or already in the sheet, is ranked inside its newsletter week (Monday date) by views per hour since publishing, so a 2-day-old video is not beaten by age alone. Rank 1 is the lead, up to `ISSUE_SIZE` are features, the rest are "also".
5. Rows are upserted on video_id: new videos get the full row, known ones only get fresh views, rank and slot, so the order is current on the day you write the issue.

## Sections on the canvas

1. **Start and settings.** Runs every morning at 06:30 or by hand. Channels, age limit, blurb length and the sponsor-line words are constants in `config`.
2. **Read the channel feeds.** YouTube serves a public Atom feed per channel, so no API key or quota is involved. A failed feed continues as an error item so one dead channel cannot hide the others. `Load sample feed` returns the same XML.
3. **Pick videos for the newsletter.** `Pick new videos` parses the XML itself because generic feed readers drop the description, and throws when every feed failed. Used videos stay in the batch with needs_blurb false, so a quiet day still refreshes the ranking.
4. **Write the blurbs.** The template path is the default and removes timestamps, links and sponsor reads line by line; videos already in the sheet pass through it untouched. OpenAI is optional, and both paths are cut to `BLURB_MAX_CHARS` in code afterwards.
5. **Rank and update the sheet.** `Rank by views per hour` orders each week by views per hour, so the lead is the video that is pulling, not the oldest. Rows are upserted on video_id, and videos are remembered only after the write succeeds.

## Setup

1. Run it once as imported. It writes blurbs for the sample feed and stops at `STOP: dry run - sheet untouched`.
2. Put your channel id (starts with UC, found on the channel page) in `CHANNEL_IDS` and set `USE_LIVE_FEED = true`.
3. Connect Google Sheets and set `NEWSLETTER_SHEET_ID` to a sheet whose Newsletter tab has a video_id column. Optionally add an OpenAI credential and set `USE_OPENAI = true`.
4. Read the blurbs and slots in `Rank by views per hour`, then set `DRY_RUN = false`.

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
| `ISSUE_SIZE` | `4` | videos per week marked lead (rank 1) or feature; the rest are marked also |
| `MIN_RANK_HOURS` | `12` | views per hour are divided by at least this many hours |
| `DROP_LINE_WORDS` | `["sponsor","use code","affiliate","subsc` | description lines containing these are left out of template blurbs |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Write blurbs with OpenAI`
- `Write blurbs with OpenAI model`
- `Upsert rows in the newsletter sheet`

## Requirements

- A YouTube channel
- A Google Sheet with a Newsletter tab
- Optional: an OpenAI API key

## Customising

- `ISSUE_SIZE` sets how many videos per week are lead or feature; `MIN_RANK_HOURS` stops a video posted an hour ago from topping the list on a lucky start.
- `BLURB_MAX_CHARS` sets the blurb length; `MAX_AGE_DAYS` how far back a video can be.
- `DROP_LINE_WORDS` lists words that remove a description line from the template blurb.
- `SKIP_SHORTS` set to false keeps Shorts in.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run, template blurbs) | 15 | none | `STOP: dry run - sheet untouched` |
| live feeds (one dead), OpenAI and sheet upsert | 18 | `Upsert rows in the newsletter sheet` | `Remember used videos` |
