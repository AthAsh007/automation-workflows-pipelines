# Qualify inbound candidate replies and book interviews in Google Calendar

**Who's it for**
Recruitment teams running SMS or voice outreach who need every inbound reply handled the moment it
lands — the sequence stopped, the candidate qualified, an interview booked and the ATS updated —
without a recruiter watching an inbox.

**How it works**
One public endpoint takes three kinds of event: a candidate's SMS reply, a Twilio delivery receipt
and Retell's `call_analyzed` webhook. Every request is signature-verified and fails closed, because
this URL can opt a candidate out and write into the client's ATS. Any inbound message stops the
sequence, whatever it says. Opt-outs are handled in a single transaction. Everyone else is scored
against the `QUALIFY` rules in `config`; a pass picks the right recruiter and an open slot, books it
in Google Calendar and records the appointment. The outcome is queued back to the ATS as a note, the
recruiter is alerted by Slack and Gmail, and the provider always gets a well-formed response.

**How to set up**
1. Run `supabase/schema.sql` then `supabase/seed.sql`.
2. Open **`config`** and set `CLIENT_ID`, `SUPABASE_URL` and the `QUALIFY` rules.
3. Put this workflow's **production** URL into the Twilio console and the Retell dashboard, and the
   same value into `TWILIO_STATUS_CALLBACK` — Twilio signs the exact public URL it posted to.
4. Attach Google Calendar, Gmail and Supabase credentials to the `[cred]` nodes.
5. Set `DEMO_MODE = false` and `TEST_RUN = false` only when you are ready to write for real.

**Requirements**
A Supabase project with the bundled schema, a Twilio number, and Google Calendar and Gmail accounts.
Retell and the Slack alert are optional.

**How to customize**
The qualification bar is `QUALIFY` in `config`, so changing it is a config edit rather than a prompt
rewrite. To add a recruiter or a routing rule, edit **`pick the recruiter and slot`**.
