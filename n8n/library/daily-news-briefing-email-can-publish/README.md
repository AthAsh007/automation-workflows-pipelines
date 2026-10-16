# Email a daily briefing from Hacker News and RSS on chosen topics

Each morning pulls the Hacker News front page and your RSS feeds, scores every story against keyword topics, removes duplicates by URL and similar titles, keeps the top 5 per topic and emails one HTML briefing through Gmail.

Import `daily-news-briefing-email-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Founders, engineers and analysts who skim Hacker News and a handful of blogs every morning to keep up with a few topics. One email replaces a dozen open tabs.

## How it works

1. Every weekday at 06:45 it reads the top 60 Hacker News stories and every feed in `FEEDS`, or a sample set until live reading is on.
2. Stories older than 30 hours or matching an excluded word are dropped. The same link from two sources (tracking parameters ignored) or two titles sharing 60% of their words count once.
3. Each story is scored per topic: 3 points for a keyword in the title, 1 in the summary, plus a bonus for HN points. It goes under its best topic only.
4. The top 5 per topic are emailed as one HTML briefing with source, points and comment links.

## Sections on the canvas

1. **Start and settings.** Runs every weekday at 06:45 so the email is waiting at breakfast. Topics, feeds, exclusions and the per-topic cap all sit in `config`.
2. **Read Hacker News and the feeds.** Both sources are public, but they still wait for `USE_LIVE_SOURCES`. A missing HN item or a dead feed continues as an empty result, so one bad source never cancels your briefing. `Load sample stories` uses the merged shape directly.
3. **Score, dedupe and pick.** Stories are sorted by points before dedupe, so when HN and a feed carry the same link the HN copy with its discussion link wins. Each story lands under one topic only, its best match.
4. **Send your briefing.** Nothing is sent in preview. A test run sends one copy to `TEST_EMAIL`; a live run sends to `BRIEFING_TO`.

## Setup

1. Run it once as imported. It builds a briefing from sample stories and stops at `STOP: preview - nothing sent`.
2. Edit `TOPICS` and `FEEDS`, then set `USE_LIVE_SOURCES = true`. Neither Hacker News nor RSS needs a key.
3. Connect Gmail to `Email your briefing` and set `BRIEFING_TO`.
4. Put your address in `TEST_EMAIL` for a test copy, then set `TEST_RUN = false` for the daily send.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_LIVE_SOURCES` | `false` | set true to read Hacker News and FEEDS (both public) |
| `HN_TOP_N` | `60` | front page stories read from Hacker News |
| `FEEDS` | `["https://blog.example.com/feed.xml","ht` | RSS or Atom feeds to include (at least one) |
| `TOPICS` | `[{"name":"AI and LLMs","keywords":["llm"` | sections of your briefing and the keywords that place a story in each |
| `EXCLUDE_KEYWORDS` | `["crypto","nft","sponsored"]` | stories mentioning these are dropped |
| `TOP_PER_TOPIC` | `5` | stories per topic |
| `MIN_SCORE` | `3` | a story needs at least this topic score to be included |
| `MAX_AGE_HOURS` | `30` | stories older than this are dropped |
| `BRIEFING_TO` | `'you@yourcompany.example'` | who gets your briefing |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Email your briefing`

## Requirements

- A Gmail account
- At least one RSS feed you follow

## Customising

- `TOPICS` holds the keywords for each section of the email.
- `TOP_PER_TOPIC` and `MIN_SCORE` decide how much makes the cut.
- `EXCLUDE_KEYWORDS` drops stories you never want, whatever their score.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 10 | none | `STOP: preview - nothing sent` |
| live sources and Gmail | 16 | `Email your briefing` | `Email your briefing` |
