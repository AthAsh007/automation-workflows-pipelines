# Alert Telegram when PayPal disputes open, with the response deadline

Polls PayPal every 30 minutes for disputes that need a seller response, labels each by time left to respond, and sends one Telegram message per run listing new disputes plus any that just crossed into the last 24 hours.

Import `paypal-dispute-alerts-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Online sellers and small ecommerce teams who take payments through PayPal and have lost a dispute by missing the response window. The alert arrives on your phone with the deadline in the first line.

## How it works

1. Every 30 minutes it lists open PayPal disputes, or a sample set until PayPal is connected.
2. Disputes waiting on the buyer, and resolved ones, are skipped. The rest get a label from the seller response deadline: OVERDUE, DUE TODAY (under 24 hours), URGENT (under 72 hours), this week, or later.
3. A dispute is alerted once when first seen, and once more when it enters its last 24 hours. Ids are kept in workflow static data.
4. One Telegram message lists them in deadline order with amount, reason and stage, plus the total amount in dispute.

## Sections on the canvas

1. **Start and settings.** Polls every 30 minutes because the shortest PayPal windows are counted in hours. Label boundaries and the sandbox switch live in `config`.
2. **Read open disputes.** Only disputes in the REQUIRED_ACTION state are listed. `Load sample disputes` returns the same fields until `USE_PAYPAL` is true, with deadlines set relative to now.
3. **Label and decide what is new.** `Label by deadline` skips disputes waiting on the buyer and anything already alerted, but lets a dispute through a second time when it enters its last day. An empty run ends at `STOP: no new disputes`.
4. **Send and remember.** A test send goes only to `TEST_TELEGRAM_CHAT_ID`, stops at a STOP if that is blank, and stores nothing, so the real alert still fires later. Only `Live run?` writes the dispute ids to static data.

## Setup

1. Run it once as imported. It labels sample disputes and stops at `STOP: preview - nothing sent`.
2. Add a PayPal credential to `List open PayPal disputes`, set `PAYPAL_ENV`, then set `USE_PAYPAL = true`.
3. Connect Telegram and put your chat id in `TELEGRAM_CHAT_ID`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_TELEGRAM_CHAT_ID` to a private chat, where the test message lands. Set `TEST_RUN = false` to send to `TELEGRAM_CHAT_ID` and remember alerted disputes.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_PAYPAL` | `false` | set true after adding the PayPal credential |
| `PAYPAL_ENV` | `'live'` | 'live' or 'sandbox' |
| `TODAY_HOURS` | `24` | under this many hours left -> DUE TODAY, and a second alert |
| `URGENT_HOURS` | `72` | under this many hours left -> URGENT |
| `MIN_AMOUNT` | `0` | disputes below this amount are not alerted |
| `TELEGRAM_CHAT_ID` | `''` | chat or group id for alerts; blank sends nothing |
| `TEST_TELEGRAM_CHAT_ID` | `''` | test mode posts here instead of the real chat; blank means test mode posts nothing |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `List open PayPal disputes`
- `Send the alert to Telegram`

## Requirements

- A PayPal business account with REST API credentials
- A Telegram bot and a chat id

## Customising

- `URGENT_HOURS` and `TODAY_HOURS` move the label boundaries.
- `MIN_AMOUNT` keeps small disputes out of the alert.
- `PAYPAL_ENV` switches between sandbox and live API hosts.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 10 | none | `STOP: preview - nothing sent` |
| test mode with no test chat | 11 | none | `STOP: test - TEST_TELEGRAM_CHAT_ID blank` |
| test mode into the test chat | 13 | `Send the alert to Telegram` | `STOP: test send - disputes not remembered` |
| live with PayPal and Telegram | 14 | `Send the alert to Telegram` | `Remember alerted disputes` |
