# Archive unengaged subscribers in Mailchimp after a dry-run review

**Who's it for**
Mailchimp account owners paying for contacts who have not opened an email in months. It gives you a reviewed list of who would be archived before a single contact is touched.

**How it works**
1. On the 1st of each month it counts the subscribed members of one audience, then reads them in pages of `PAGE_SIZE` (Mailchimp returns at most 1,000 per call), or uses 8 sample members until Mailchimp is connected.
2. A member is a candidate when they joined 90+ days ago, their profile has not changed in 180 days, and they have no opens and no clicks (or a 1-star rating with under 5% opens).
3. Members with a protected tag, the Mailchimp VIP flag or a protected email domain are held back with the reason.
4. If candidates exceed 30% of the audience the run archives nothing, because that usually means missing stats, and a live run posts that warning to Slack instead of ending quietly. Otherwise up to 200 are archived, oldest first, and the count goes to Slack.
5. If `MAX_PAGES` stopped the read before the end of the audience, the report says how many members were reviewed, so a large list is never silently half-checked.

**How to set up**
1. Run it once as imported. It reviews the sample members and stops at `STOP: dry run - nothing archived`.
2. Add a Mailchimp credential to the three Mailchimp nodes, then set `MAILCHIMP_DC`, `LIST_ID` and `USE_MAILCHIMP = true`.
3. Run it again and read the candidates and held-back reasons in `Pick members to archive`.
4. When the list looks right, set `DRY_RUN = false`. Archived contacts keep their history and can be re-added.

**Requirements**
- A Mailchimp audience
- Optional: a Slack workspace for the result

**How to customize**
- `MIN_TENURE_DAYS` and `STALE_DAYS` decide how long someone must be quiet before they qualify.
- `PROTECT_TAGS` and `PROTECT_DOMAINS` keep customers, partners and staff on the list whatever their stats.
- `MAX_ARCHIVE_PER_RUN` and `MAX_SHARE_PCT` limit how much one run can remove.
- `PAGE_SIZE` and `MAX_PAGES` bound how many members one run reads.
