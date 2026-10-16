# Open Jira issues from repeated Sentry errors

**Who's it for**
Product engineering teams of 3 to 40 who use Sentry for errors and Jira for planned work, and find that real bugs stay in Sentry because nobody files them. Only errors that hit enough people become tickets, and each only once.

**How it works**
1. Every hour it lists unresolved issues from each project in `SENTRY_PROJECTS` for the last 24 hours, sorted by frequency, or sample issues until Sentry is connected.
2. An issue qualifies with at least `MIN_EVENTS` events and `MIN_USERS` affected users, or with any users at `fatal` level. Ignored and muted issues are skipped.
3. One Jira search looks for issues labelled `sentry-<id>` for every candidate. Linked ones are skipped; a linked issue already marked Done is reported as a regression instead.
4. The rest become Jira bugs with the error, culprit, counts and a Sentry link, a priority from `PRIORITY_RULES`, and the `sentry-<id>` label that prevents duplicates.

**How to set up**
1. Run it once as imported. It checks sample errors and stops at `STOP: dry run - Jira untouched`.
2. Add a Header Auth credential to `Fetch unresolved Sentry issues` (name `Authorization`, value `Bearer` plus an internal integration token), set `SENTRY_ORG`, `SENTRY_PROJECTS` and `USE_SENTRY = true`.
3. Add a Jira Software Cloud credential to `Search Jira for linked issues` and `Create the Jira issue`, and set `JIRA_SITE` and `JIRA_PROJECT`.
4. Check the plan in `Decide what to open`, then set `DRY_RUN = false`.

**Requirements**
- A Sentry organisation with an internal integration token
- A Jira Cloud project with a Bug issue type

**How to customize**
- `MIN_EVENTS` and `MIN_USERS` set how loud an error must be before it becomes a ticket.
- `PRIORITY_RULES` maps affected users and level to Jira priority names.
- `MAX_PER_RUN` caps how many issues one run can open.
