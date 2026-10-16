# Score creator applications from a form into an Airtable shortlist

Scores creator applications from an n8n form on engagement rate against platform benchmarks, niche fit, audience size, region and rate versus budget with weights from config, sorts them into tiers, adds them to Airtable and replies by tier, holding suspicious profiles for a person.

Import `influencer-shortlist-scoring-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Brand and growth marketers running creator programmes who get more applications than they can vet. Every applicant gets an answer, and the shortlist in Airtable is sorted before anyone opens it.

## How it works

1. Creators apply through the hosted n8n form with platform, followers, average engagements per post, niche, country and rate per post.
2. Five parts are scored from 0 to 1 and weighted by `WEIGHTS`: engagement rate against the platform benchmark, niche fit, audience size against your target range, region, and rate against `MAX_RATE_PER_POST`.
3. A total of 75+ is tier A (shortlist), 55-74 tier B (maybe), under 55 tier C. An engagement rate over 5 times the benchmark, or a rate above budget on an otherwise strong profile, goes to manual review with no automatic reply.
4. Every application becomes an Airtable record with its scores and reasons, and tiers A, B and C get their own reply email.

## Sections on the canvas

1. **Receive the application.** The hosted `Creator application form` asks for numbers rather than screenshots, so scoring needs no scraping. A manual run feeds `Load sample applications` through the same path.
2. **Score against your weights.** Engagement is judged against the platform benchmark, because 3% is weak on TikTok and strong on Instagram. An implausibly high rate is held for review instead of being rewarded.
3. **Add to Airtable and reply.** Every application is stored, review cases included, but only on a live run with a base id. Review cases never get an automatic reply, and the rest follow the preview and test gates.

## Setup

1. Run it once as imported from `Run manually`. It scores 4 sample applications and stops at `STOP: test run - Airtable untouched` and `STOP: preview - nothing sent`.
2. Create an Airtable table with the fields listed in `Shape the Airtable record`, add the token credential and set `AIRTABLE_BASE_ID`.
3. Set `TARGET_NICHES`, `TARGET_COUNTRIES` and `MAX_RATE_PER_POST`, connect Gmail and share the production form URL.
4. Put your address in `TEST_EMAIL` to receive the replies yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `AIRTABLE_BASE_ID` | `''` | Airtable base id (starts with app); blank means nothing is stored |
| `AIRTABLE_TABLE` | `'Creator applications'` | table name or id |
| `WEIGHTS` | `{"engagement":35,"niche":25,"audience":1` | points per part, adding up to 100 |
| `ER_BENCHMARKS` | `{"Instagram":0.02,"TikTok":0.05,"YouTube` | typical engagement rate per platform (engagements / followers) |
| `TARGET_NICHES` | `["Personal finance","Small business"]` | niches that fit fully |
| `ADJACENT_NICHES` | `["Productivity","Tech"]` | niches that fit half |
| `FOLLOWER_RANGE` | `[10000,250000]` | audience size you want; above the range scores 0.6, below scales down |
| `MIN_FOLLOWERS` | `2000` | applications below this get tier C whatever the score |
| `TARGET_COUNTRIES` | `["US","CA","GB","United States","Canada"` | countries that score full marks for region |
| `MAX_RATE_PER_POST` | `1500` | budget per post in USD |
| `TIER_A` | `75` | score for the shortlist |
| `TIER_B` | `55` | score for maybe |
| `SENDER_NAME` | `'Jules, Tallyroom partnerships'` | sign-off on replies |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Create the Airtable records`
- `Email the reply`

## Requirements

- An Airtable base for the shortlist
- A Gmail account

## Customising

- `WEIGHTS` must add up to 100 and decide what matters most.
- `ER_BENCHMARKS` holds the typical engagement rate per platform.
- `TIER_A` and `TIER_B` move the tier boundaries.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (manual sample applications) | 14 | none | `STOP: test run - Airtable untouched`, `STOP: held for a personal reply`, `STOP: preview - nothing sent` |
| live form application | 13 | `Create the Airtable records`, `Email the reply` | `Create the Airtable records`, `Email the reply` |
