# Collect NPS from an n8n form and create HubSpot tasks for detractors

**Who's it for**
Customer success teams at B2B companies who want an NPS survey without a survey tool, and want unhappy customers to reach a named person the same day.

**How it works**
1. Customers answer a four-question n8n form: email, score from 0 to 10, reason and company. A manual run uses a sample answer.
2. The contact and its owner are looked up in HubSpot by email. The score sets the category (promoter 9-10, passive 7-8, detractor 0-6) and keywords tag the reason with themes such as support or pricing.
3. Every answer is appended to a Google Sheets log with its category and themes.
4. A detractor creates a high-priority HubSpot task for the account owner, due in one business day, and tags that owner in Slack. A promoter gets a short email asking for a review. Passives are logged only.

**How to set up**
1. Run it once from `Run manually`. It handles a sample detractor and stops at `STOP: not live - no task created`, `STOP: preview - nothing posted` and `STOP: not live - nothing logged`.
2. Add a HubSpot private app credential to both HubSpot nodes and set `USE_HUBSPOT = true`. Map owner ids to Slack ids in `OWNERS`.
3. Connect Google Sheets with `NPS_SHEET_ID`, Slack with `SLACK_CHANNEL_ID`, and Gmail. Set `REVIEW_URL` to your review page.
4. Put your address in `TEST_EMAIL` to receive review requests yourself, then set `TEST_RUN = false` and share the form URL.

**Requirements**
- A HubSpot account with a private app token
- A Google Sheet for the log
- A Gmail account
- Optional: a Slack workspace

**How to customize**
- `THEMES` maps each theme to the words that tag it.
- `FALLBACK_OWNER_ID` takes detractors whose contact has no owner.
- `REVIEW_URL` and `SENDER_NAME` shape the promoter email.
