# Assign new HubSpot contacts to owners by territory round-robin with Slack alerts

**Who's it for**
Sales managers with two or more reps per region who hand out inbound HubSpot leads by hand. Leads get an owner within 15 minutes and the load stays even.

**How it works**
1. Every 15 minutes it searches HubSpot for contacts created in the last day that have no owner, or uses sample contacts until HubSpot is connected.
2. Country and state (full names or codes) pick a territory from the `TERRITORIES` table. Anything unmatched goes to the fallback territory.
3. Each territory keeps its own rotation pointer in workflow static data. Owners on `AWAY_OWNERS` or at their daily cap are passed over; if nobody is free the lead is held and named in Slack.
4. On a live run the owner is written to the HubSpot contact. One Slack message tags each rep with their new leads.

**How to set up**
1. Run it once as imported. It assigns sample contacts and stops at `STOP: preview - nothing posted` and `STOP: not live - HubSpot untouched`.
2. Create a HubSpot private app with contacts read and write scopes, add it as a credential to both HubSpot nodes, then set `USE_HUBSPOT = true`.
3. Fill `OWNERS` with HubSpot owner ids, Slack member ids and daily caps, and edit `TERRITORIES`. Connect Slack and set `SLACK_CHANNEL_ID`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel. The test alert lands there with no @mentions. Set `TEST_RUN = false` to write owners and post to `SLACK_CHANNEL_ID`.

**Requirements**
- A HubSpot account with a private app token
- A Slack workspace

**How to customize**
- `TERRITORIES` maps countries and states to owner pools; order matters, first match wins.
- `OWNERS` holds each rep's daily cap. `AWAY_OWNERS` takes people out of rotation for the day.
- `LOOKBACK_HOURS` sets how old a contact can be and still get assigned.
