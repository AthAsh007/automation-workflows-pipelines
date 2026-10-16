# Post daily specials from Google Sheets to a Telegram channel

Checks every hour whether it is posting time and the kitchen is open, picks today's specials from a Google Sheet by weekday or date, drops sold-out dishes, formats prices and allergen tags, and posts one menu message to a Telegram channel.

Import `daily-specials-telegram-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Cafes, restaurants and food trucks that keep their specials in a spreadsheet and post them to a Telegram channel for regulars. The kitchen edits the sheet; the post goes out on time without anyone opening the app.

## How it works

1. The workflow wakes every hour and posts only at `POST_HOUR` in your `TIMEZONE`. Days in `CLOSED_WEEKDAYS` and dates in `CLOSED_DATES` are skipped. A manual run always previews.
2. It reads the Specials tab, or 9 sample rows until a sheet is set. A row counts today when its Date is today, or its Day is today's weekday or Daily. A dated row replaces a weekday row with the same dish.
3. Dishes marked sold out are dropped. Prices like "12.5" or "£12.50" are formatted in `CURRENCY`, and allergens become short tags such as [V] or [N] with a legend line.
4. Dishes are grouped by section in menu order and posted as one message. If nothing is left, nothing is posted.

## Sections on the canvas

1. **Start and settings.** An hourly schedule lets `POST_HOUR` live in `config` instead of in a cron string. Menu order, allergen tags, currency and closures are set there too.
2. **Check the day.** `Check day and hour` works in `TIMEZONE`, so a server in another region still posts at 11:00 local. Twenty-three of the 24 hourly runs, and every closed day, end at the STOP before the sheet is read.
3. **Read the specials.** The kitchen owns the sheet; nothing here writes to it. `Load sample specials` keys its rows to today, so the dated override, sold-out and Daily rules all show in a preview.
4. **Build and post.** A dated row replaces the weekday row for the same dish, so the chef can change one dish for one day. An empty menu ends at `STOP: nothing to post` instead of sending a header with no dishes.

## Setup

1. Run it once as imported. It builds today's post from sample rows and stops at `STOP: preview - nothing sent`.
2. Create a Specials tab with Day, Date, Section, Dish, Description, Price, Allergens and Sold out columns, connect Google Sheets and set `SPECIALS_SHEET_ID`.
3. Add a Telegram bot as admin of your channel, connect it and set `TELEGRAM_CHAT_ID`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_TELEGRAM_CHAT_ID` to a private chat. Set `TEST_RUN = false` to post to the channel.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `SPECIALS_SHEET_ID` | `''` | Google Sheets id holding the Specials tab; blank uses sample rows |
| `TELEGRAM_CHAT_ID` | `'@harbourcafe_specials'` | channel username or numeric chat id |
| `TIMEZONE` | `'Europe/London'` | IANA timezone for the posting hour and today |
| `POST_HOUR` | `11` | hour (24h) when the scheduled run posts |
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

- `ALLERGEN_TAGS` maps allergen words in the sheet to the tag shown in the post.
- `SECTION_ORDER` sets the order sections appear in.
- Add holiday closures to `CLOSED_DATES` as YYYY-MM-DD.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 11 | none | `STOP: preview - nothing sent` |
| scheduled run on a closed day | 5 | none | `STOP: closed or not the posting hour` |
| live post to the channel | 11 | `Post the specials to Telegram` | `Post the specials to Telegram` |
