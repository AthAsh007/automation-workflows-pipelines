# Find repeated support questions in Gmail and report help center gaps weekly

Reads the last 7 days of support email threads from Gmail, groups similar questions by shared keywords, checks each group against your help article list, and emails or posts a ranked list of topics with no article plus topics people still ask about despite one.

Import `support-faq-gap-report-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Support teams of one to five people who answer from a shared Gmail inbox and keep a small help center. It shows which article to write next, from what customers actually asked last week.

## How it works

1. Every Monday at 08:00 it lists last week's threads sent to your support address, one question per thread, or uses 16 sample emails until Gmail is connected.
2. Subjects and the first lines are lower-cased, stripped of reply prefixes and ticket numbers, and reduced to keywords.
3. Questions that share at least a quarter of their keywords are grouped. Groups of 2 or more are compared with `HELP_ARTICLES`.
4. A group with no article sharing 2 keywords is a gap. A group whose article exists is listed as "still asked", which usually means the article is hard to find or unclear.

## Sections on the canvas

1. **Start and settings.** Runs Monday at 08:00 so the report covers a full week. The help article list lives in `config`; adding an article there removes its topic from next week's gaps.
2. **Read last week's threads.** The Gmail API list call only returns ids, so `Fetch subject and snippet` asks for metadata alone, never full bodies. `Read Gmail messages` keeps one message per thread so replies do not inflate a topic.
3. **Group questions and check articles.** Keyword overlap is crude but explainable: each topic shows the words that tied it together. An article must share `ARTICLE_MATCH_MIN` keywords to count, so a vague match does not hide a real gap.
4. **Send the report.** The report text is built on every run so a dry run shows the result. Email and Slack are each optional and each lands on its own STOP when blank, behind one `Live run?` gate.

## Setup

1. Run it once as imported. It groups the sample emails and stops at `STOP: dry run - report not sent`.
2. Add a Gmail credential to `List last week support emails` and `Fetch subject and snippet`, set `SUPPORT_ADDRESS`, and set `USE_GMAIL = true`.
3. List your current help articles with a few keywords each in `HELP_ARTICLES`.
4. Fill in `REPORT_TO` and, optionally, `SLACK_CHANNEL_ID`, then set `DRY_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_GMAIL` | `false` | set true after adding the Gmail credential to the two Gmail API nodes |
| `SUPPORT_ADDRESS` | `'support@yourcompany.example'` | address customers write to |
| `LOOKBACK_DAYS` | `7` | how far back to read |
| `MAX_THREADS` | `200` | most threads read per run |
| `HELP_ARTICLES` | `[{"title":"Reset your password","url":"h` | your current help articles; keywords are what a question about that article would say |
| `EXTRA_STOPWORDS` | `["acme","app"]` | words to ignore on top of the built-in list, such as your product name |
| `SIMILARITY` | `0.25` | share of keywords two questions must have in common to group (0 to 1) |
| `MIN_GROUP_SIZE` | `2` | a topic needs at least this many threads to be reported |
| `ARTICLE_MATCH_MIN` | `2` | shared keywords needed for an article to cover a topic |
| `TOP_GAPS` | `5` | how many gaps the report lists |
| `REPORT_TO` | `''` | email for the report; blank skips email |
| `SLACK_CHANNEL_ID` | `''` | channel for the report; blank skips Slack |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `List last week support emails`
- `Fetch subject and snippet`
- `Email the gap report`
- `Post the gap report to Slack`

## Requirements

- A Gmail or Google Workspace inbox that receives support email
- A list of your help articles
- Optional: a Slack workspace

## Customising

- `MIN_GROUP_SIZE` and `SIMILARITY` decide how alike questions must be to count as one topic.
- `EXTRA_STOPWORDS` removes words that appear in every email, such as your product name.
- `TOP_GAPS` sets how many gaps the report lists.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 12 | none | `STOP: dry run - report not sent` |
| live with Gmail, email and Slack | 17 | `Email the gap report`, `Post the gap report to Slack` | `Email the gap report`, `Post the gap report to Slack` |
