# Validate campaign links in Google Sheets before launch

**Who's it for**
Marketing teams who build UTM links in a spreadsheet before a launch and find the broken ones in analytics a week later. Every row gets a status and a plain reason before anything goes out.

**How it works**
1. Every weekday at 08:00 it reads the Links tab, or 8 sample links until the sheet is connected. Rows already marked ok are skipped.
2. Each link is checked for a valid https URL, utm_source, utm_medium and utm_campaign present, lowercase values without spaces, and a medium from your allowed list.
3. utm_content used twice in the same campaign is flagged, because the two ads become one row in your reports.
4. Each landing page is requested once (without the query string) and anything other than a 2xx or 3xx fails the row. The status and reasons are written back by link_id.

**How to set up**
1. Run it once as imported. It checks the sample links and stops at `STOP: dry run - sheet untouched`.
2. Create a Links tab with link_id, url, campaign, status, issues and checked_at columns, connect Google Sheets and set `LINKS_SHEET_ID`.
3. Set `USE_LIVE_CHECKS = true` to request real landing pages.
4. Read the results in `Write a status for each row`, then set `DRY_RUN = false` to fill the status column.

**Requirements**
- A Google Sheet with your campaign links

**How to customize**
- `REQUIRED_PARAMS` and `ALLOWED_MEDIUMS` hold your naming rules.
- `WARN_ONLY` lists checks that should warn instead of fail, such as http links.
- `SLOW_MS` flags landing pages slower than this.
