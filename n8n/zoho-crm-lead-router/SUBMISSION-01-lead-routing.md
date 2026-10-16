# Route inbound leads from forms, email and calls into Zoho CRM

**Who's it for**
Services teams running their pipeline in Zoho CRM whose leads arrive three ways (a website form, a forwarded email, a phone note somebody typed up) and who want each one routed and filed without anyone re-typing it.

**How it works**
A lead posts to the webhook, or the manual trigger loads three demo leads, one per source. `read the lead` turns every shape into the same six fields. A lead with no email and no phone, or one that reads as spam, stops at a named node with the reason. `route the lead` walks a first-match rule table for owner, status and tags; the last rule matches everything. `build the Zoho payload` assembles the whole Leads request before anything is sent, a refresh token is exchanged for a fresh access token, and the lead is written once. The team gets a message saying who owns it.

**How to set up**
1. In `config`, set `ZOHO_API_BASE` and `ZOHO_ACCOUNTS_BASE` to your data centre.
2. Create a Self Client at api-console.zoho.com and paste its client id, secret and refresh token.
3. Fill in `OWNERS`, `LEAD_LAYOUT_ID` and the `CUSTOM_FIELDS` API names.
4. Set `DRY_RUN = false`.

**Requirements**
A Zoho CRM org and a Self Client with lead create scope. The demo run needs no credential.

**How to customize**
Edit `ROUTING_RULES` in `config`, and check every status against your Lead Status picklist. `NOTIFY_WEBHOOK_URL` posts the routing message anywhere that accepts a webhook.
