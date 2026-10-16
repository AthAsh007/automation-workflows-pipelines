# Archive old Done cards on Trello with a dry-run report

Every Sunday evening finds cards in Trello Done lists with no activity for 30 days, keeps anything labelled keep, archives the oldest up to a per-run cap and reports exactly what moved, with a dry run as the default.

Import `trello-done-card-archiver-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Teams whose Trello boards have a Done column with hundreds of cards that nobody scrolls past. It archives the old ones on a schedule, so the board stays fast and the history stays searchable.

## How it works

1. Every Sunday at 20:00 it reads the lists and open cards on one board, or a sample board until Trello is connected.
2. Lists whose name matches `DONE_LIST_PATTERNS` (Done, Shipped, Released by default) are the only ones considered.
3. A card qualifies when its last activity is older than `ARCHIVE_AFTER_DAYS`. Cards with a label in `KEEP_LABELS` and cards whose due date has not passed are kept with a reason.
4. The oldest cards are archived first, up to `MAX_ARCHIVE_PER_RUN`. Archiving sets closed=true, so every card can be restored from the board menu.
5. A report lists every archived and kept card per list, and is posted to Slack on a live run.

## Sections on the canvas

1. **Start and settings.** Runs every Sunday at 20:00, when nobody is moving cards, or by hand. Board id, list patterns, the age limit and protected labels all live in `config`.
2. **Read the board.** One call returns every open list with its open cards and their last activity date, so no per-list request is needed. `Load sample Trello board` returns the same shape until `USE_TRELLO` is true.
3. **Choose cards and report.** Only lists matching `DONE_LIST_PATTERNS` are touched, so an old Backlog card is never archived by accident. Every kept card carries a reason, and the report goes to Slack only after a live run.
4. **Archive on Trello.** `Archive for real?` opens only when `DRY_RUN` is false. Archiving sets closed=true rather than deleting, so a mistake is undone from the board menu in two clicks.

## Setup

1. Run it once as imported. It reports on a sample board and stops at `STOP: dry run - nothing archived`.
2. Add a Trello credential to `Fetch lists and cards from Trello` and `Archive the card on Trello`, fill in `BOARD_ID` and set `USE_TRELLO = true`.
3. Read the report in `Write the archive report` for your real board and adjust the patterns and labels.
4. Set `DRY_RUN = false` to archive. Optionally set `SLACK_CHANNEL_ID` to get the report in Slack.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_TRELLO` | `false` | set true after adding the Trello credential to both Trello nodes |
| `BOARD_ID` | `''` | board id or short link, the code after trello.com/b/ in the board URL |
| `DONE_LIST_PATTERNS` | `["done","shipped","released"]` | a list is a Done list when its name contains one of these (case ignored) |
| `ARCHIVE_AFTER_DAYS` | `30` | days since the last activity on a card before it is archived |
| `KEEP_LABELS` | `["keep","pinned","reference"]` | cards with one of these label names are never archived |
| `MAX_ARCHIVE_PER_RUN` | `50` | hard ceiling on cards archived per run, oldest first |
| `SLACK_CHANNEL_ID` | `''` | channel for the report on live runs; blank skips Slack |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Fetch lists and cards from Trello`
- `Archive the card on Trello`
- `Post the report to Slack`

## Requirements

- A Trello account and board
- Optional: a Slack workspace

## Customising

- `ARCHIVE_AFTER_DAYS` decides how long a finished card stays visible.
- `KEEP_LABELS` protects reference cards, such as release notes, from ever being archived.
- `MAX_ARCHIVE_PER_RUN` keeps the first live run on a big board to a reviewable size.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 12 | none | `STOP: dry run - nothing archived`, `STOP: report not posted` |
| live archive with Slack report | 12 | `Archive the card on Trello`, `Post the report to Slack` | `Archive the card on Trello`, `Post the report to Slack` |
