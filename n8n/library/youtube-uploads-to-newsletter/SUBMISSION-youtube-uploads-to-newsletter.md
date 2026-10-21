# Turn new YouTube uploads into newsletter blurbs in Google Sheets with OpenAI

**Who's it for**
Creators and small media teams who send a weekly newsletter and copy their latest YouTube videos into it by hand. The blurbs are ready in a sheet by the time you sit down to write.

**How it works**
1. Every morning it reads the YouTube feed for each channel in `CHANNEL_IDS` (no API key needed), or a sample feed until it is switched on.
2. A channel whose feed fails is listed in `failed_channels`; if every feed fails the run stops with an error instead of finishing quietly with nothing.
3. Shorts and videos older than 7 days are skipped. Videos not used before get a blurb of up to 280 characters from OpenAI, or from the first two sentences of the description with timestamps, links and sponsor lines removed.
4. Every eligible video, new or already in the sheet, is ranked inside its newsletter week (Monday date) by views per hour since publishing, so a 2-day-old video is not beaten by age alone. Rank 1 is the lead, up to `ISSUE_SIZE` are features, the rest are "also".
5. Rows are upserted on video_id: new videos get the full row, known ones only get fresh views, rank and slot, so the order is current on the day you write the issue.

**How to set up**
1. Run it once as imported. It writes blurbs for the sample feed and stops at `STOP: dry run - sheet untouched`.
2. Put your channel id (starts with UC, found on the channel page) in `CHANNEL_IDS` and set `USE_LIVE_FEED = true`.
3. Connect Google Sheets and set `NEWSLETTER_SHEET_ID` to a sheet whose Newsletter tab has a video_id column. Optionally add an OpenAI credential and set `USE_OPENAI = true`.
4. Read the blurbs and slots in `Rank by views per hour`, then set `DRY_RUN = false`.

**Requirements**
- A YouTube channel
- A Google Sheet with a Newsletter tab
- Optional: an OpenAI API key

**How to customize**
- `ISSUE_SIZE` sets how many videos per week are lead or feature; `MIN_RANK_HOURS` stops a video posted an hour ago from topping the list on a lucky start.
- `BLURB_MAX_CHARS` sets the blurb length; `MAX_AGE_DAYS` how far back a video can be.
- `DROP_LINE_WORDS` lists words that remove a description line from the template blurb.
- `SKIP_SHORTS` set to false keeps Shorts in.
