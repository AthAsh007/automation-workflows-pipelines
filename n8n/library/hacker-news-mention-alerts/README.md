# Alert Slack on Hacker News mentions of your brand

Searches Hacker News stories and comments through the public Algolia API every 30 minutes, keeps exact whole-word mentions of your keywords since the last check, drops exclusions, your own accounts and low-point stories, and posts each new mention to Slack with a snippet and links.

Import `hacker-news-mention-alerts-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Founders, developer relations and support leads at products that get discussed on Hacker News. You hear about a thread while it is still on the front page instead of the next day.

## How it works

1. Every 30 minutes it searches Hacker News stories and comments for each keyword in `KEYWORDS`, from the last check onward, through the free Algolia search API.
2. Algolia matches prefixes, so each hit is checked again for the keyword as a whole word. Hits containing an exclusion term, posted by your own accounts, or stories under 3 points are dropped.
3. A hit found by two keywords is posted once, and ids already alerted are skipped.
4. One Slack message lists stories with points and comment counts, and comments with a 160-character snippet around the match.

## Sections on the canvas

1. **Start and settings.** Runs every 30 minutes or by hand. Keywords, exclusions, your own accounts and the points floor are constants in `config`.
2. **Search Hacker News.** One Algolia query per keyword, filtered on created_at_i so only hits since the last checkpoint come back. `Load sample search results` returns the same shape, including the query field used to match hits to keywords.
3. **Keep real mentions.** Algolia prefix matching would alert on "Fieldnotes", so `Pick mentions to alert` re-checks each hit for the whole word before exclusions, own accounts and the story points floor.
4. **Post and move the checkpoint.** The checkpoint only moves after a live post. A preview or test run leaves it alone, so switching to live never skips the mentions you were testing with.

## Setup

1. Run it once as imported. It filters sample search results and stops at `STOP: preview - nothing posted`.
2. Set `KEYWORDS` to your brand and product names, `OWN_HN_USERS` to your team accounts, then set `USE_LIVE_SEARCH = true`.
3. Connect Slack and set `SLACK_CHANNEL_ID`.
4. Set `TEST_EMAIL` to any address to post with a [TEST] prefix, then set `TEST_RUN = false` so the checkpoint moves forward.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_LIVE_SEARCH` | `false` | set true to query hn.algolia.com (public, no key) |
| `KEYWORDS` | `["Fieldnote","fieldnote.example"]` | brand, product and domain names to watch |
| `EXCLUDE_TERMS` | `["notebook","moleskine"]` | a hit containing any of these is dropped (case-insensitive) |
| `OWN_HN_USERS` | `["fieldnote_team"]` | your own HN usernames; their posts are not alerts |
| `MIN_STORY_POINTS` | `3` | stories below this score are skipped; comments are always kept |
| `MAX_LOOKBACK_HOURS` | `24` | first run and long pauses look back at most this far |
| `SLACK_CHANNEL_ID` | `''` | channel for alerts; blank skips Slack |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Post the mentions to Slack`

## Requirements

- A Slack workspace
- Nothing for Hacker News: the Algolia API is public

## Customising

- `EXCLUDE_TERMS` drops hits about something else with the same name.
- `MIN_STORY_POINTS` hides brand-new stories nobody has voted on; comments are always kept.
- `MAX_LOOKBACK_HOURS` limits how far back a run looks after a long pause.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 10 | none | `STOP: preview - nothing posted` |
| live search posts to Slack | 14 | `Post the mentions to Slack` | `Move the checkpoint forward` |
