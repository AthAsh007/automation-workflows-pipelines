# Archive old Done cards on Trello with a dry-run report

**Who's it for**
Teams whose Trello boards have a Done column with hundreds of cards that nobody scrolls past. It archives the old ones on a schedule, so the board stays fast and the history stays searchable.

**How it works**
1. Every Sunday at 20:00 it reads the lists and open cards on one board, or a sample board until Trello is connected.
2. Lists whose name matches `DONE_LIST_PATTERNS` (Done, Shipped, Released by default) are the only ones considered.
3. A card qualifies when its last activity is older than `ARCHIVE_AFTER_DAYS`. Cards with a label in `KEEP_LABELS` and cards whose due date has not passed are kept with a reason.
4. The oldest cards are archived first, up to `MAX_ARCHIVE_PER_RUN`. Archiving sets closed=true, so every card can be restored from the board menu.
5. A report lists every archived and kept card per list, and is posted to Slack on a live run.

**How to set up**
1. Run it once as imported. It reports on a sample board and stops at `STOP: dry run - nothing archived`.
2. Add a Trello credential to `Fetch lists and cards from Trello` and `Archive the card on Trello`, fill in `BOARD_ID` and set `USE_TRELLO = true`.
3. Read the report in `Write the archive report` for your real board and adjust the patterns and labels.
4. Set `DRY_RUN = false` to archive. Optionally set `SLACK_CHANNEL_ID` to get the report in Slack.

**Requirements**
- A Trello account and board
- Optional: a Slack workspace

**How to customize**
- `ARCHIVE_AFTER_DAYS` decides how long a finished card stays visible.
- `KEEP_LABELS` protects reference cards, such as release notes, from ever being archived.
- `MAX_ARCHIVE_PER_RUN` keeps the first live run on a big board to a reviewable size.
