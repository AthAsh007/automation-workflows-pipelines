# Report weekly cash runway from Google Sheets to Slack

**Who's it for**
Founders and finance leads at early-stage companies who track bank balances and weekly cash flow in Google Sheets. The Monday post answers one question, how many months of cash are left, and whether that number moved.

**How it works**
1. Every Monday at 08:30 it reads the Balances and Cashflow tabs, or sample data until a sheet is connected.
2. Cash is the sum of balances in `BASE_CURRENCY`, with credit cards counted as negative. Accounts in other currencies are listed and left out.
3. Weekly net burn is outflows minus inflows, averaged over the last 13 complete weeks and turned into a monthly figure. Weeks over twice the median burn are named as one-offs.
4. Runway is cash divided by monthly burn, compared with the same figure a week earlier, and rated green from 12 months, amber from 6, red below that. One Slack message carries it all.

**How to set up**
1. Run it once as imported. It reports on sample numbers and stops at `STOP: preview - nothing posted`.
2. Connect Google Sheets and put the spreadsheet id in `FINANCE_SHEET_ID`. Column names are set in `COLUMNS`.
3. Connect Slack and set `SLACK_CHANNEL_ID`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel, where the test report lands. Set `TEST_RUN = false` for the weekly post to `SLACK_CHANNEL_ID`.

**Requirements**
- A Google Sheet with Balances and Cashflow tabs
- A Slack workspace

**How to customize**
- `GREEN_MONTHS` and `AMBER_MONTHS` set the colour thresholds.
- `BURN_WEEKS` changes the averaging window from 13 weeks.
- Set `EXCLUDE_ONE_OFFS = true` to leave unusual weeks out of the average.
