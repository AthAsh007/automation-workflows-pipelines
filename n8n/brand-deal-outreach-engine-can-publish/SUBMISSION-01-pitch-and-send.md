# Send personalised brand deal pitches from Airtable with Instantly

**Who's it for**
Creator-management agencies, talent managers and solo operators running paid brand-deal outreach at volume, who need every pitch to read as though a person wrote it and need to prove it rather than promise it.

**How it works**
On a weekday schedule the run loads creators, brand targets, sending inboxes and the pitch log from Airtable, or builds an offline demo roster when no key is set. `match brands to students` pairs each creator with brands in their own niche whose budget clears their minimum rate and skips anyone pitched inside the re-pitch window. `build the pitch` assembles verifiable facts in code and hands the model that list with an instruction to add nothing to it. `audit the pitch` holds anything thin, templated, mis-sized or numerically unsupported. `assign a healthy inbox` fails closed: an inbox that cannot be proved warmed and clean sends nothing. Survivors are pushed into an Instantly campaign, every pitch — sent or held — is logged the same day, and a run summary is posted to Slack.

**How to set up**
1. Open `config` and add your Airtable personal access token and base id.
2. Add the Anthropic key, the Instantly key and a campaign id.
3. Add a Slack incoming webhook URL for the run summary.
4. Leave `TEST_RUN = true` for the first run, read `STOP: not sent`, then set it to false.

**Requirements**
An Airtable base with Students, Brands, Inboxes and Pitches tables. Anthropic, Instantly and Slack are optional: a blank key skips that branch instead of failing the run.

**How to customize**
`MIN_FACTS`, `BANNED_PHRASES`, `MIN_WORDS`/`MAX_WORDS`, `MIN_WARMUP_DAYS` and `PITCHES_PER_STUDENT_PER_DAY` in `config` control how strict each gate is.
