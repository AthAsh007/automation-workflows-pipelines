# Turn new YouTube uploads into newsletter blurbs in Google Sheets with OpenAI

**Who's it for**
Creators and small media teams who send a weekly newsletter and copy their latest YouTube videos into it by hand. The blurbs are ready in a sheet by the time you sit down to write.

**How it works**
1. Every morning it reads the YouTube feed for each channel in `CHANNEL_IDS` (no API key needed), or a sample feed until it is switched on.
2. Shorts, videos older than 7 days and videos already used are skipped.
3. Each video gets a blurb of up to 280 characters from OpenAI, or from the first two sentences of its description with timestamps, links and sponsor lines removed.
4. One row per video is appended to the Newsletter tab with the week it belongs to (Monday date), so a week's blurbs are one filter away.

**How to set up**
1. Run it once as imported. It writes blurbs for the sample feed and stops at `STOP: dry run - sheet untouched`.
2. Put your channel id (starts with UC, found on the channel page) in `CHANNEL_IDS` and set `USE_LIVE_FEED = true`.
3. Connect Google Sheets and set `NEWSLETTER_SHEET_ID`. Optionally add an OpenAI credential and set `USE_OPENAI = true`.
4. Read the blurbs in `Collect the week's blurbs`, then set `DRY_RUN = false`.

**Requirements**
- A YouTube channel
- A Google Sheet with a Newsletter tab
- Optional: an OpenAI API key

**How to customize**
- `BLURB_MAX_CHARS` sets the blurb length; `MAX_AGE_DAYS` how far back a video can be.
- `DROP_LINE_WORDS` lists words that remove a description line from the template blurb.
- `SKIP_SHORTS` set to false keeps Shorts in.
