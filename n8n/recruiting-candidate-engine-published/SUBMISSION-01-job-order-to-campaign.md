# Score ATS candidates into a Supabase outreach campaign

**Who's it for**
Recruitment agencies and in-house talent teams who already keep candidates in an ATS and want a
scored, compliant shortlist enrolled into outreach automatically, instead of a recruiter picking
names by hand.

**How it works**
A new job order arrives by webhook, or you press **Run it now**. The job is normalised through a
per-vendor field map, then optionally enriched by an AI call that pulls out the must-have and
nice-to-have requirements. Candidates are fetched from the ATS, normalised (phone numbers to E.164,
duplicates collapsed) and scored against the job order transparently. Engagement history is read
from Supabase so the gate can reject opt-outs, anyone inside a cooldown window, anyone already in
another live campaign, everyone below the score floor, and anything over the per-run cap. Survivors
are enrolled with a first touch *scheduled* — never sent. Workflow 2 owns every outbound message,
which keeps quiet hours and the daily cap in one place.

**How to set up**
1. Open **`config`** and set `ATS_FIELDS` for your vendor, the score floor and the per-run cap.
2. Attach your credentials to the four `[cred]` nodes.
3. Leave **`DEMO_MODE = true`** for the first run — it uses the sample pool and writes nothing.

**Requirements**
An ATS with a candidate search API, a Supabase project, and optionally an OpenAI-compatible
endpoint and a Slack or Discord webhook.

**How to customize**
Scoring weights, the cooldown window and the gate thresholds all live in `config`. To add a
sourcing channel, feed it into **`one candidate pool`** and the rest of the pipeline is unchanged.
