# Answer Telegram FAQ messages from a Google Sheets knowledge table

Receives Telegram bot updates on a webhook, scores each message against the questions and keyword phrases in a Google Sheets FAQ table, replies with the best answer above a confidence line, hands everything else to a person with an alert, and rate-limits chats that flood the bot.

Import `telegram-faq-bot-sheets-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Small businesses that get the same ten questions on Telegram every day and want a bot that answers those from a sheet anyone on the team can edit, and passes the rest to a human.

## How it works

1. Telegram posts each message to the webhook. A manual run uses 8 sample messages and 6 sample FAQ rows.
2. The FAQ tab is read fresh on every message, so an edited answer is live on the next question.
3. Each row scores on keyword phrases found in the message (60%) and shared words with its question (40%). The best row answers if it reaches 0.45 and beats the runner-up.
4. Below the line, or on /human, the user gets a handoff message and your admin chat gets the question with a link back to the user.
5. A chat sending more than 3 messages a minute gets one "slow down" reply, then silence until the minute passes.

## Sections on the canvas

1. **Start and settings.** Telegram posts each update to the webhook, which answers at once; the manual trigger replays sample messages. Thresholds, rate limits and fixed replies live in `config`.
2. **Read the message.** Only text messages go on; edits, stickers and joins stop here. `Collect the messages` turns them into one item so the FAQ sheet is read once, not once per message.
3. **Read the FAQ table.** The sheet is read on every run, so an answer edited by anyone on the team is live for the next question. Rows with enabled set to no are dropped before scoring.
4. **Match, reply and hand off.** The flood check runs before scoring so a spammer costs nothing. An answer needs both `CONFIDENCE_MIN` and a `MARGIN` over the runner-up; a near tie goes to a person rather than a coin flip.

## Setup

1. Run it once as imported. It answers the sample messages and stops at `STOP: preview - no replies sent`.
2. Create a sheet with an FAQ tab (question, keywords, answer, enabled) and put its id in `FAQ_SHEET_ID`.
3. Add your bot token as a Telegram credential on both Telegram nodes, activate the workflow and point the bot at the webhook with setWebhook.
4. Put your own chat id in `TEST_CHAT_ID` so the bot answers only you, and `ADMIN_CHAT_ID` for handoffs. Set `DRY_RUN = false` to answer everyone.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `FAQ_SHEET_ID` | `''` | Google Sheets id with an FAQ tab; blank uses sample rows |
| `CONFIDENCE_MIN` | `0.45` | best match must reach this score (0 to 1) to be sent |
| `MARGIN` | `0.1` | best match must beat the second by this much |
| `RATE_LIMIT` | `3` | messages per chat allowed inside the window |
| `RATE_WINDOW_SECONDS` | `60` | length of the rate-limit window |
| `WELCOME_TEXT` | `'Hi! Ask me about pricing, refunds, or...'` | reply to /start and /help |
| `HANDOFF_TEXT` | `'I am not sure about that one, so I ha...'` | reply when no answer is confident |
| `SLOW_DOWN_TEXT` | `'You are sending messages quickly. I w...'` | sent once when a chat hits the limit |
| `TEST_CHAT_ID` | `''` | your own chat id; while DRY_RUN is true the bot answers only this chat |
| `ADMIN_CHAT_ID` | `''` | chat that receives handoff alerts; blank skips them |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Read the FAQ rows`
- `Send the reply`
- `Alert the admin chat`

## Requirements

- A Telegram bot token from BotFather
- A Google Sheet with an FAQ tab

## Customising

- `CONFIDENCE_MIN` and `MARGIN` decide when the bot answers instead of handing off.
- `RATE_LIMIT` and `RATE_WINDOW_SECONDS` set the flood limit.
- `WELCOME_TEXT` and `HANDOFF_TEXT` are the fixed replies.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 18 | none | `STOP: preview - no replies sent`, `STOP: no admin chat` |
| live webhook answer and handoff alert | 18 | `Send the reply`, `Alert the admin chat` | `Send the reply`, `Alert the admin chat` |
| dry run answers only the test chat | 16 | `Send the reply` | `Send the reply`, `STOP: no handoffs` |
