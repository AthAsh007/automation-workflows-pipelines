# Post birthdays and work anniversaries from Google Sheets to Slack

**Who's it for**
Office managers and people teams at companies of 15 to 500 who keep a staff list in Google Sheets and keep missing birthdays that fall on a weekend. One message a day, nobody forgotten, nobody posted against their wishes.

**How it works**
1. Every weekday at 09:00 it reads the People tab, or sample staff until a sheet id is set.
2. Birthdays and start-date anniversaries matching today are collected. On Friday, Saturday and Sunday dates are included too, and 29 February counts on 28 February in non-leap years.
3. People with `birthday`, `anniversary` or `all` in the opt_out column are left out, as are inactive rows and anniversaries under one year.
4. Anniversaries in `MILESTONE_YEARS` get their own line. Everything goes out as one Slack message, at most once per day.

**How to set up**
1. Run it once as imported. It builds the message for sample staff and stops at `STOP: dry run - nothing posted`.
2. Create a People tab with name, slack_user_id, birthday (MM-DD or YYYY-MM-DD), start_date, opt_out and active columns. Connect Google Sheets and set `PEOPLE_SHEET_ID`.
3. Connect Slack and set `SLACK_CHANNEL_ID`.
4. Check the text in `Write the message`, then set `DRY_RUN = false`.

**Requirements**
- A Google Sheet listing staff
- A Slack workspace

**How to customize**
- `MILESTONE_YEARS` picks the anniversaries that get a bigger shout-out.
- `LEAP_DAY_RULE` moves 29 February birthdays to `feb28` or `mar1` in non-leap years.
- `WEEKEND_ON_FRIDAY = false` posts weekend dates on Monday instead.
