# Triage new Zendesk tickets by urgency with OpenAI and alert Slack

**Who's it for**
Support leads on Zendesk whose queue is sorted by arrival time, so an outage report from a key account can sit behind twenty password resets. It checks the new queue every 15 minutes.

**How it works**
1. Every 15 minutes it searches Zendesk for new tickets from the last 30 minutes that are not yet tagged `auto_triaged`, or uses 6 sample tickets until Zendesk is connected.
2. Each ticket gets points for outage words (40), urgency words (25), billing words (20), a VIP organisation or domain (30) and a requester with several new tickets (10).
3. With `USE_OPENAI` on, a model also rates each ticket and the higher of the two levels wins. A ticket is never lowered below the priority it already has.
4. A live run sets priority and tags on the ticket with an internal note listing the reasons, and pages Slack for tickets that just became urgent.

**How to set up**
1. Run it once as imported. It scores the sample tickets and stops at `STOP: dry run - tickets untouched`.
2. Add a Zendesk credential to `Search new Zendesk tickets` and `Set priority and tags in Zendesk`, fill in `ZENDESK_SUBDOMAIN` and set `USE_ZENDESK = true`.
3. Put your key accounts in `VIP_ORGS` and `VIP_DOMAINS`, and a channel id in `SLACK_CHANNEL_ID`.
4. Optionally add an OpenAI credential and set `USE_OPENAI = true`. Set `DRY_RUN = false` once the levels look right.

**Requirements**
- A Zendesk Support account with API access
- A Slack workspace
- Optional: an OpenAI API key

**How to customize**
- `OUTAGE_WORDS`, `URGENT_WORDS` and `MONEY_WORDS` hold the phrases; `POINTS` sets what each is worth.
- `LEVEL_THRESHOLDS` decides how many points make a ticket urgent, high or normal.
- `PAGE_LEVELS` lists the levels that page Slack.
