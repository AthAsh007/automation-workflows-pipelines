# Warn field teams on Telegram when tomorrow's forecast crosses thresholds

Every afternoon reads tomorrow's daily and hourly forecast from the free Open-Meteo API for each work site, warns only about rain and wind that fall inside working hours, marks severe crossings, suggests the best dry and calm work window, reports sites whose forecast could not be read, and sends each field team one Telegram message.

Import `weather-threshold-team-alerts-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Construction, landscaping, roofing and events crews that plan tomorrow's work across several sites and get caught out by wind or frost. Each team lead gets one message by 15:00 listing only their sites that need a plan B, and when in the day the weather allows work.

## How it works

1. Every day at 15:00 it asks Open-Meteo for each site in `SITES` (daily and hourly values, no API key). Until `USE_OPEN_METEO` is true, sample forecasts for 6 sites are used. A site whose request fails is reported as unreadable, not skipped.
2. Tomorrow's rain, rain chance, wind gusts, heat and frost are checked against `THRESHOLDS`, with per-site overrides. Rain and gusts count only if they hit inside `WORK_HOURS`, so a gale at 03:00 becomes a note, not a warning.
3. A value past its limit by the margin in `SEVERE_MARGINS` is severe and puts SEVERE at the top of the message. For rain and wind sites, the longest run of dry, calm work hours is given as the best window.
4. Sites are grouped by team. Each team with at least one warning or unreadable site gets one Telegram message in its own chat; teams with a clear forecast hear nothing.

## Sections on the canvas

1. **Start and settings.** Runs every day at 15:00, late enough for a stable next-day forecast and early enough to move a crew. Sites, teams, limits, severity margins and working hours all live in `config`.
2. **Fetch forecasts per site.** One Open-Meteo request per site keeps each response tied to its coordinates. The request continues on error, so a timeout for one site becomes a warning line instead of stopping every team's message. `Load sample forecasts` includes such a failure.
3. **Check limits per team.** Hourly values decide whether rain or gusts hit the shift, so a night gale is only a note. A site can carry its own `limits`. Severe crossings lead the message, and the best dry, calm window tells a lead when work can still go ahead.
4. **Send to each team.** Nothing is sent while `TEST_RUN` is true and `TEST_EMAIL` is blank. Test mode sends every team message to `TEST_TELEGRAM_CHAT_ID`, so the crews never see a trial run.

## Setup

1. Run it once as imported. It checks sample forecasts and stops at `STOP: preview - nothing sent`.
2. Fill in `SITES` with your locations and set `USE_OPEN_METEO = true`. No credential is needed.
3. Add a Telegram bot to each team chat, connect it, and put each chat id in `TEAMS`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_TELEGRAM_CHAT_ID` to your own chat. Set `TEST_RUN = false` to message the teams.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_OPEN_METEO` | `false` | set true to fetch real forecasts (free, no key) |
| `SITES` | `[{"name":"Riverside depot","lat":51.505,` | one entry per site; limits overrides THRESHOLDS for that site |
| `TEAMS` | `{"North crew":"-1001000000001","South cr` | team name -> Telegram chat id |
| `THRESHOLDS` | `{"rain_mm":10,"rain_probability":70,"win` | a warning is raised at or beyond each limit |
| `SEVERE_MARGINS` | `{"rain_mm":10,"wind_gust_kmh":20,"heat_c` | this far past the limit counts as SEVERE (e.g. gusts 80+ against a 60 limit) |
| `WORK_HOURS` | `{"start":7,"end":17}` | local working hours; rain and gusts outside them are notes, not warnings |
| `HOURLY_RAIN_MM` | `2` | rain in one hour at or above this makes that hour unworkable |
| `SEND_ALL_CLEAR` | `false` | true also messages teams whose sites are all clear |
| `TEST_TELEGRAM_CHAT_ID` | `''` | test mode sends every team message here |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Send the team warning on Telegram`

## Requirements

- A Telegram bot added to each team chat
- Latitude and longitude for each site

## Customising

- `THRESHOLDS` sets each limit; a site can override any of them with its own `limits`.
- `WORK_HOURS` sets the shift, and `HOURLY_RAIN_MM` how much rain in one hour stops work.
- `SEVERE_MARGINS` decides how far past a limit counts as severe. Set `SEND_ALL_CLEAR = true` to message teams on clear days too.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 12 | none | `STOP: preview - nothing sent` |
| live forecast and Telegram | 12 | `Send the team warning on Telegram` | `Send the team warning on Telegram` |
