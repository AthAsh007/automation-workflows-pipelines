# Send CSAT surveys after Freshdesk tickets close and log scores in Google Sheets

**Who's it for**
Support teams on Freshdesk plans without built-in surveys, or who want CSAT scores in a sheet they own. One workflow sends the survey and records the answer.

**How it works**
1. Every day at 10:00 it lists Freshdesk tickets updated in the last 24 hours and keeps the resolved and closed ones, or 9 sample tickets until Freshdesk is connected.
2. A ticket is skipped if it was resolved under 2 hours ago, already surveyed, tagged `no_survey`, from an internal domain, or if the requester had a survey in the last 30 days.
3. Each survey email has five signed links that point back to this workflow's own webhook.
4. A click records the score against the ticket in the Surveys tab, shows a thank-you message, and posts any 1 or 2 to Slack with a link to the ticket.

**How to set up**
1. Run it once as imported. It previews against sample tickets and stops at `STOP: preview - nothing sent`.
2. Add a Freshdesk credential to `Fetch recently updated tickets`, fill in `FRESHDESK_DOMAIN` and set `USE_FRESHDESK = true`.
3. Create a sheet with a Surveys tab (ticket_id, requester_email, subject, sent_at, score, scored_at, mode) and put its id in `SURVEY_SHEET_ID`.
4. Activate the workflow, copy the production URL of `Score link clicked` into `WEBHOOK_URL` and change `LINK_SALT` to any phrase.
5. Put your address in `TEST_EMAIL` to receive the surveys yourself, then set `TEST_RUN = false`.

**Requirements**
- A Freshdesk account with API access
- A Gmail account
- A Google Sheet
- Optional: a Slack workspace

**How to customize**
- `COOLDOWN_DAYS` stops frequent requesters getting a survey after every ticket.
- `MIN_HOURS_AFTER_RESOLVE` waits before asking, in case the customer reopens.
- `ALERT_AT_OR_BELOW` sets which scores reach Slack.
