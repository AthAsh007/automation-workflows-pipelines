# Draft podcast show notes from transcripts with OpenAI in Notion

**Who's it for**
Podcasters and small production teams who already get a timestamped transcript from their recording tool and spend an hour per episode writing chapters and show notes by hand.

**How it works**
1. Your transcription tool (or a form) posts the transcript and episode details to a webhook. Plain "[00:12:30] Name: text" lines and WebVTT files both work.
2. Chapters start at phrases such as "let's talk about" or "moving on to", at least 3 minutes apart, with a forced break after 12 minutes without one. The first chapter is always 00:00, as YouTube and Spotify expect.
3. URLs and spoken domains like "fieldnote dot io" are collected into a links list.
4. A 3-sentence summary comes from OpenAI or from the highest scoring sentences, and a Notion page is created with status Draft, the summary, chapters and links.

**How to set up**
1. Run it once as imported from `Run manually`. It drafts notes for a sample transcript and stops at `STOP: dry run - Notion untouched`.
2. Create a Notion database with Name (title), Episode (number), Guest (text) and Status (select), share it with your integration and set `NOTION_DATABASE_ID`.
3. Add the Notion credential to `Create the Notion page`, optionally add OpenAI and set `USE_OPENAI = true`, and point your tool at the production webhook URL.
4. Check one draft in the execution, then set `DRY_RUN = false`.

**Requirements**
- A timestamped transcript per episode
- A Notion database for show notes
- Optional: an OpenAI API key

**How to customize**
- `CHAPTER_PHRASES` lists the phrases that open a new chapter.
- `MIN_CHAPTER_MINUTES` and `MAX_CHAPTER_MINUTES` control chapter length.
- `ALWAYS_LINKS` adds your own links (subscribe, newsletter) to every episode.
