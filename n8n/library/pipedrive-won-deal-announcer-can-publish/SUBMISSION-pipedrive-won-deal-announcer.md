# Announce won Pipedrive deals in Slack with cycle time and source

**Who's it for**
Sales teams on Pipedrive that celebrate wins in a Slack channel and want the post to say more than "deal won". Each message shows how long the deal took and where it came from, so patterns show up over a month.

**How it works**
1. Every 10 minutes it reads the 100 most recently won deals from Pipedrive, or sample deals until Pipedrive is connected.
2. Only deals won in the last 48 hours that have not been announced are kept, so connecting an old account does not flood the channel.
3. Each win gets a band from `VALUE_BANDS` (Big win from 50,000), its days to close compared with the month's median, and its source from the deal origin or a custom field.
4. The month's running total is summed per currency from all wins this calendar month. One Slack message goes out per deal, oldest first.

**How to set up**
1. Run it once as imported. It formats sample wins and stops at `STOP: preview - nothing posted`.
2. Add a Pipedrive credential to `Fetch recently won deals` and set `USE_PIPEDRIVE = true`.
3. Connect Slack and set `SLACK_CHANNEL_ID`. If you track source in a custom field, put its key in `SOURCE_FIELD_KEY`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel, where test messages land. Set `TEST_RUN = false` to post to `SLACK_CHANNEL_ID` and remember announced deals.

**Requirements**
- A Pipedrive account with an API token
- A Slack workspace

**How to customize**
- `VALUE_BANDS` sets the thresholds, labels and emoji for each band.
- `ANNOUNCE_WITHIN_HOURS` decides how old a win can be and still be posted.
- `MAIN_CURRENCY` is listed first in the running total.
