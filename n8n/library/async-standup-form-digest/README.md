# Collect async standups with an n8n form and post a digest to Slack

One workflow with two triggers: an n8n form saves each person's standup to Google Sheets, and a 10:30 weekday run posts a Slack digest with every update, blockers on top (marked when they repeat from the day before) and who has not checked in.

Import `async-standup-form-digest-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Remote and hybrid teams of 4 to 25 across time zones who dropped the daily call but still want one place to see progress and blockers. Each person fills a 1-minute form; the team reads one message.

## How it works

1. Anyone on `TEAM` fills the standup form: yesterday, today and blockers. The answers are saved as a row on the Standups tab, dated in `TIMEZONE`.
2. Every weekday at 10:30 the second trigger reads the tab (or sample rows), keeps each person's latest standup for today and lists everyone on `TEAM` who has not filled it in.
3. Blockers go first. Answers like none or n/a are ignored, and a person who also reported a blocker on their previous standup is marked as blocked 2 days running.
4. One digest is posted to Slack, with people tagged by their Slack id.

## Sections on the canvas

1. **Two triggers and the form path.** The form and the 10:30 schedule share one `config`, which records which fired. A form answer is checked against `TEAM` and appended only on a live run with a sheet; everything else goes on to the digest.
2. **Read today's standups.** `Standup sheet set?` reads the Standups tab once `STANDUP_SHEET_ID` is filled. `Load sample standups` covers a double submission, a repeated blocker, a none answer and someone not on the team.
3. **Build and post the digest.** Only the latest row per person counts, so resubmitting fixes a typo instead of duplicating it. The previous standup is what marks a blocker as repeated. `Post the digest?` needs a live run and a channel.

## Setup

1. Run it once as imported. It builds a digest from sample standups and stops at `STOP: dry run - digest not posted`.
2. Create a Standups tab with date, email, name, yesterday, today, blockers and submitted_at columns. Connect Google Sheets and set `STANDUP_SHEET_ID`.
3. Fill `TEAM` with emails, names and Slack ids. Connect Slack, set `SLACK_CHANNEL_ID` and share the form URL with the team.
4. Set `DRY_RUN = false` and activate the workflow so the form saves rows and the digest posts.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `STANDUP_SHEET_ID` | `''` | Google Sheets id with a Standups tab; blank uses sample rows |
| `TEAM` | `[{"email":"ana@northwind.example","name"` | who is expected to post a standup |
| `TIMEZONE` | `'Europe/Berlin'` | the team calendar day |
| `NO_BLOCKER_WORDS` | `["none","no","n/a","na","-","nothing","n` | answers that mean no blocker |
| `SLACK_CHANNEL_ID` | `''` | channel for the digest; blank skips Slack |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Append to Standups tab`
- `Read Standups tab`
- `Post the digest to Slack`

## Requirements

- A Google Sheet for standup rows
- A Slack workspace
- An n8n instance that can serve a form

## Customising

- `TIMEZONE` decides which calendar day a standup belongs to.
- `NO_BLOCKER_WORDS` lists answers that mean there is no blocker.
- Change the cron on `Every weekday at 10:30` to move the digest.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample digest, dry run) | 10 | none | `STOP: dry run - digest not posted` |
| form submission saved live | 8 | `Append to Standups tab` | `Append to Standups tab` |
| digest live from the sheet | 10 | `Post the digest to Slack` | `Post the digest to Slack` |
