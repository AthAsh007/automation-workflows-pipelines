# Warn in Slack before domains expire with RDAP lookups

Reads each domain's public RDAP record daily, warns in Slack at 60, 30, 14 and 7 days before expiry, and flags a missing transfer lock, hold or redemption status, an unexpected registrar and changed nameservers, each issue once.

Import `domain-expiry-rdap-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Agencies and IT leads who hold 5 to 200 domains across several registrars, often bought on different cards by different people. One Slack thread replaces checking every registrar dashboard.

## How it works

1. Every day at 08:15 it fetches the RDAP record for each domain in `DOMAINS` from rdap.org, which forwards to the right registry. Sample records are used until `USE_RDAP` is true.
2. The expiration event gives days left. A warning fires once per tier in `WARN_DAYS` for each expiry date, so a renewal resets the ladder.
3. Status codes are checked: `REQUIRED_STATUS` (a transfer lock by default) must be present, and hold, redemption or pending-delete statuses are critical. The registrar and nameservers are compared with what you expect and with the last run.
4. Only new issues and resolved ones are posted, in one Slack message.

## Sections on the canvas

1. **Start and settings.** Runs daily at 08:15. Domains, expected registrars, tiers and the status rules live in `config`; `List domains` makes one item per domain for the lookup.
2. **Read RDAP records.** The rdap.org service forwards to the registry that owns each TLD, so one URL pattern covers every domain. A 404 for an unsupported TLD comes back as data, and `Load sample RDAP records` includes one.
3. **Find what changed.** Every issue has a stable key, and only keys not posted before count as new. Expiry keys include the expiry date, so a renewal quietly restarts the 60, 30, 14 and 7-day ladder.
4. **Post and remember.** `Post to Slack?` needs a live run and a channel. `Remember reported issues` runs only after a post, so a dry run never hides an issue from the first real one.

## Setup

1. Run it once as imported. It checks sample records and stops at `STOP: dry run - nothing posted`.
2. List your domains in `DOMAINS`, with an optional expected registrar each, and set `USE_RDAP = true`. RDAP needs no account.
3. Connect Slack and set `SLACK_CHANNEL_ID`.
4. Set `DRY_RUN = false` and activate the workflow. Reported issues are kept in workflow static data, saved for active workflows.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_RDAP` | `false` | true fetches https://rdap.org/domain/<name> for each domain |
| `DOMAINS` | `[{"domain":"northwind.example","registra` | domains to watch; registrar = a fragment of the expected registrar name, blank to skip |
| `WARN_DAYS` | `[60,30,14,7]` | expiry tiers in days left |
| `REQUIRED_STATUS` | `["client transfer prohibited"]` | RDAP statuses every domain should have |
| `CRITICAL_STATUS` | `["redemption period","pending delete","c` | statuses that mean the domain is or will soon be offline |
| `SLACK_CHANNEL_ID` | `''` | channel for the daily message; blank skips Slack |
| `MENTION` | `'<!channel>'` | added when a critical issue is new; blank for none |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Post the domain report`

## Requirements

- A Slack workspace
- Domains on TLDs that publish RDAP (all gTLDs and most ccTLDs)

## Customising

- `WARN_DAYS` sets the expiry tiers.
- `REQUIRED_STATUS` lists statuses every domain should carry, such as client delete prohibited.
- `CRITICAL_STATUS` lists statuses that get a `MENTION` in Slack.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample records, dry run) | 11 | none | `STOP: dry run - nothing posted` |
| live RDAP and Slack | 12 | `Post the domain report` | `Remember reported issues` |
