# Route inbound leads from forms, email and calls into GoHighLevel

**Who's it for**
Agencies and small sales teams whose leads arrive three ways: a website form, a forwarded email and a phone note someone typed up. Each lead is read, routed and filed in GoHighLevel instead of waiting in an inbox.

**How it works**
1. A lead posts to the webhook, or `Run with demo leads` loads three invented ones, one per source.
2. `Read the lead from any source` works out where it came from and pulls the same facts from every shape: name, email, phone, company, message and intent.
3. Bot submissions and leads with no email or phone stop at `STOP: not a usable lead` with the reason attached.
4. `Route by the rule table` walks `ROUTING_RULES` top to bottom. The first match sets the owner, the pipeline stage and the tags.
5. `Build the GoHighLevel request` assembles the contact upsert as one object, which is written only when the credential is in place and `DRY_RUN` is false.

**How to set up**
1. Run it once as imported. The demo leads end at `STOP: preview - request shown, nothing written` with the exact request body.
2. In `config`, fill in `GHL_LOCATION_ID`, `GHL_PIPELINE_ID`, the stage ids, the owner user ids and any custom field ids.
3. Create a Header Auth credential (Name `Authorization`, Value `Bearer <Private Integration token>`), select it on `Upsert the contact in GoHighLevel`, and set `GHL_CREDENTIAL_ADDED = true`.
4. Point your form, email forwarder or call log at the webhook URL, read the previews, then set `DRY_RUN = false`.

**Requirements**
- A GoHighLevel sub-account with a pipeline
- A Private Integration token with `contacts.write` and `opportunities.write`

**How to customize**
- Edit `ROUTING_RULES` in `config` to change who gets which lead.
- The intent keyword lists live in `Read the lead from any source`.
