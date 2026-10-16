# Win back gym members with no recent check-ins via Gmail

**Who's it for**
Independent gyms, studios and climbing walls that track members in a spreadsheet and notice lapsed members only when they cancel. It catches people at two weeks away, while a friendly nudge still works.

**How it works**
1. Every Tuesday at 10:00 it reads the Members tab, or 10 sample members until a sheet is set.
2. Days inactive = days since the last check-in, or since joining for someone who never came. Members inactive 14, 30 or 60 days land on that tier, each with its own offer and tone.
3. Frozen and cancelled memberships, opted-out members, members who joined in the last 14 days and anyone contacted in the last 30 days are held back with a reason.
4. The 14-day tier goes first because those members come back most often, then `WEEKLY_CAP` applies. Each email is sent through Gmail and the contact date and offer are written to the member row.

**How to set up**
1. Run it once as imported. It previews against sample members and stops at `STOP: preview - nothing sent`.
2. Make sure your Members tab has Member ID, Name, Email, Status, Joined, Last check-in, Last contacted and Opt out columns, connect Google Sheets and set `MEMBERS_SHEET_ID`.
3. Connect Gmail and edit the offers in `TIERS` and the sign-off in `GYM_NAME`.
4. Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.

**Requirements**
- A Google Sheet of members with a last check-in date
- A Gmail account

**How to customize**
- `TIERS` sets the day thresholds, offers and subject lines.
- `CONTACT_COOLDOWN_DAYS` stops the same member hearing from you more than once a month.
- `WEEKLY_CAP` limits emails per run so front desk can handle the replies.
