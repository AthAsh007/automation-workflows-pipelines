# Report a referral pipeline funnel from Pipedrive to Google Sheets

**Who's it for**
Managers running a referral or business-development pipeline in Pipedrive who need a weekly
dashboard that Pipedrive Insights cannot produce, because the numbers that matter span deals,
activities and custom fields at once.

**How it works**
Every Monday it reads the open pipeline, its activities and its field definitions, passes them
through the same coverage rule its companion workflow enforces, and computes the funnel:

    outreach -> conversation -> meeting -> partner -> referrals -> pre-screen -> screened

Four tabs are written to a Google Sheet a manager can open: the dashboard row, the coverage gaps,
a breakdown by rep and a breakdown by practice. Every recruitment number comes from a named custom
field; when that field is not wired up the cell reads **not captured**, never `0` — a zero means
nobody referred, a blank means nobody configured it, and those lead to different meetings. The same
digest is posted to Slack or Discord.

**How to set up**
1. Open **`config`** and set `RESULT_FIELDS` to your Pipedrive custom-field keys and
   `REPORT_WINDOW_DAYS` to your reporting period.
2. Add your Pipedrive API token and a Google Sheet id.
3. Run it once with the demo pipeline before connecting anything — it writes nothing.

**Requirements**
A Pipedrive account with API access and a Google Sheet with four tabs. The report webhook is
optional; blank means that branch is skipped.

**How to customize**
The funnel stages and the field map are in `config`. To add a tab, follow the
`rows for ...` -> `[cred] Sheets - write ...` pair — each one is independent.
