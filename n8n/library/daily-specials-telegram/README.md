# Post daily specials from Google Sheets to a Telegram channel

Posts today's specials from a Google Sheet to a Telegram channel at a set hour (or late, once, if that run was missed), with dated overrides, prices and allergen tags, then keeps checking the sheet during service and posts a short update when a posted dish sells out or a new one is added. An empty sheet nudges the staff chat instead of posting nothing.

Import `daily-specials-telegram-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Cafes, restaurants and food trucks that keep their specials in a spreadsheet and post them to a Telegram channel for regulars. The kitchen edits the sheet; the post goes out on time, and regulars hear when the hake runs out without anyone opening the app.

## How it works

1. The workflow wakes every hour. At `POST_HOUR` in your `TIMEZONE` it posts the menu; if that run was missed, the first run before `UPDATE_UNTIL_HOUR` posts it late, once. Days in `CLOSED_WEEKDAYS` and `CLOSED_DATES` are skipped.
2. It reads the Specials tab, or 9 sample rows until a sheet is set. A row counts today when its Date is today, or its Day is today's weekday or Daily. A dated row replaces a weekday row with the same dish. Sold-out dishes are dropped, prices are formatted in `CURRENCY` and allergens become tags such as [V] or [N].
3. After the post, each hourly run up to `UPDATE_UNTIL_HOUR` compares the sheet with what was posted, kept in workflow static data. A posted dish now marked sold out or removed, or a dish added since, produces one short update. No change means no message.
4. If the sheet has nothing for today at posting time, the staff chat in `STAFF_CHAT_ID` is told once, so the channel never gets an empty menu and the kitchen knows why.

## Sections on the canvas

1. **Start and settings.** An hourly schedule lets `POST_HOUR` and `UPDATE_UNTIL_HOUR` live in `config` instead of in a cron string. Menu order, allergen tags, currency, closures and the staff chat are set there too.
2. **Decide post, update or skip.** `Check day and hour` works in `TIMEZONE` and reads what was posted today. It picks a full post at `POST_HOUR`, a late post if that run was missed, an update after it, or the STOP outside those hours and on closed days.
3. **Read the specials.** The kitchen owns the sheet; nothing here writes to it. `Load sample specials` keys its rows to today, so the dated override, sold-out and Daily rules all show in a preview.
4. **Build the post or update.** A dated row replaces the weekday row for the same dish. An update lists only posted dishes that sold out or vanished and dishes added since, each announced once. An empty sheet nudges `STAFF_CHAT_ID` once rather than posting a bare header.
5. **Post and remember.** Nothing is sent while `TEST_RUN` is true and `TEST_EMAIL` is blank. The dish list is stored only after a live post, so a test run never stops the real post or swallows a sold-out update.

## Setup

1. Run it once as imported. It builds today's post from sample rows and stops at `STOP: preview - nothing sent`.
2. Create a Specials tab with Day, Date, Section, Dish, Description, Price, Allergens and Sold out columns, connect Google Sheets and set `SPECIALS_SHEET_ID`.
3. Add a Telegram bot as admin of your channel, connect it and set `TELEGRAM_CHAT_ID` (and `STAFF_CHAT_ID` for the empty-sheet nudge).
4. For a test, set `TEST_EMAIL` to any address and `TEST_TELEGRAM_CHAT_ID` to a private chat. Test sends are not remembered. Set `TEST_RUN = false` to post to the channel.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `SPECIALS_SHEET_ID` | `''` | Google Sheets id holding the Specials tab; blank uses sample rows |
| `TELEGRAM_CHAT_ID` | `'@harbourcafe_specials'` | channel username or numeric chat id |
| `STAFF_CHAT_ID` | `''` | staff chat told once when the sheet has no specials for today; blank = no nudge |
| `TIMEZONE` | `'Europe/London'` | IANA timezone for the posting hour and today |
| `POST_HOUR` | `11` | hour (24h) when the scheduled run posts |
| `UPDATE_UNTIL_HOUR` | `15` | last hour that posts sold-out updates (and a late post if POST_HOUR was missed) |
| `CLOSED_WEEKDAYS` | `["Monday"]` | weekdays with no post |
| `CLOSED_DATES` | `["2026-12-25","2026-12-26","2027-01-01"]` | dates with no post (YYYY-MM-DD) |
| `CURRENCY` | `'GBP'` | currency code for prices |
| `SECTION_ORDER` | `["Starter","Main","Dessert","Drink"]` | sections in this order; anything else goes last |
| `ALLERGEN_TAGS` | `{"vegetarian":"V","vegan":"VG","gluten f` | allergen word in the sheet -> tag in the post |
| `HEADER` | `'Today at Harbour Cafe'` | first line of the post |
| `TEST_TELEGRAM_CHAT_ID` | `''` | test mode posts here instead of the channel |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read the Specials tab`
- `Post the specials to Telegram`

## Requirements

- A Google Sheet with a Specials tab
- A Telegram bot added to your channel

## Customising

- `ALLERGEN_TAGS` maps allergen words in the sheet to the tag shown in the post; `SECTION_ORDER` sets the section order.
- `UPDATE_UNTIL_HOUR` ends sold-out updates for the day; set it equal to `POST_HOUR` to turn them off.
- Add holiday closures to `CLOSED_DATES` as YYYY-MM-DD.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 11 | none | `STOP: preview - nothing sent` |
| scheduled run on a closed day | 5 | none | `STOP: closed or not the posting hour` |
| live post to the channel, then remembered | 13 | `Post the specials to Telegram` | `Remember what was posted` |
| hourly update after a dish sells out | 13 | `Post the specials to Telegram` | `Remember what was posted` |
| empty sheet at posting time nudges the staff | 13 | `Post the specials to Telegram` | `Remember what was posted` |
