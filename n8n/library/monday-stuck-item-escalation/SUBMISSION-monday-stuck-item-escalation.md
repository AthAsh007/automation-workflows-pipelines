# Escalate monday.com items stuck in a status for too long

**Who's it for**
Operations and delivery leads who run client work on a monday.com board and find out a week late that an item sat in "Waiting for review". It flags only the items over their limit, once.

**How it works**
1. Every weekday at 09:30 it reads the items on one board through the monday.com GraphQL API, or 6 sample items until monday.com is connected.
2. For each item it reads the status label and the time that status last changed, then counts business days since.
3. Each status has its own limit in `STATUS_MAX_DAYS` (2 days for review, 5 for work in progress). Statuses not listed, like Done, are ignored.
4. An item over its limit gets one escalation per status change. The key is remembered in workflow static data, so it is not posted again tomorrow.
5. A live run posts an update on the item itself and the run posts one Slack message listing every stuck item with its owner.

**How to set up**
1. Run it once as imported. It checks sample items and stops at `STOP: preview - nothing sent` and `STOP: test - monday.com untouched`.
2. Add a monday.com credential to `Query board items on monday.com` and `Post update on the monday.com item`, fill in `BOARD_ID` and set `USE_MONDAY = true`.
3. Match `STATUS_COLUMN_ID` and `OWNER_COLUMN_ID` to your board columns, and set `SLACK_CHANNEL_ID`.
4. Put your address in `TEST_EMAIL` to post the Slack list only, then set `TEST_RUN = false` to also comment on the items.

**Requirements**
- A monday.com account with API access
- Optional: a Slack workspace

**How to customize**
- `STATUS_MAX_DAYS` sets the limit for each status label on your board.
- Set `COUNT_WEEKENDS = true` for boards that move seven days a week.
- `MAX_ESCALATIONS` caps updates per run so a board-wide stall does not spam everyone.
