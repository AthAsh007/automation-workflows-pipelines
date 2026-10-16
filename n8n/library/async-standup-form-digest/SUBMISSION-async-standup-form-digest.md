# Collect async standups with an n8n form and post a digest to Slack

**Who's it for**
Remote and hybrid teams of 4 to 25 across time zones who dropped the daily call but still want one place to see progress and blockers. Each person fills a 1-minute form; the team reads one message.

**How it works**
1. Anyone on `TEAM` fills the standup form: yesterday, today and blockers. The answers are saved as a row on the Standups tab, dated in `TIMEZONE`.
2. Every weekday at 10:30 the second trigger reads the tab (or sample rows), keeps each person's latest standup for today and lists everyone on `TEAM` who has not filled it in.
3. Blockers go first. Answers like none or n/a are ignored, and a person who also reported a blocker on their previous standup is marked as blocked 2 days running.
4. One digest is posted to Slack, with people tagged by their Slack id.

**How to set up**
1. Run it once as imported. It builds a digest from sample standups and stops at `STOP: dry run - digest not posted`.
2. Create a Standups tab with date, email, name, yesterday, today, blockers and submitted_at columns. Connect Google Sheets and set `STANDUP_SHEET_ID`.
3. Fill `TEAM` with emails, names and Slack ids. Connect Slack, set `SLACK_CHANNEL_ID` and share the form URL with the team.
4. Set `DRY_RUN = false` and activate the workflow so the form saves rows and the digest posts.

**Requirements**
- A Google Sheet for standup rows
- A Slack workspace
- An n8n instance that can serve a form

**How to customize**
- `TIMEZONE` decides which calendar day a standup belongs to.
- `NO_BLOCKER_WORDS` lists answers that mean there is no blocker.
- Change the cron on `Every weekday at 10:30` to move the digest.
