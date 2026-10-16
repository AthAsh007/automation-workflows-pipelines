# Summarise new App Store reviews from Apple's RSS feed into Slack

Reads the public App Store customer review feed for several countries each morning, keeps only reviews not posted before, and sends Slack a digest with star breakdown, average per country, 1 and 2 star reviews tagged by complaint topic, and the app version low ratings cluster on.

Import `app-store-review-digest-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Mobile product and support teams who ship an iOS app in more than one country and check reviews in App Store Connect when they remember to. No Apple credentials are needed.

## How it works

1. Every morning at 09:00 it reads Apple's public review feed (newest 50 per country) for each country in `COUNTRIES`, or 12 sample reviews until `APP_ID` is set.
2. Reviews already posted on an earlier run are dropped; on the very first run only the last 7 days count.
3. It counts reviews per star and the average per country, and tags 1 and 2 star reviews with topics such as crash, login or pricing.
4. If most low ratings come from one app version, the digest says so, which usually points at a regression.

## Sections on the canvas

1. **Start and settings.** Runs every morning at 09:00. The app id, storefronts and complaint word lists live in `config`; a blank `APP_ID` is what keeps the first run on sample data.
2. **Read the review feeds.** Apple's feed is public JSON, one URL per storefront, so there is no credential to set up. `Read feed entries` handles the single-review case, where Apple returns an object instead of a list.
3. **Find new reviews and count.** The feed always returns the newest 50, so `Keep reviews not posted before` drops ids already sent. The version check needs at least 3 low ratings, so one angry review does not cry regression.
4. **Post and remember.** A quiet day, a blank channel and a dry run each end on their own STOP. Ids are remembered only after `Post the digest to Slack` succeeds, so a failed post is repeated tomorrow, not lost.

## Setup

1. Run it once as imported. It builds a digest from the sample reviews and stops at `STOP: no Slack channel`.
2. Put your numeric App Store id (from the app URL, after `id`) in `APP_ID` and pick `COUNTRIES`.
3. Add a Slack credential to `Post the digest to Slack` and set `SLACK_CHANNEL_ID`.
4. Set `DRY_RUN = false` and activate the workflow. Posted review ids are kept in static data, which n8n saves on activated runs.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `APP_ID` | `''` | numeric App Store id, e.g. 284882215; blank uses sample reviews |
| `COUNTRIES` | `["us","gb","de","au"]` | two-letter storefront codes to read |
| `FIRST_RUN_DAYS` | `7` | on the first run, only reviews from this many days are included |
| `LOW_STARS` | `2` | reviews at or below this rating are flagged |
| `COMPLAINT_TOPICS` | `{"crash":["crash","closes","freez","stuc` | topic -> word fragments (lower case) that tag a low review |
| `VERSION_ALERT_SHARE` | `60` | percent of low ratings on one version that adds a regression line |
| `EXCERPT_CHARS` | `160` | review text length shown in Slack |
| `SLACK_CHANNEL_ID` | `''` | channel for the digest; blank posts nothing |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Post the digest to Slack`

## Requirements

- An app on the App Store
- A Slack workspace

## Customising

- `COMPLAINT_TOPICS` maps each topic to the words that mark it; add words in your users' languages.
- `LOW_STARS` sets which ratings are flagged.
- `VERSION_ALERT_SHARE` sets the share of low ratings on one version that triggers the regression line.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 11 | none | `STOP: no Slack channel` |
| live feed for two countries to Slack | 15 | `Post the digest to Slack` | `Remember posted reviews` |
