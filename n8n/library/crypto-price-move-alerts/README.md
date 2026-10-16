# Alert Telegram on large crypto price moves from CoinGecko

Every 15 minutes reads prices and 24-hour change for a watchlist from the free CoinGecko API, compares each coin with its own move threshold, applies a per-coin cooldown that a bigger move can break, and sends one Telegram message with direction arrows.

Import `crypto-price-move-alerts-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Traders, treasury leads at crypto-paid businesses and hobby investors who want a ping when a coin they hold moves sharply, without watching charts or paying for an alert service.

## How it works

1. Every 15 minutes it calls CoinGecko simple/price for the coins in `COINS`, with the 24-hour change. No API key is needed. Until `USE_COINGECKO` is true, a sample response is used.
2. Each coin has its own threshold, because 5% is a big day for Bitcoin and a quiet one for a small coin.
3. A coin past its threshold is alerted once, then held for `COOLDOWN_HOURS`. If the move grows by another `ESCALATE_PCT` points during the cooldown (from -6% to -10%, say), it alerts again.
4. All alerts in one run go out as one Telegram message, biggest move first, with an up or down arrow, the price and the 24-hour change.

## Sections on the canvas

1. **Start and settings.** Runs every 15 minutes, well inside the public CoinGecko rate limit. The watchlist, each coin's threshold and the cooldown rules live in `config`.
2. **Read prices.** One simple/price call returns every coin with its 24-hour change, so the run costs a single request. `Load sample prices` returns the same shape with one coin missing, as a misspelled id would.
3. **Check moves and cooldowns.** Thresholds are per coin, and the cooldown only gives way when the move grows by `ESCALATE_PCT` in the same direction. That stops a coin hovering at its limit from alerting every 15 minutes.
4. **Send and start cooldowns.** Nothing is sent while `TEST_RUN` is true and `TEST_EMAIL` is blank. Cooldowns start only after a live send, so a test alert never silences the real one.

## Setup

1. Run it once as imported. It checks a sample response and stops at `STOP: preview - nothing sent`.
2. Edit `COINS` with CoinGecko coin ids (the id in the coin page URL) and a threshold for each, then set `USE_COINGECKO = true`.
3. Create a Telegram bot, add it to your chat, connect it and set `TELEGRAM_CHAT_ID`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_TELEGRAM_CHAT_ID` to a private chat. Set `TEST_RUN = false` to alert the real chat.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_COINGECKO` | `false` | set true to read real prices (free public endpoint) |
| `COINS` | `{"bitcoin":{"symbol":"BTC","threshold_pc` | CoinGecko id -> symbol and the 24h move in percent that triggers an alert |
| `VS_CURRENCY` | `'usd'` | quote currency |
| `COOLDOWN_HOURS` | `6` | a coin is not alerted again for this long... |
| `ESCALATE_PCT` | `4` | ...unless its move grew by this many more points |
| `TELEGRAM_CHAT_ID` | `''` | chat or channel id for alerts |
| `TEST_TELEGRAM_CHAT_ID` | `''` | test mode sends here instead |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Send the alert on Telegram`

## Requirements

- A Telegram bot and chat
- No CoinGecko key for the public endpoint

## Customising

- `COINS` sets the watchlist and each threshold in percent.
- `COOLDOWN_HOURS` and `ESCALATE_PCT` decide how often one coin can alert.
- `VS_CURRENCY` changes the quote currency, for example eur.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 9 | none | `STOP: preview - nothing sent` |
| live prices and Telegram | 11 | `Send the alert on Telegram` | `Remember alerted coins` |
