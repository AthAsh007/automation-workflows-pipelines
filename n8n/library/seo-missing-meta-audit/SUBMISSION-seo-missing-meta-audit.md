# Audit sitemap pages for missing titles and meta descriptions in Google Sheets

**Who's it for**
Marketers and site owners who want a page-by-page list of SEO basics to fix, without paying for a crawler subscription. The sheet becomes the to-do list, updated every week.

**How it works**
1. Every Sunday at 22:00 it reads your sitemap and fetches up to 150 pages, or 7 sample pages until live fetching is on.
2. Each page is checked for a title of 30-60 characters, a meta description of 70-160, exactly one H1, a canonical that points to itself, and no noindex tag.
3. Titles and descriptions used on more than one page are flagged on every page that shares them.
4. Missing tags, noindex and failed loads are errors, the rest are warnings. One row per page is upserted on the url column of the Audit tab.

**How to set up**
1. Run it once as imported. It audits the sample pages and stops at `STOP: dry run - sheet untouched`.
2. Set `SITEMAP_URLS` and `USE_LIVE_FETCH = true`, then run it and read the rows in `Audit each page`.
3. Connect Google Sheets, create an Audit tab with a url column, and set `AUDIT_SHEET_ID`.
4. Set `DRY_RUN = false` to write the rows.

**Requirements**
- A public XML sitemap
- A Google Sheet with an Audit tab

**How to customize**
- `TITLE_LENGTH` and `DESCRIPTION_LENGTH` hold the min and max characters.
- `MAX_PAGES` caps the pages fetched per run.
- `ERROR_RULES` decides which issues count as errors rather than warnings.
