# Warn field teams on Telegram when tomorrow's forecast crosses thresholds

**Who's it for**
Construction, landscaping, roofing and events crews that plan tomorrow's work across several sites and get caught out by wind or frost. Each team lead gets one message by 15:00 listing only their sites that need a plan B, and when in the day the weather allows work.

**How it works**
1. Every day at 15:00 it asks Open-Meteo for each site in `SITES` (daily and hourly values, no API key). Until `USE_OPEN_METEO` is true, sample forecasts for 6 sites are used. A site whose request fails is reported as unreadable, not skipped.
2. Tomorrow's rain, rain chance, wind gusts, heat and frost are checked against `THRESHOLDS`, with per-site overrides. Rain and gusts count only if they hit inside `WORK_HOURS`, so a gale at 03:00 becomes a note, not a warning.
3. A value past its limit by the margin in `SEVERE_MARGINS` is severe and puts SEVERE at the top of the message. For rain and wind sites, the longest run of dry, calm work hours is given as the best window.
4. Sites are grouped by team. Each team with at least one warning or unreadable site gets one Telegram message in its own chat; teams with a clear forecast hear nothing.

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
- `WORK_HOURS` sets the shift, and `HOURLY_RAIN_MM` how much rain in one hour stops work.
- `SEVERE_MARGINS` decides how far past a limit counts as severe. Set `SEND_ALL_CLEAR = true` to message teams on clear days too.
