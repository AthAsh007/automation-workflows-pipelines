# Post daily specials from Google Sheets to a Telegram channel

**Who's it for**
Cafes, restaurants and food trucks that keep their specials in a spreadsheet and post them to a Telegram channel for regulars. The kitchen edits the sheet; the post goes out on time, and regulars hear when the hake runs out without anyone opening the app.

**How it works**
1. The workflow wakes every hour. At `POST_HOUR` in your `TIMEZONE` it posts the menu; if that run was missed, the first run before `UPDATE_UNTIL_HOUR` posts it late, once. Days in `CLOSED_WEEKDAYS` and `CLOSED_DATES` are skipped.
2. It reads the Specials tab, or 9 sample rows until a sheet is set. A row counts today when its Date is today, or its Day is today's weekday or Daily. A dated row replaces a weekday row with the same dish. Sold-out dishes are dropped, prices are formatted in `CURRENCY` and allergens become tags such as [V] or [N].
3. After the post, each hourly run up to `UPDATE_UNTIL_HOUR` compares the sheet with what was posted, kept in workflow static data. A posted dish now marked sold out or removed, or a dish added since, produces one short update. No change means no message.
4. If the sheet has nothing for today at posting time, the staff chat in `STAFF_CHAT_ID` is told once, so the channel never gets an empty menu and the kitchen knows why.

**How to set up**
1. Run it once as imported. It builds today's post from sample rows and stops at `STOP: preview - nothing sent`.
2. Create a Specials tab with Day, Date, Section, Dish, Description, Price, Allergens and Sold out columns, connect Google Sheets and set `SPECIALS_SHEET_ID`.
3. Add a Telegram bot as admin of your channel, connect it and set `TELEGRAM_CHAT_ID` (and `STAFF_CHAT_ID` for the empty-sheet nudge).
4. For a test, set `TEST_EMAIL` to any address and `TEST_TELEGRAM_CHAT_ID` to a private chat. Test sends are not remembered. Set `TEST_RUN = false` to post to the channel.

**Requirements**
- A Google Sheet with a Specials tab
- A Telegram bot added to your channel

**How to customize**
- `ALLERGEN_TAGS` maps allergen words in the sheet to the tag shown in the post; `SECTION_ORDER` sets the section order.
- `UPDATE_UNTIL_HOUR` ends sold-out updates for the day; set it equal to `POST_HOUR` to turn them off.
- Add holiday closures to `CLOSED_DATES` as YYYY-MM-DD.
