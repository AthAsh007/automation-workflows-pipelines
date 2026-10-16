# Detect anomalies in daily Google Sheets metrics and alert Slack

Each morning scores the latest value of every metric in a Google Sheet against its last 28 days with a z-score and a percent-change rule, optionally comparing only the same weekday, skips metrics with too little history and posts one Slack alert per metric per day.

Import `metric-anomaly-zscore-alerts-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Founders, ops and growth people who log daily numbers (signups, orders, revenue, errors) in a Google Sheet and only notice a broken checkout or a tracking gap days later. One Slack message lands only when something is off.

## How it works

1. Every day at 07:30 it reads the Metrics tab (Date, Metric, Value), or 40 days of sample data until a sheet is set.
2. For each metric, the latest value is compared with the previous 28 days: mean, standard deviation and z-score. With `WEEKDAY_SEASONALITY` on, only the same weekday over the last 8 weeks is used, so a quiet Sunday is not an anomaly.
3. A value is flagged only when |z| is at least `Z_THRESHOLD` and it is also `MIN_PCT_CHANGE` percent away from the mean. Small, noisy metrics stop paging you over 3 extra rows.
4. Metrics with fewer than `MIN_SAMPLES` points, or whose newest row is older than `STALE_DAYS`, are reported as such instead of being scored.
5. One Slack message lists every anomaly with its direction and size. Each metric is alerted once per day.

## Sections on the canvas

1. **Start and settings.** Runs every day at 07:30, after overnight imports have filled yesterday. The window, thresholds, seasonality and per-metric directions all live in `config`.
2. **Read the metrics.** A long Date, Metric, Value tab takes a new metric without any change here. `Load sample metrics` uses seeded noise, so the same three outcomes appear in every preview.
3. **Score each metric.** Two rules must agree before anything is flagged: a z-score and a percent change. Thin or stale series are reported as not scored instead of producing a confident number from 3 points.
4. **Alert once.** A quiet day ends at `STOP: no anomalies` and posts nothing. Only a live post stores the metric and date in static data, so a test post never silences the real alert.

## Setup

1. Run it once as imported. It scores sample metrics and stops at `STOP: preview - nothing sent`.
2. Point `METRICS_SHEET_ID` at a sheet with a Metrics tab in Date, Metric, Value format and connect Google Sheets.
3. Connect Slack and set `SLACK_CHANNEL_ID`. Set `DIRECTIONS` for metrics where only a drop or only a rise matters.
4. Set `TEST_EMAIL` to any address to post marked [TEST] alerts, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `METRICS_SHEET_ID` | `''` | Google Sheets id with a Metrics tab (Date, Metric, Value); blank uses sample data |
| `WINDOW_DAYS` | `28` | days of history before the latest value |
| `WEEKDAY_SEASONALITY` | `false` | true compares with the same weekday over SEASONAL_WEEKS weeks |
| `SEASONAL_WEEKS` | `8` | weeks of same-weekday history when seasonality is on |
| `MIN_SAMPLES` | `14` | fewer points than this (5 with seasonality) and the metric is not scored |
| `Z_THRESHOLD` | `3` | flag when /z/ is at least this |
| `MIN_PCT_CHANGE` | `20` | and the value is at least this percent away from the mean |
| `STALE_DAYS` | `2` | a newest row older than this many days is reported as stale |
| `DIRECTIONS` | `{"revenue":"down","orders":"down","error` | metric -> 'down', 'up' or 'both' (default both) |
| `SLACK_CHANNEL_ID` | `''` | channel for anomaly alerts |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read the Metrics tab`
- `Post the anomaly alert to Slack`

## Requirements

- A Google Sheet with one row per metric per day
- A Slack workspace

## Customising

- `Z_THRESHOLD` and `MIN_PCT_CHANGE` set how unusual a value must be.
- Turn on `WEEKDAY_SEASONALITY` for metrics with a weekly rhythm.
- `DIRECTIONS` limits a metric to drops (revenue) or rises (errors).

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 10 | none | `STOP: preview - nothing sent` |
| weekday seasonality, live post | 12 | `Post the anomaly alert to Slack` | `Remember alerted metrics` |
