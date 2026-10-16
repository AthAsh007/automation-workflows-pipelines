# Warn field teams on Telegram when tomorrow's forecast crosses thresholds

Every afternoon fetches tomorrow's forecast from the free Open-Meteo API for each work site, checks rain, rain chance, wind gusts, heat and frost against set limits and sends each field team one Telegram message covering only its own sites.

Import `weather-threshold-team-alerts-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Construction, landscaping, roofing and events crews that plan tomorrow's work across several sites and get caught out by wind or frost. Each team lead gets one message by 15:00 listing only their sites that need a plan B.

## How it works

1. Every day at 15:00 it takes each site in `SITES` (name, latitude, longitude, team) and asks Open-Meteo for the daily forecast. No API key is needed. Until `USE_OPEN_METEO` is true, sample forecasts for 5 sites are used.
2. Tomorrow's rain total, rain probability, maximum wind gust, high and low temperature are checked against `THRESHOLDS` (10 mm, 70%, 60 km/h, 32 C and 0 C by default).
3. Every crossed limit becomes a short line with the value and the limit, such as "gusts 75 km/h (limit 60)".
4. Sites are grouped by team. Each team with at least one warning gets one Telegram message in its own chat; teams with a clear forecast hear nothing.

## Sections on the canvas

1. **Start and settings.** Runs every day at 15:00, late enough for a stable next-day forecast and early enough to move a crew. Sites, teams and limits all live in `config`.
2. **Fetch forecasts per site.** One Open-Meteo request per site keeps each response tied to its coordinates. It is free and needs no key, but `Load sample forecasts` still stands in until `USE_OPEN_METEO` is true, so the run works offline.
3. **Check limits per team.** A site can carry its own `limits`, so an exposed quarry tolerates more wind than a scaffold. Each warning line shows the value and the limit, which lets a lead judge it without opening a weather app.
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
- Set `SEND_ALL_CLEAR = true` to message teams on clear days too.
- `TEAMS` maps team names to Telegram chat ids.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 12 | none | `STOP: preview - nothing sent` |
| live forecast and Telegram | 12 | `Send the team warning on Telegram` | `Send the team warning on Telegram` |
