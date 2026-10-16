# Assign new HubSpot contacts to owners by territory round-robin with Slack alerts

Every 15 minutes, finds new HubSpot contacts with no owner, maps each to a territory by country and state, picks the next owner in that territory's rotation while respecting daily caps and away lists, sets the owner in HubSpot and tags each rep in Slack.

Import `hubspot-round-robin-lead-assignment-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Sales managers with two or more reps per region who hand out inbound HubSpot leads by hand. Leads get an owner within 15 minutes and the load stays even.

## How it works

1. Every 15 minutes it searches HubSpot for contacts created in the last day that have no owner, or uses sample contacts until HubSpot is connected.
2. Country and state (full names or codes) pick a territory from the `TERRITORIES` table. Anything unmatched goes to the fallback territory.
3. Each territory keeps its own rotation pointer in workflow static data. Owners on `AWAY_OWNERS` or at their daily cap are passed over; if nobody is free the lead is held and named in Slack.
4. On a live run the owner is written to the HubSpot contact. One Slack message tags each rep with their new leads.

## Sections on the canvas

1. **Start and settings.** Runs every 15 minutes so a lead never waits long for an owner. Territories, owner caps and the away list are edited in `config` only.
2. **Find unowned contacts.** The HubSpot search already filters out owned contacts; `Assign by territory` checks again in case an owner was set between the search and the write. Sample contacts stand in until `USE_HUBSPOT` is true.
3. **Pick owners and alert.** Territory order is first match wins, so specific state rules sit above whole-country ones. A full or away pool holds the lead and names it in Slack instead of overloading one rep. A test alert goes only to `TEST_SLACK_CHANNEL`, and stops at a STOP if that is blank.
4. **Write owners and save the rotation.** Only `Live run?` writes to HubSpot. `Save rotation pointers` runs after the writes, so a preview or test never moves anyone up or down the rotation.

## Setup

1. Run it once as imported. It assigns sample contacts and stops at `STOP: preview - nothing posted` and `STOP: not live - HubSpot untouched`.
2. Create a HubSpot private app with contacts read and write scopes, add it as a credential to both HubSpot nodes, then set `USE_HUBSPOT = true`.
3. Fill `OWNERS` with HubSpot owner ids, Slack member ids and daily caps, and edit `TERRITORIES`. Connect Slack and set `SLACK_CHANNEL_ID`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel. The test alert lands there with no @mentions. Set `TEST_RUN = false` to write owners and post to `SLACK_CHANNEL_ID`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_HUBSPOT` | `false` | set true after adding the HubSpot credential to both HubSpot nodes |
| `OWNERS` | `{"101":{"name":"Maya Ortiz","slack_id":"` | HubSpot owner id -> name, Slack member id, max new leads per day |
| `TERRITORIES` | `[{"name":"US West","countries":["US"],"s` | first match wins; empty states = whole country; * = everything else |
| `AWAY_OWNERS` | `["401"]` | owner ids skipped today (holiday, sick, full pipeline) |
| `LOOKBACK_HOURS` | `24` | contacts created within this window are considered |
| `SLACK_CHANNEL_ID` | `''` | channel for assignment alerts; blank posts nothing |
| `TEST_SLACK_CHANNEL` | `''` | test mode posts here instead of the real channel; blank means test mode posts nothing |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Search new unowned contacts`
- `Post assignments to Slack`
- `Set the contact owner in HubSpot`

## Requirements

- A HubSpot account with a private app token
- A Slack workspace

## Customising

- `TERRITORIES` maps countries and states to owner pools; order matters, first match wins.
- `OWNERS` holds each rep's daily cap. `AWAY_OWNERS` takes people out of rotation for the day.
- `LOOKBACK_HOURS` sets how old a contact can be and still get assigned.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 12 | none | `STOP: not live - HubSpot untouched`, `STOP: preview - nothing posted` |
| test mode with no test channel | 13 | none | `STOP: not live - HubSpot untouched`, `STOP: test - TEST_SLACK_CHANNEL blank` |
| test mode into the test channel | 13 | `Post assignments to Slack` | `STOP: not live - HubSpot untouched`, `Post assignments to Slack` |
| live with HubSpot and Slack | 15 | `Set the contact owner in HubSpot`, `Post assignments to Slack` | `Save rotation pointers`, `Post assignments to Slack` |
