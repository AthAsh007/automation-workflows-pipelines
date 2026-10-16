# Re-engage dormant HubSpot contacts with a three-touch Gmail sequence

**Who's it for**
Small sales and marketing teams with a HubSpot database full of leads nobody has spoken to in months. It works through them a few at a time from your own Gmail, so replies come back to a person, not a marketing tool.

**How it works**
1. Every weekday at 09:30 it searches HubSpot for contacts in the chosen lifecycle stages with no activity for `DORMANT_DAYS`, or uses sample contacts until HubSpot is connected.
2. The touch already sent, its date and the sequence status are read from three custom contact properties. Touch 2 waits 5 days after touch 1, touch 3 waits 7 days after touch 2.
3. A reply since the sequence started, or an email opt-out, closes the sequence at once. Fourteen days after touch 3 it is marked completed.
4. Up to `DAILY_CAP` emails go out through Gmail. On a live run each send updates the touch properties and each closed sequence gets its final status.

**How to set up**
1. Run it once as imported. It plans sample touches and stops at `STOP: preview - nothing sent` and `STOP: not live - statuses unchanged`.
2. In HubSpot create contact properties reengage_touch (number), reengage_started and reengage_last_sent (date), and reengage_status (single-line text).
3. Add a HubSpot private app credential to the three HubSpot nodes, set `USE_HUBSPOT = true`, and connect Gmail.
4. Put your address in `TEST_EMAIL` to receive the touches yourself, then set `TEST_RUN = false`.

**Requirements**
- A HubSpot account with a private app (contacts read and write)
- A Gmail account

**How to customize**
- `TOUCHES` holds the gap, subject and body of each email.
- `LIFECYCLE_STAGES` and `DORMANT_DAYS` decide who enters the sequence.
- `DAILY_CAP` keeps sending volume low enough for a personal mailbox.
