# Route inbound leads from forms, email and calls into GoHighLevel

**Who's it for**

Agencies and small teams whose leads arrive three different ways — a website form, a forwarded email, a phone note somebody typed up — and who want each one read, routed and filed in GoHighLevel instead of sitting in an inbox.

**How it works**

A lead posts to the webhook, or the manual trigger loads three demo leads, one per source. `read the lead` works out which source it came from and digs the same facts out of every shape: name, email, phone, company, message, and what the person wants. A bot submission, or a lead with no way to reach anyone, is rejected with the reason attached rather than silently dropped. `route the lead` walks a first-match-wins rule table to set the owner, the pipeline stage and the tags — the last rule matches everything, so a lead always lands somewhere. `build the GoHighLevel payload` assembles the contact upsert plus the opportunity that follows it, and every path ends on a STOP node that says what happened.

**How to set up**

1. Open `config` and fill in `GHL_LOCATION_ID`, `GHL_PIPELINE_ID`, the stage ids, the owner user ids and the custom field ids.
2. Paste a Private Integration token into `GHL_API_KEY`.
3. Point your form, email forwarder or call log at the production webhook URL.
4. It ships with `DRY_RUN = true`, so the first run shows the payload instead of writing it. Read that preview, then set `DRY_RUN = false`.

**Requirements**

A GoHighLevel sub-account with a pipeline, and a Private Integration token scoped `contacts.write` and `opportunities.write`. The demo run needs no credential at all. A blank id is skipped rather than fatal, so a half-mapped account still writes a clean contact.

**How to customize**

`ROUTING_RULES` in `config` decides who gets what: match on the intake source, on what the lead wants, or on both. `CUSTOM_FIELDS`, `BASE_TAGS`, `STAGES` and `OWNERS` map it onto your own account. The keyword lists in `read the lead` decide how intent is detected — swap them for a classifier if you want more than keywords.
