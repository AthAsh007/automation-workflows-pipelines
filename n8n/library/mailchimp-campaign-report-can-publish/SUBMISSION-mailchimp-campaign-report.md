# Report Mailchimp campaign results to Slack a day after sending

**Who's it for**
Email marketers and small teams who send a few Mailchimp campaigns a week and forget to look at the numbers once the day is over. The report arrives when the results have settled, with the weak spots flagged.

**How it works**
1. Every day at 10:00 it reads Mailchimp reports for campaigns sent in the last 48 hours, or 4 sample reports until Mailchimp is connected.
2. Campaigns younger than 20 hours are left for tomorrow, and a campaign is only reported once.
3. Open and click rates are compared with that list's own averages. A rate more than 20% below average is flagged, as are unsubscribes above 0.5%, bounces above 2% and any spam complaint.
4. One Slack message lists each campaign with its numbers, its verdict and the reasons.

**How to set up**
1. Run it once as imported. It scores the sample reports and stops at `STOP: preview - nothing posted`.
2. Add a Mailchimp credential to `Fetch recent campaign reports`, set `MAILCHIMP_DC` to the data centre in your API key (the part after the dash, e.g. us21) and set `USE_MAILCHIMP = true`.
3. Connect Slack and set `SLACK_CHANNEL_ID`.
4. Set `TEST_EMAIL` to any address to post with a [TEST] prefix. Set `TEST_RUN = false` to post normally and remember what was reported.

**Requirements**
- A Mailchimp account with sent campaigns
- A Slack workspace

**How to customize**
- `MIN_HOURS` and `MAX_HOURS` set the reporting window after the send.
- `DROP_PCT` decides how far below the list average a rate must fall to be flagged.
- `BENCHMARKS` are used when Mailchimp has no list averages yet, for example on a new list.
