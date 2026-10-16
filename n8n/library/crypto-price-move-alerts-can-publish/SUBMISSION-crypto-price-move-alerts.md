# Alert Telegram on large crypto price moves from CoinGecko

**Who's it for**
Traders, treasury leads at crypto-paid businesses and hobby investors who want a ping when a coin they hold moves sharply, without watching charts or paying for an alert service.

**How it works**
1. Every 15 minutes it calls CoinGecko simple/price for the coins in `COINS`, with the 24-hour change. No API key is needed. Until `USE_COINGECKO` is true, a sample response is used.
2. Each coin has its own threshold, because 5% is a big day for Bitcoin and a quiet one for a small coin.
3. A coin past its threshold is alerted once, then held for `COOLDOWN_HOURS`. If the move grows by another `ESCALATE_PCT` points during the cooldown (from -6% to -10%, say), it alerts again.
4. All alerts in one run go out as one Telegram message, biggest move first, with an up or down arrow, the price and the 24-hour change.

**How to set up**
1. Run it once as imported. It checks a sample response and stops at `STOP: preview - nothing sent`.
2. Edit `COINS` with CoinGecko coin ids (the id in the coin page URL) and a threshold for each, then set `USE_COINGECKO = true`.
3. Create a Telegram bot, add it to your chat, connect it and set `TELEGRAM_CHAT_ID`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_TELEGRAM_CHAT_ID` to a private chat. Set `TEST_RUN = false` to alert the real chat.

**Requirements**
- A Telegram bot and chat
- No CoinGecko key for the public endpoint

**How to customize**
- `COINS` sets the watchlist and each threshold in percent.
- `COOLDOWN_HOURS` and `ESCALATE_PCT` decide how often one coin can alert.
- `VS_CURRENCY` changes the quote currency, for example eur.
