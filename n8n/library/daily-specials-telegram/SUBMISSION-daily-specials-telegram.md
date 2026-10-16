# Post daily specials from Google Sheets to a Telegram channel

**Who's it for**
Cafes, restaurants and food trucks that keep their specials in a spreadsheet and post them to a Telegram channel for regulars. The kitchen edits the sheet; the post goes out on time without anyone opening the app.

**How it works**
1. The workflow wakes every hour and posts only at `POST_HOUR` in your `TIMEZONE`. Days in `CLOSED_WEEKDAYS` and dates in `CLOSED_DATES` are skipped. A manual run always previews.
2. It reads the Specials tab, or 9 sample rows until a sheet is set. A row counts today when its Date is today, or its Day is today's weekday or Daily. A dated row replaces a weekday row with the same dish.
3. Dishes marked sold out are dropped. Prices like "12.5" or "£12.50" are formatted in `CURRENCY`, and allergens become short tags such as [V] or [N] with a legend line.
4. Dishes are grouped by section in menu order and posted as one message. If nothing is left, nothing is posted.

**How to set up**
1. Run it once as imported. It builds today's post from sample rows and stops at `STOP: preview - nothing sent`.
2. Create a Specials tab with Day, Date, Section, Dish, Description, Price, Allergens and Sold out columns, connect Google Sheets and set `SPECIALS_SHEET_ID`.
3. Add a Telegram bot as admin of your channel, connect it and set `TELEGRAM_CHAT_ID`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_TELEGRAM_CHAT_ID` to a private chat. Set `TEST_RUN = false` to post to the channel.

**Requirements**
- A Google Sheet with a Specials tab
- A Telegram bot added to your channel

**How to customize**
- `ALLERGEN_TAGS` maps allergen words in the sheet to the tag shown in the post.
- `SECTION_ORDER` sets the order sections appear in.
- Add holiday closures to `CLOSED_DATES` as YYYY-MM-DD.
