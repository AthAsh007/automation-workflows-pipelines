# Send scheduled SMS and voice outreach from Supabase via Twilio

**Who's it for**
Recruitment and sales teams running multi-step SMS or voice outreach who need one place that owns
sending — so quiet hours, the daily cap and opt-outs cannot be bypassed by a branch that did not run.

**How it works**
Every fifteen minutes the runner claims a batch of due enrollments from a Supabase view, walks each
one up its ladder, and sends exactly one touch per person. The queue is a database view, not logic
in here: opted-out numbers, people already worked by another campaign, leased rows and terminal
enrollments never come back from `v_due_attempts` at all. Each row is sent by SMS through Twilio or
as a voice call through Retell. Results are classified into sent, transient and permanent, which
decides whether the enrollment advances a rung, backs off with jitter, or stops for good. An
idempotency key computed before the send makes a retry safe by construction.

**How to set up**
1. Open **`config`** and set the ladder, quiet hours, the daily cap and `PERMANENT_SMS_ERRORS`.
2. Attach Supabase, Twilio and Retell credentials to the `[cred]` nodes.
3. Leave **`DEMO_MODE = true`** for the first run — it uses the sample queue and sends nothing.

**Requirements**
A Supabase project with the `v_due_attempts` view and a `contact_attempts` table with a unique index
on the idempotency key, plus a Twilio account. Retell and the summary webhook are optional.

**How to customize**
Change the ladder steps and delays in `config`. To add a channel, branch from **`SMS or voice?`**
and feed the result into **`one send result`** — the recording and retry logic is unchanged.
