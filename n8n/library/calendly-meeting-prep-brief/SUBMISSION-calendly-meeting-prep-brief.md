# Send prep briefs for new Calendly bookings with HubSpot context by Gmail

**Who's it for**
Account executives and founders who take sales calls through Calendly and open HubSpot five minutes before each one to remember who they are talking to. The prep note arrives in the host's inbox as soon as the meeting is booked.

**How it works**
1. A Calendly webhook fires on invitee.created. A manual run uses a sample booking instead. Cancellations and event types not listed in `EVENT_TYPES` are ignored.
2. HubSpot is searched three times: the contact by email, the company by email domain, and deals linked to the contact.
3. Rules turn that into talking points: not in HubSpot yet, existing customer, an open deal in a late stage, a deal lost before, a free email address, and the campaign that brought them in.
4. The note (meeting time in your timezone, their answers, company size, open pipeline) is emailed to the Calendly host.

**How to set up**
1. Run it once from `Run manually`. It writes a note for a sample booking and stops at `STOP: preview - nothing sent`.
2. Create a HubSpot private app with contacts, companies and deals read scopes, add it to the three HubSpot nodes, and set `USE_HUBSPOT = true`.
3. Activate the workflow and register the production URL of `Calendly booking received` as a Calendly webhook subscription for invitee.created.
4. Connect Gmail. Put your address in `TEST_EMAIL` to receive every note yourself, then set `TEST_RUN = false` to email hosts.

**Requirements**
- A Calendly plan with webhooks (Standard or above)
- A HubSpot account with a private app token
- A Gmail account

**How to customize**
- `EVENT_TYPES` limits notes to named event types, such as Discovery call.
- `HOST_TIMEZONE` sets the time shown in each note.
- `LATE_STAGES` lists deal stages that count as late.
