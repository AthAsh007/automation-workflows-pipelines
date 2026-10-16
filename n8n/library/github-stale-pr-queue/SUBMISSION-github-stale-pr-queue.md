# Post a weekly stale pull request queue from GitHub to Slack

**Who's it for**
Engineering leads of teams with 4 to 30 developers where pull requests sit for days because nobody knows whose turn it is. Monday morning starts with a list that says who has to act on what.

**How it works**
1. Every Monday at 09:30 it queries open pull requests in each repository in `REPOS` through the GitHub GraphQL API, or uses sample data until GitHub is connected.
2. Drafts are skipped. A pull request waits on the author when changes were requested and no commit came after, or when it is approved but not merged. Otherwise it waits on the requested reviewers.
3. Anything not updated for `STALE_DAYS` is stale. Size comes from lines added plus deleted, XS to XL.
4. One Slack message lists reviewer waits first, oldest first, then author waits, with GitHub logins turned into Slack mentions through `SLACK_USERS`.

**How to set up**
1. Run it once as imported. It builds the queue from sample pull requests and stops at `STOP: dry run - nothing posted`.
2. Add a GitHub credential to `Query open pull requests`, list your repositories in `REPOS` and set `USE_GITHUB = true`.
3. Connect Slack, set `SLACK_CHANNEL_ID` and map GitHub logins to Slack member ids in `SLACK_USERS`.
4. Set `DRY_RUN = false` once the queue looks right.

**Requirements**
- A GitHub token with read access to the repositories
- A Slack workspace

**How to customize**
- `STALE_DAYS` sets how long without an update counts as stale.
- `SIZE_STEPS` sets the line counts for XS, S, M and L; anything above is XL.
- `MAX_LINES` caps the message length; the rest is summarised as a count.
