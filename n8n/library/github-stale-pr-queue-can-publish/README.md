# Post a weekly stale pull request queue from GitHub to Slack

Reads open pull requests across several repositories with one GraphQL query each, works out whether each one waits on the author or a reviewer from its review state and latest commit, sizes it by lines changed, and posts the stale ones to Slack as a sorted queue.

Import `github-stale-pr-queue-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Engineering leads of teams with 4 to 30 developers where pull requests sit for days because nobody knows whose turn it is. Monday morning starts with a list that says who has to act on what.

## How it works

1. Every Monday at 09:30 it queries open pull requests in each repository in `REPOS` through the GitHub GraphQL API, or uses sample data until GitHub is connected.
2. Drafts are skipped. A pull request waits on the author when changes were requested and no commit came after, or when it is approved but not merged. Otherwise it waits on the requested reviewers.
3. Anything not updated for `STALE_DAYS` is stale. Size comes from lines added plus deleted, XS to XL.
4. One Slack message lists reviewer waits first, oldest first, then author waits, with GitHub logins turned into Slack mentions through `SLACK_USERS`.

## Sections on the canvas

1. **Start and settings.** Runs every Monday at 09:30. `List repositories` builds one GraphQL request per repository, which returns reviews, review requests and the last commit in a single call instead of one REST call per pull request.
2. **Read open pull requests.** The GraphQL call is a POST that only reads, so it is not treated as a write. `Load sample pull requests` returns the same response shape, including a draft and a re-review case.
3. **Decide whose turn it is.** Comparing the last commit with the latest change request is what separates "author has not fixed it" from "author fixed it, reviewer has not looked". Drafts and recently updated pull requests are counted, not listed.
4. **Post the queue.** Reviewer waits come first because they block someone else. `MAX_LINES` keeps the message readable, and `Post to Slack?` needs a live run and a channel.

## Setup

1. Run it once as imported. It builds the queue from sample pull requests and stops at `STOP: dry run - nothing posted`.
2. Add a GitHub credential to `Query open pull requests`, list your repositories in `REPOS` and set `USE_GITHUB = true`.
3. Connect Slack, set `SLACK_CHANNEL_ID` and map GitHub logins to Slack member ids in `SLACK_USERS`.
4. Set `DRY_RUN = false` once the queue looks right.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_GITHUB` | `false` | set true after adding the GitHub credential |
| `REPOS` | `["northwind/api","northwind/web"]` | owner/name of each repository |
| `STALE_DAYS` | `3` | days without an update before a pull request is listed |
| `SIZE_STEPS` | `{"XS":10,"S":100,"M":400,"L":1000}` | upper bound of lines changed for each size; above L is XL |
| `SLACK_USERS` | `{"lucyg":"U01LUCY","ravis":"U01RAVI","ma` | GitHub login -> Slack member id for mentions |
| `MAX_LINES` | `20` | most pull requests listed in one message |
| `SLACK_CHANNEL_ID` | `''` | channel for the weekly queue; blank skips Slack |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Query open pull requests`
- `Post the queue to Slack`

## Requirements

- A GitHub token with read access to the repositories
- A Slack workspace

## Customising

- `STALE_DAYS` sets how long without an update counts as stale.
- `SIZE_STEPS` sets the line counts for XS, S, M and L; anything above is XL.
- `MAX_LINES` caps the message length; the rest is summarised as a count.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample pull requests, dry run) | 11 | none | `STOP: dry run - nothing posted` |
| live with GitHub and Slack | 11 | `Post the queue to Slack` | `Post the queue to Slack` |
