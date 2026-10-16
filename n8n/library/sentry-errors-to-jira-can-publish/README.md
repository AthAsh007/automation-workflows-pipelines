# Open Jira issues from repeated Sentry errors

Every hour it reads unresolved Sentry issues, keeps those over an event and affected-user threshold, checks Jira for an issue already labelled with the Sentry id, and opens a Jira bug with a mapped priority for the rest.

Import `sentry-errors-to-jira-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Product engineering teams of 3 to 40 who use Sentry for errors and Jira for planned work, and find that real bugs stay in Sentry because nobody files them. Only errors that hit enough people become tickets, and each only once.

## How it works

1. Every hour it lists unresolved issues from each project in `SENTRY_PROJECTS` for the last 24 hours, sorted by frequency, or sample issues until Sentry is connected.
2. An issue qualifies with at least `MIN_EVENTS` events and `MIN_USERS` affected users, or with any users at `fatal` level. Ignored and muted issues are skipped.
3. One Jira search looks for issues labelled `sentry-<id>` for every candidate. Linked ones are skipped; a linked issue already marked Done is reported as a regression instead.
4. The rest become Jira bugs with the error, culprit, counts and a Sentry link, a priority from `PRIORITY_RULES`, and the `sentry-<id>` label that prevents duplicates.

## Sections on the canvas

1. **Start and settings.** Runs at 20 past every hour. Thresholds, the priority ladder and the Jira project live in `config`; `List Sentry projects` makes one item per project.
2. **Read unresolved errors.** Sentry is asked for unresolved issues from the last 24 hours, sorted by frequency. `Load sample Sentry issues` returns the same objects, including an ignored issue and a fatal one with a single user.
3. **Filter and check Jira once.** The threshold runs before any Jira call, and all candidates go into one JQL search on their `sentry-<id>` labels, so the duplicate check costs one request however many errors qualify.
4. **Open the Jira bugs.** A linked ticket marked Done while the error continues is reported as a regression rather than duplicated. `Create in Jira?` needs a live run and a Jira site, and `MAX_PER_RUN` is enforced in code.

## Setup

1. Run it once as imported. It checks sample errors and stops at `STOP: dry run - Jira untouched`.
2. Add a Header Auth credential to `Fetch unresolved Sentry issues` (name `Authorization`, value `Bearer` plus an internal integration token), set `SENTRY_ORG`, `SENTRY_PROJECTS` and `USE_SENTRY = true`.
3. Add a Jira Software Cloud credential to `Search Jira for linked issues` and `Create the Jira issue`, and set `JIRA_SITE` and `JIRA_PROJECT`.
4. Check the plan in `Decide what to open`, then set `DRY_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_SENTRY` | `false` | set true after adding the Header Auth credential to the Sentry node |
| `SENTRY_ORG` | `'northwind'` | organisation slug from your Sentry URL |
| `SENTRY_PROJECTS` | `["web-app","api"]` | project slugs to watch |
| `MIN_EVENTS` | `50` | events in the last 24 hours before an error qualifies... |
| `MIN_USERS` | `5` | ...and affected users; fatal errors need only one user |
| `PRIORITY_RULES` | `[{"min_users":100,"priority":"Highest"},` | first rule whose min_users is met sets the priority; fatal level is raised one step |
| `JIRA_SITE` | `''` | your Jira host, e.g. yourcompany.atlassian.net; blank skips Jira |
| `JIRA_PROJECT` | `'BUG'` | project the issues are created in |
| `MAX_PER_RUN` | `5` | hard ceiling on Jira issues per run |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Fetch unresolved Sentry issues`
- `Search Jira for linked issues`
- `Create the Jira issue`

## Requirements

- A Sentry organisation with an internal integration token
- A Jira Cloud project with a Bug issue type

## Customising

- `MIN_EVENTS` and `MIN_USERS` set how loud an error must be before it becomes a ticket.
- `PRIORITY_RULES` maps affected users and level to Jira priority names.
- `MAX_PER_RUN` caps how many issues one run can open.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample errors, dry run) | 15 | none | `STOP: dry run - Jira untouched` |
| live with Sentry and Jira, one already linked | 16 | `Create the Jira issue` | `Report what was opened` |
