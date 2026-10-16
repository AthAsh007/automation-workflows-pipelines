# Warn in Slack before domains expire with RDAP lookups

**Who's it for**
Agencies and IT leads who hold 5 to 200 domains across several registrars, often bought on different cards by different people. One Slack thread replaces checking every registrar dashboard.

**How it works**
1. Every day at 08:15 it fetches the RDAP record for each domain in `DOMAINS` from rdap.org, which forwards to the right registry. Sample records are used until `USE_RDAP` is true.
2. The expiration event gives days left. A warning fires once per tier in `WARN_DAYS` for each expiry date, so a renewal resets the ladder.
3. Status codes are checked: `REQUIRED_STATUS` (a transfer lock by default) must be present, and hold, redemption or pending-delete statuses are critical. The registrar and nameservers are compared with what you expect and with the last run.
4. Only new issues and resolved ones are posted, in one Slack message.

**How to set up**
1. Run it once as imported. It checks sample records and stops at `STOP: dry run - nothing posted`.
2. List your domains in `DOMAINS`, with an optional expected registrar each, and set `USE_RDAP = true`. RDAP needs no account.
3. Connect Slack and set `SLACK_CHANNEL_ID`.
4. Set `DRY_RUN = false` and activate the workflow. Reported issues are kept in workflow static data, saved for active workflows.

**Requirements**
- A Slack workspace
- Domains on TLDs that publish RDAP (all gTLDs and most ccTLDs)

**How to customize**
- `WARN_DAYS` sets the expiry tiers.
- `REQUIRED_STATUS` lists statuses every domain should carry, such as client delete prohibited.
- `CRITICAL_STATUS` lists statuses that get a `MENTION` in Slack.
