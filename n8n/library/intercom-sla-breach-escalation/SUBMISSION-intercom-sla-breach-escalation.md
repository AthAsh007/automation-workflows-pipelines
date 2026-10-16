# Escalate Intercom conversations waiting past SLA to Slack

**Who's it for**
Support managers on Intercom who promise reply times by plan (one hour for enterprise, four business hours for pro) and only find out about a miss when the customer complains.

**How it works**
1. Every 10 minutes it searches Intercom for open conversations, or uses 7 sample conversations until Intercom is connected.
2. Each conversation gets a tier from its tags or priority flag, and the time since the customer last wrote is measured on that tier's clock: around the clock for enterprise, weekdays 09:00 to 18:00 for the rest.
3. Past 80% of the SLA it is at risk; past 100% it is breached; past 200% it escalates with a mention.
4. Each breach level posts once. The key is the conversation and the moment the customer started waiting, so a new customer message starts a new clock.

**How to set up**
1. Run it once as imported. It measures the sample conversations and stops at `STOP: dry run - nothing posted`.
2. Add an Intercom credential to `Search open Intercom conversations` and set `USE_INTERCOM = true`.
3. Set `SLACK_CHANNEL_ID`, and check `TIER_TAGS`, `SLA_BY_TIER` and `BUSINESS_HOURS` match your plans and team.
4. Set `DRY_RUN = false` and activate the workflow. Escalation memory is kept in workflow static data, which n8n only saves on activated runs.

**Requirements**
- An Intercom workspace with API access
- A Slack workspace

**How to customize**
- `SLA_BY_TIER` sets minutes and clock (`24x7` or `business`) per tier.
- `WARN_AT_PCT` and `ESCALATE_AT_PCT` set the at-risk and second-level lines.
- `ESCALATION_MENTION` is who gets tagged at the second level, for example `<!here>` or a user group.
