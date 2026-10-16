# Score creator applications from a form into an Airtable shortlist

**Who's it for**
Brand and growth marketers running creator programmes who get more applications than they can vet. Every applicant gets an answer, and the shortlist in Airtable is sorted before anyone opens it.

**How it works**
1. Creators apply through the hosted n8n form with platform, followers, average engagements per post, niche, country and rate per post.
2. Five parts are scored from 0 to 1 and weighted by `WEIGHTS`: engagement rate against the platform benchmark, niche fit, audience size against your target range, region, and rate against `MAX_RATE_PER_POST`.
3. A total of 75+ is tier A (shortlist), 55-74 tier B (maybe), under 55 tier C. An engagement rate over 5 times the benchmark, or a rate above budget on an otherwise strong profile, goes to manual review with no automatic reply.
4. Every application becomes an Airtable record with its scores and reasons, and tiers A, B and C get their own reply email.

**How to set up**
1. Run it once as imported from `Run manually`. It scores 4 sample applications and stops at `STOP: test run - Airtable untouched` and `STOP: preview - nothing sent`.
2. Create an Airtable table with the fields listed in `Shape the Airtable record`, add the token credential and set `AIRTABLE_BASE_ID`.
3. Set `TARGET_NICHES`, `TARGET_COUNTRIES` and `MAX_RATE_PER_POST`, connect Gmail and share the production form URL.
4. Put your address in `TEST_EMAIL` to receive the replies yourself, then set `TEST_RUN = false`.

**Requirements**
- An Airtable base for the shortlist
- A Gmail account

**How to customize**
- `WEIGHTS` must add up to 100 and decide what matters most.
- `ER_BENCHMARKS` holds the typical engagement rate per platform.
- `TIER_A` and `TIER_B` move the tier boundaries.
