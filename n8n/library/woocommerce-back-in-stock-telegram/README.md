# Notify Telegram subscribers when WooCommerce products are back in stock

Reads a Google Sheets waitlist of Telegram chat ids and WooCommerce product ids, checks those products' stock, messages waiting subscribers in join order (capped at a few people per unit in stock), and marks each row notified so nobody hears twice.

Import `woocommerce-back-in-stock-telegram-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

WooCommerce shops that sell limited runs and collect "tell me when it's back" requests through a Telegram bot. It turns that list into messages the moment stock returns, without a waitlist plugin.

## How it works

1. Every 30 minutes it reads the Waitlist tab (chat id, product id, joined date, status), or 10 sample rows until the sheet is set.
2. It fetches only the waitlisted products from WooCommerce, or sample stock until WooCommerce is connected.
3. For a product back in stock it notifies waiting subscribers in the order they joined, up to 2 people per unit in stock, so 3 units do not wake up 40 people. Products without stock tracking notify everyone.
4. Each subscriber gets one message listing every product they waited for that is now available, with a link.
5. After a live send each row is marked notified; the rest keep waiting for the next restock.

## Sections on the canvas

1. **Start and settings.** Checks every 30 minutes, which is soon enough for a restock and well inside WooCommerce rate limits. The per-unit cap and message text live in `config`.
2. **Read the waitlist.** The sheet is the waitlist your bot appends to. Rows already marked notified are dropped here, so `Collect waiting product ids` only asks WooCommerce about products someone still waits for.
3. **Check stock.** One request for up to 100 products by id, read-only. `Load sample stock` covers in stock, out of stock, untracked and backorder until `USE_WOOCOMMERCE` is true.
4. **Match, send and mark.** Join order decides who hears first when stock is short. With `DRY_RUN` on, messages only go to `TEST_CHAT_ID`; rows are marked notified only after a live send, so a test never uses up someone's place.

## Setup

1. Run it once as imported. It plans the messages and stops at `STOP: preview - nothing sent`.
2. Create a sheet with a Waitlist tab (key, chat_id, product_id, joined_at, status, notified_at) and put its id in `WAITLIST_SHEET_ID`. key is chat_id:product_id.
3. Add a WooCommerce credential to `Fetch waitlisted products`, set `STORE_URL` and `USE_WOOCOMMERCE = true`, and add your bot token to `Send the Telegram message`.
4. Put your own chat id in `TEST_CHAT_ID` to receive every message yourself first, then set `DRY_RUN = false` to message subscribers.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_WOOCOMMERCE` | `false` | set true after adding the WooCommerce credential to the fetch node |
| `STORE_URL` | `'https://shop.yourstore.example'` | your store address, no trailing slash |
| `WAITLIST_SHEET_ID` | `''` | Google Sheets id with a Waitlist tab; blank uses sample rows |
| `NOTIFY_PER_UNIT` | `2` | subscribers told per unit in stock, in join order |
| `MIN_STOCK` | `1` | tracked products need at least this many units before anyone is told |
| `MESSAGE_INTRO` | `'Good news: something you asked about ...'` | first line of every message |
| `TEST_CHAT_ID` | `''` | your own Telegram chat id; while DRY_RUN is true, set this to receive the messages yourself |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Read the waitlist`
- `Fetch waitlisted products`
- `Send the Telegram message`
- `Update the waitlist rows`

## Requirements

- A WooCommerce store with REST API keys
- A Telegram bot that collects chat ids
- A Google Sheet

## Customising

- `NOTIFY_PER_UNIT` sets how many subscribers are told per unit in stock.
- `MIN_STOCK` holds notifications until at least that many units are in.
- `MESSAGE_INTRO` changes the first line of the message.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 13 | none | `STOP: preview - nothing sent` |
| test send to TEST_CHAT_ID | 15 | `Send the Telegram message` | `STOP: test send - waitlist untouched` |
| live with the sheet and WooCommerce | 17 | `Send the Telegram message`, `Update the waitlist rows` | `Update the waitlist rows` |
