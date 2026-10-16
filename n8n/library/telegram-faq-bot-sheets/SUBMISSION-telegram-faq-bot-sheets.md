# Answer Telegram FAQ messages from a Google Sheets knowledge table

**Who's it for**
Small businesses that get the same ten questions on Telegram every day and want a bot that answers those from a sheet anyone on the team can edit, and passes the rest to a human.

**How it works**
1. Telegram posts each message to the webhook. A manual run uses 8 sample messages and 6 sample FAQ rows.
2. The FAQ tab is read fresh on every message, so an edited answer is live on the next question.
3. Each row scores on keyword phrases found in the message (60%) and shared words with its question (40%). The best row answers if it reaches 0.45 and beats the runner-up.
4. Below the line, or on /human, the user gets a handoff message and your admin chat gets the question with a link back to the user.
5. A chat sending more than 3 messages a minute gets one "slow down" reply, then silence until the minute passes.

**How to set up**
1. Run it once as imported. It answers the sample messages and stops at `STOP: preview - no replies sent`.
2. Create a sheet with an FAQ tab (question, keywords, answer, enabled) and put its id in `FAQ_SHEET_ID`.
3. Add your bot token as a Telegram credential on both Telegram nodes, activate the workflow and point the bot at the webhook with setWebhook.
4. Put your own chat id in `TEST_CHAT_ID` so the bot answers only you, and `ADMIN_CHAT_ID` for handoffs. Set `DRY_RUN = false` to answer everyone.

**Requirements**
- A Telegram bot token from BotFather
- A Google Sheet with an FAQ tab

**How to customize**
- `CONFIDENCE_MIN` and `MARGIN` decide when the bot answers instead of handing off.
- `RATE_LIMIT` and `RATE_WINDOW_SECONDS` set the flood limit.
- `WELCOME_TEXT` and `HANDOFF_TEXT` are the fixed replies.
