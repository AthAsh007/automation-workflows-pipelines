# Combine Stripe revenue and Google Sheets ad spend into a daily CAC report in Slack

**Who's it for**
Founders and growth marketers at subscription businesses who log ad spend in a Google Sheet and sell through Stripe. The morning post answers what a new customer cost yesterday and over the last week, per channel.

**How it works**
1. Every day at 07:15 it reads Stripe subscriptions created in the last 8 days and the Ad spend tab, or sample data for either until connected.
2. Only subscriptions that are active or past due count as new customers. The channel comes from the customer metadata key in `CHANNEL_METADATA_FIELD`, cleaned up through `CHANNEL_ALIASES`.
3. For yesterday and for the 7 complete days before today it works out blended CAC (spend divided by new customers), CAC per channel, average new MRR, and payback months at your gross margin.
4. Channels that spent money with no new customers, and a 7-day CAC above `TARGET_CAC`, are flagged in the Slack post.

**How to set up**
1. Run it once as imported. It reports on sample data and stops at `STOP: preview - nothing posted`.
2. Add a Stripe credential to `Fetch new subscriptions` and set `USE_STRIPE = true`. Store the acquisition channel on each Stripe customer as metadata.
3. Connect Google Sheets with `SPEND_SHEET_ID` (Ad spend tab: Date, Channel, Spend) and Slack with `SLACK_CHANNEL_ID`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel, where the test report lands. Set `TEST_RUN = false` for the daily post to `SLACK_CHANNEL_ID`.

**Requirements**
- A Stripe account with subscriptions
- A Google Sheet with daily ad spend
- A Slack workspace

**How to customize**
- `GROSS_MARGIN` and `TARGET_CAC` drive payback and the warning line.
- `CHANNEL_ALIASES` folds names like adwords and google into one channel.
- `WINDOW_DAYS` changes the rolling window from 7 days.
