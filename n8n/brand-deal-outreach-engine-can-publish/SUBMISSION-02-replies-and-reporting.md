# Classify outreach replies and report weekly from Airtable to Slack

**Who's it for**
Agencies and freelancers running cold email at volume for creators or clients, who need every reply triaged within the hour and a clean weekly number to show for it.

**How it works**
One hourly schedule drives both halves. The reply half reads new mail from the sending platform (Instantly by default) and sorts each message against an ordered rule list: unsubscribe, bounce, auto-reply, wrong person, not now, not interested, interested. First match wins, so a removal request outranks an interested line in the same email. Anything matching no rule becomes `unclear` and goes to a person with the same urgency as an obvious yes. Outcomes are upserted back to the Airtable pitch log on `Pitch id`, interested replies are posted to Slack as their own handover message, and a short digest follows. The report half wakes for one hour a week, reads the pitch log and posts a per-student block: sent, held, reply rate, interest rate, bookings.

**How to set up**
1. Open `config` and fill in the Airtable key and base id, the sending-platform key and campaign id, and a Slack or Discord webhook URL.
2. Attach a credential to each `[cred]` node.
3. Set `REPORT_DAY` and `REPORT_HOUR` for the weekly post.
4. Press **Run it now**. With the keys left blank it runs on demo data and writes nothing.

**Requirements**
An Airtable base with a `Pitches` table, an Instantly or Smartlead account, and a Slack or Discord incoming webhook. Every one of them is optional: a blank key skips that branch instead of failing the run.

**How to customize**
`REPLY_RULES` in `config` holds the classifier, in priority order. `REPORT_WINDOW_DAYS` sets the report window and `REPITCH_AFTER_DAYS` the nurture date.
