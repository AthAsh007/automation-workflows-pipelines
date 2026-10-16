# Warn field teams on Telegram when tomorrow's forecast crosses thresholds

**Who's it for**
Construction, landscaping, roofing and events crews that plan tomorrow's work across several sites and get caught out by wind or frost. Each team lead gets one message by 15:00 listing only their sites that need a plan B.

**How it works**
1. Every day at 15:00 it takes each site in `SITES` (name, latitude, longitude, team) and asks Open-Meteo for the daily forecast. No API key is needed. Until `USE_OPEN_METEO` is true, sample forecasts for 5 sites are used.
2. Tomorrow's rain total, rain probability, maximum wind gust, high and low temperature are checked against `THRESHOLDS` (10 mm, 70%, 60 km/h, 32 C and 0 C by default).
3. Every crossed limit becomes a short line with the value and the limit, such as "gusts 75 km/h (limit 60)".
4. Sites are grouped by team. Each team with at least one warning gets one Telegram message in its own chat; teams with a clear forecast hear nothing.

**How to set up**
1. Run it once as imported. It checks sample forecasts and stops at `STOP: preview - nothing sent`.
2. Fill in `SITES` with your locations and set `USE_OPEN_METEO = true`. No credential is needed.
3. Add a Telegram bot to each team chat, connect it, and put each chat id in `TEAMS`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_TELEGRAM_CHAT_ID` to your own chat. Set `TEST_RUN = false` to message the teams.

**Requirements**
- A Telegram bot added to each team chat
- Latitude and longitude for each site

**How to customize**
- `THRESHOLDS` sets each limit; a site can override any of them with its own `limits`.
- Set `SEND_ALL_CLEAR = true` to message teams on clear days too.
- `TEAMS` maps team names to Telegram chat ids.
