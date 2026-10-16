# Archive unengaged subscribers in Mailchimp after a dry-run review

Finds subscribed Mailchimp contacts who have been on the list for 90+ days without opening or clicking, protects VIPs, customer tags and partner domains, caps the batch, and archives them only when DRY_RUN is switched off.

Import `mailchimp-list-cleanup-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Mailchimp account owners paying for contacts who have not opened an email in months. It gives you a reviewed list of who would be archived before a single contact is touched.

## How it works

1. On the 1st of each month it reads every subscribed member of one audience, or 8 sample members until Mailchimp is connected.
2. A member is a candidate when they joined 90+ days ago, their profile has not changed in 180 days, and they have no opens and no clicks (or a 1-star rating with under 5% opens).
3. Members with a protected tag, the Mailchimp VIP flag or a protected email domain are held back with the reason.
4. If candidates exceed 30% of the audience the run stops, because that usually means missing stats. Otherwise up to 200 are archived and the count goes to Slack.

## Sections on the canvas

1. **Start and settings.** Runs on the 1st of each month or by hand. Every rule, protection list and cap is a constant in `config`.
2. **Read the audience.** One page of up to 1,000 subscribed members, trimmed with the fields parameter to the stats the rules need. `Load sample members` covers every rule so the review can be read before connecting.
3. **Decide who qualifies.** `Pick members to archive` checks protections before engagement and fails closed: if candidates pass `MAX_SHARE_PCT` of the audience the batch is emptied, since that pattern usually means stats did not load.
4. **Archive and report.** The DELETE call archives rather than erases, so history is kept and a contact can be restored. It runs only after `DRY_RUN` is switched off, one member per request.

## Setup

1. Run it once as imported. It reviews the sample members and stops at `STOP: dry run - nothing archived`.
2. Add a Mailchimp credential to both Mailchimp nodes, then set `MAILCHIMP_DC`, `LIST_ID` and `USE_MAILCHIMP = true`.
3. Run it again and read the candidates and held-back reasons in `Pick members to archive`.
4. When the list looks right, set `DRY_RUN = false`. Archived contacts keep their history and can be re-added.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_MAILCHIMP` | `false` | set true after adding the Mailchimp credential |
| `MAILCHIMP_DC` | `'us21'` | data centre from your API key, the part after the dash |
| `LIST_ID` | `''` | audience id (Audience > Settings > Audience name and defaults) |
| `MIN_TENURE_DAYS` | `90` | members who joined more recently are never candidates |
| `STALE_DAYS` | `180` | profile unchanged for this many days |
| `LOW_RATING_OPEN_RATE` | `0.05` | a 1-star member below this open rate also qualifies (0.05 = 5%) |
| `PROTECT_TAGS` | `["customer","vip","partner","do-not-arch` | tags that are never archived (case-insensitive) |
| `PROTECT_DOMAINS` | `["yourcompany.example"]` | email domains that are never archived |
| `MAX_ARCHIVE_PER_RUN` | `200` | hard ceiling on archives per run, oldest members first |
| `MAX_SHARE_PCT` | `30` | if more than this share of the audience qualifies, stop and archive nothing |
| `SLACK_CHANNEL_ID` | `''` | channel for the live result; blank skips Slack |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Fetch subscribed members`
- `Archive the member in Mailchimp`
- `Post the result to Slack`

## Requirements

- A Mailchimp audience
- Optional: a Slack workspace for the result

## Customising

- `MIN_TENURE_DAYS` and `STALE_DAYS` decide how long someone must be quiet before they qualify.
- `PROTECT_TAGS` and `PROTECT_DOMAINS` keep customers, partners and staff on the list whatever their stats.
- `MAX_ARCHIVE_PER_RUN` and `MAX_SHARE_PCT` limit how much one run can remove.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run review) | 8 | none | `STOP: dry run - nothing archived` |
| live archive with Slack | 13 | `Archive the member in Mailchimp`, `Post the result to Slack` | `Post the result to Slack` |
| too many candidates fails closed | 9 | none | `STOP: dry run - nothing archived` |
