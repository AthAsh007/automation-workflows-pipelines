# Follow up Calendly no-shows with a rebooking email in Gmail

**Who's it for**
Coaches, consultants and sales teams who mark no-shows in Calendly and then forget to follow up. Each missed meeting gets a friendly rebooking email the same day, once.

**How it works**
1. Every two hours it lists your Calendly meetings that started in the last 24 hours and ended at least an hour ago, then reads their invitees. Sample invitees are used until Calendly is connected.
2. Only invitees the host marked as no-show in Calendly are kept. Canceled meetings, internal addresses and anyone emailed in the last 30 days are skipped with a reason.
3. A person with two missed meetings in one window gets one email. `DAILY_CAP` limits sends per run.
4. The email names the missed meeting and links to the matching booking page from `REBOOK_LINKS`. Emailed invitees are remembered only on a live run.

**How to set up**
1. Run it once as imported. It previews against sample invitees and stops at `STOP: preview - nothing sent`.
2. Add a Calendly credential to both Calendly nodes, paste your user URI into `CALENDLY_USER_URI`, and set `USE_CALENDLY = true`.
3. Fill `REBOOK_LINKS` with the booking page for each event type, then connect Gmail.
4. Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.

**Requirements**
- A Calendly account with API access (personal access token or OAuth)
- A Gmail account

**How to customize**
- `REBOOK_LINKS` maps event type names to booking pages; `DEFAULT_REBOOK_URL` covers the rest.
- `COOLDOWN_DAYS` stops repeat emails to the same person.
- `INTERNAL_DOMAINS` keeps colleagues out.
