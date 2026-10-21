# Report a weekly Pipedrive referral funnel to Google Sheets with trends

For managers of a referral or partnership pipeline in Pipedrive who need a weekly funnel that Insights cannot build.

**How it works**
1. Every Monday it reads every page of open deals, activities and deal fields. A failed read alerts and fails the run.
2. Medical-looking fields are blocked, and coverage uses the same definition as the companion activity guard.
3. The funnel is computed: attempts, conversations, meetings, partners, referrals, screened, enrolled.
4. Last week's row is read back from the Dashboard tab, so every headline number shows its week-over-week change.
5. Reps are flagged for coaching: many attempts but few conversations, or too many deals without a next step.
6. Four tabs are written and a digest is posted to Slack. Unmapped fields read **not captured**, never 0.

**Setup**
1. Run it as imported: a demo pipeline and a sample last-week row produce the full digest, and nothing is written.
2. In `config` set `COMPANY_DOMAIN`, `API_TOKEN` and `RESULT_FIELDS`.
3. Create a Google Sheet with the four tabs, put its id in `SHEET_ID` and add a Google Sheets credential.
4. Add a Slack webhook URL for the digest.

**Requirements**
A Pipedrive API token and a Google Sheet. Slack is optional.

**How to customize**
`REPORT_WINDOW_DAYS`, the `COACH_*` thresholds and the funnel field map are in `config`.
