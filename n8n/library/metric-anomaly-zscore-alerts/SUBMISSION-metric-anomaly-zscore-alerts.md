# Detect anomalies in daily Google Sheets metrics and alert Slack

**Who's it for**
Founders, ops and growth people who log daily numbers (signups, orders, revenue, errors) in a Google Sheet and only notice a broken checkout or a tracking gap days later. One Slack message lands only when something is off.

**How it works**
1. Every day at 07:30 it reads the Metrics tab (Date, Metric, Value), or 40 days of sample data until a sheet is set.
2. For each metric, the latest value is compared with the previous 28 days: mean, standard deviation and z-score. With `WEEKDAY_SEASONALITY` on, only the same weekday over the last 8 weeks is used, so a quiet Sunday is not an anomaly.
3. A value is flagged only when |z| is at least `Z_THRESHOLD` and it is also `MIN_PCT_CHANGE` percent away from the mean. Small, noisy metrics stop paging you over 3 extra rows.
4. Metrics with fewer than `MIN_SAMPLES` points, or whose newest row is older than `STALE_DAYS`, are reported as such instead of being scored.
5. One Slack message lists every anomaly with its direction and size. Each metric is alerted once per day.

**How to set up**
1. Run it once as imported. It scores sample metrics and stops at `STOP: preview - nothing sent`.
2. Point `METRICS_SHEET_ID` at a sheet with a Metrics tab in Date, Metric, Value format and connect Google Sheets.
3. Connect Slack and set `SLACK_CHANNEL_ID`. Set `DIRECTIONS` for metrics where only a drop or only a rise matters.
4. Set `TEST_EMAIL` to any address to post marked [TEST] alerts, then set `TEST_RUN = false`.

**Requirements**
- A Google Sheet with one row per metric per day
- A Slack workspace

**How to customize**
- `Z_THRESHOLD` and `MIN_PCT_CHANGE` set how unusual a value must be.
- Turn on `WEEKDAY_SEASONALITY` for metrics with a weekly rhythm.
- `DIRECTIONS` limits a metric to drops (revenue) or rises (errors).
