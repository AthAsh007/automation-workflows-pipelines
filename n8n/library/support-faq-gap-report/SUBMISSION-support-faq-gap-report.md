# Find repeated support questions in Gmail and report help center gaps weekly

**Who's it for**
Support teams of one to five people who answer from a shared Gmail inbox and keep a small help center. It shows which article to write next, from what customers actually asked last week.

**How it works**
1. Every Monday at 08:00 it lists last week's threads sent to your support address, one question per thread, or uses 16 sample emails until Gmail is connected.
2. Subjects and the first lines are lower-cased, stripped of reply prefixes and ticket numbers, and reduced to keywords.
3. Questions that share at least a quarter of their keywords are grouped. Groups of 2 or more are compared with `HELP_ARTICLES`.
4. A group with no article sharing 2 keywords is a gap. A group whose article exists is listed as "still asked", which usually means the article is hard to find or unclear.

**How to set up**
1. Run it once as imported. It groups the sample emails and stops at `STOP: dry run - report not sent`.
2. Add a Gmail credential to `List last week support emails` and `Fetch subject and snippet`, set `SUPPORT_ADDRESS`, and set `USE_GMAIL = true`.
3. List your current help articles with a few keywords each in `HELP_ARTICLES`.
4. Fill in `REPORT_TO` and, optionally, `SLACK_CHANNEL_ID`, then set `DRY_RUN = false`.

**Requirements**
- A Gmail or Google Workspace inbox that receives support email
- A list of your help articles
- Optional: a Slack workspace

**How to customize**
- `MIN_GROUP_SIZE` and `SIMILARITY` decide how alike questions must be to count as one topic.
- `EXTRA_STOPWORDS` removes words that appear in every email, such as your product name.
- `TOP_GAPS` sets how many gaps the report lists.
