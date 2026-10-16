# Check a sitemap for broken pages and email a weekly report with Gmail

**Who's it for**
Site owners and marketers who publish often and only learn about a broken page when a customer sends a screenshot. You get one email a week, and only when the list of problems changed.

**How it works**
1. Every Monday at 07:00 it reads each sitemap in `SITEMAP_URLS`, or a sample sitemap until live checks are on.
2. Page URLs matching `EXCLUDE_PATTERNS` are dropped and the 200 most recently modified are kept.
3. Each page is requested without following redirects and sorted into ok, redirect, client error (4xx), server error (5xx) or unreachable (timeout or DNS).
4. Results are compared with last week. If a page newly broke or got fixed, an HTML email lists new problems first, then fixes, then problems that remain.

**How to set up**
1. Run it once as imported. It checks the sample sitemap and stops at `STOP: preview - nothing sent`.
2. Put your sitemap address in `SITEMAP_URLS` and set `USE_LIVE_CHECKS = true`. For a sitemap index, list the child sitemaps instead.
3. Connect Gmail to `Email the report` and set `REPORT_TO`.
4. Put your address in `TEST_EMAIL` to receive a test report. Set `TEST_RUN = false` to send to `REPORT_TO` and save the weekly baseline.

**Requirements**
- A public XML sitemap
- A Gmail account

**How to customize**
- `MAX_URLS` caps the pages checked per run.
- `REPORT_REDIRECTS` decides whether redirects count as problems.
- `ALWAYS_SEND` true sends the report every week, changed or not.
