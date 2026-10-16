# Escalate monday.com items stuck in a status for too long

Checks a monday.com board each weekday morning, counts business days each item has sat in its current status against a per-status limit, posts one update on each stuck item and a Slack list for the team lead, once per item and status.

Import `monday-stuck-item-escalation-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Operations and delivery leads who run client work on a monday.com board and find out a week late that an item sat in "Waiting for review". It flags only the items over their limit, once.

## How it works

1. Every weekday at 09:30 it reads the items on one board through the monday.com GraphQL API, or 6 sample items until monday.com is connected.
2. For each item it reads the status label and the time that status last changed, then counts business days since.
3. Each status has its own limit in `STATUS_MAX_DAYS` (2 days for review, 5 for work in progress). Statuses not listed, like Done, are ignored.
4. An item over its limit gets one escalation per status change. The key is remembered in workflow static data, so it is not posted again tomorrow.
5. A live run posts an update on the item itself and the run posts one Slack message listing every stuck item with its owner.

## Sections on the canvas

1. **Start and settings.** Runs every weekday at 09:30 or by hand. The per-status limits, column ids and the weekend rule all live in `config`, so a board with different labels only needs that node edited.
2. **Read the board.** One GraphQL query returns every item with its status label and the time that label last changed. `Load sample board items` returns the same shape, with change times set in business days so the result holds any day.
3. **Find stuck items and tell Slack.** The escalation key includes the status change time, so a moved item resets and a stalled one is flagged once. `Post to Slack?` also needs at least one stuck item, so a quiet board stays quiet.
4. **Comment on the items.** Only a live run writes to monday.com. `Remember escalated items` stores a key only after the update call returns an id, so a failed post is retried next run instead of silently skipped.

## Setup

1. Run it once as imported. It checks sample items and stops at `STOP: preview - nothing sent` and `STOP: test - monday.com untouched`.
2. Add a monday.com credential to `Query board items on monday.com` and `Post update on the monday.com item`, fill in `BOARD_ID` and set `USE_MONDAY = true`.
3. Match `STATUS_COLUMN_ID` and `OWNER_COLUMN_ID` to your board columns, and set `SLACK_CHANNEL_ID`.
4. Put your address in `TEST_EMAIL` to post the Slack list only, then set `TEST_RUN = false` to also comment on the items.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_MONDAY` | `false` | set true after adding the monday.com credential to both monday.com nodes |
| `BOARD_ID` | `''` | board id, the number in the board URL |
| `STATUS_COLUMN_ID` | `'status'` | column id of the status column to watch |
| `OWNER_COLUMN_ID` | `'person'` | column id of the people column shown as owner |
| `STATUS_MAX_DAYS` | `{"Working on it":5,"Waiting for review":` | status label -> business days allowed before escalating |
| `COUNT_WEEKENDS` | `false` | false counts business days only |
| `MAX_ESCALATIONS` | `10` | hard ceiling on item updates per run, oldest first |
| `SLACK_CHANNEL_ID` | `''` | channel for the stuck-items list; blank skips Slack |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Query board items on monday.com`
- `Post stuck items to Slack`
- `Post update on the monday.com item`

## Requirements

- A monday.com account with API access
- Optional: a Slack workspace

## Customising

- `STATUS_MAX_DAYS` sets the limit for each status label on your board.
- Set `COUNT_WEEKENDS = true` for boards that move seven days a week.
- `MAX_ESCALATIONS` caps updates per run so a board-wide stall does not spam everyone.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 12 | none | `STOP: test - monday.com untouched`, `STOP: preview - nothing sent` |
| test mode posts Slack only | 12 | `Post stuck items to Slack` | `STOP: test - monday.com untouched`, `Post stuck items to Slack` |
| live with monday.com and Slack | 13 | `Post update on the monday.com item`, `Post stuck items to Slack` | `Post stuck items to Slack`, `Remember escalated items` |
