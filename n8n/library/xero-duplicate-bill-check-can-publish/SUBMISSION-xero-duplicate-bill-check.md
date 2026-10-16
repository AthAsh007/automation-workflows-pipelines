# Detect likely duplicate bills in Xero and post a review list to Slack

**Who's it for**
Accounts payable staff and bookkeepers on Xero who enter bills from email, scans and supplier portals, where the same invoice often gets keyed twice. The check runs before each payment run so a duplicate is caught before it is paid.

**How it works**
1. Every Tuesday and Thursday at 08:00 it reads bills with status Draft or Awaiting Payment from the last 90 days, or a sample set until Xero is connected.
2. Each pair of bills from the same supplier, or from two suppliers whose names differ by a typo, is scored: 30 for the supplier, 30 for the same amount, 25 for the same date and 40 for the same supplier reference.
3. Two different references take 30 points off, so weekly bills of the same amount are not flagged. Pairs scoring 70 or more go on the list.
4. Slack gets each pair with the reasons and a link to both bills. Pairs already posted are not posted again.

**How to set up**
1. Run it once as imported. It scores sample bills and stops at `STOP: preview - nothing posted`.
2. Add a Xero OAuth2 credential to `Fetch bills from Xero`, put your organisation id in `XERO_TENANT_ID`, then set `USE_XERO = true`.
3. Connect Slack and set `SLACK_CHANNEL_ID`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel, where the test list lands. Set `TEST_RUN = false` to post to `SLACK_CHANNEL_ID` and remember posted pairs.

**Requirements**
- A Xero organisation with bills
- A Slack workspace

**How to customize**
- `REVIEW_SCORE` raises or lowers how sure a pair must be before it is posted.
- `AMOUNT_TOLERANCE`, `AMOUNT_NEAR_PCT` and `DATE_WINDOW_DAYS` set what counts as the same amount and date.
- `LOOKBACK_DAYS` limits how far back bills are compared.
