# Summarise new App Store reviews from Apple's RSS feed into Slack

**Who's it for**
Mobile product and support teams who ship an iOS app in more than one country and check reviews in App Store Connect when they remember to. No Apple credentials are needed.

**How it works**
1. Every morning at 09:00 it reads Apple's public review feed (newest 50 per country) for each country in `COUNTRIES`, or 12 sample reviews until `APP_ID` is set.
2. Reviews already posted on an earlier run are dropped; on the very first run only the last 7 days count.
3. It counts reviews per star and the average per country, and tags 1 and 2 star reviews with topics such as crash, login or pricing.
4. If most low ratings come from one app version, the digest says so, which usually points at a regression.

**How to set up**
1. Run it once as imported. It builds a digest from the sample reviews and stops at `STOP: no Slack channel`.
2. Put your numeric App Store id (from the app URL, after `id`) in `APP_ID` and pick `COUNTRIES`.
3. Add a Slack credential to `Post the digest to Slack` and set `SLACK_CHANNEL_ID`.
4. Set `DRY_RUN = false` and activate the workflow. Posted review ids are kept in static data, which n8n saves on activated runs.

**Requirements**
- An app on the App Store
- A Slack workspace

**How to customize**
- `COMPLAINT_TOPICS` maps each topic to the words that mark it; add words in your users' languages.
- `LOW_STARS` sets which ratings are flagged.
- `VERSION_ALERT_SHARE` sets the share of low ratings on one version that triggers the regression line.
