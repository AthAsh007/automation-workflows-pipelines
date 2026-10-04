# Compliance

Outbound email, SMS and voice are regulated, and the caps are part of the design
rather than something bolted on afterwards. This page describes the mechanisms the
templates provide and the obligations they exist to meet.

**This is not legal advice.** Rules differ by where the sender is, where the
recipient is, and what the relationship between them is. Take your own advice
before a first live run.

## The mechanisms

Every sending template ships with these, and none of them are optional:

| Mechanism | Where it lives | What it prevents |
| --- | --- | --- |
| Suppression list read on every run | A `Suppression` tab or table, checked before the send gate | Contacting someone who opted out |
| Address verification before send | A verifier node with a `STOP: unverified` branch | Bounces, spam traps, complaint rate |
| Per-run and per-day caps | `DAILY_CAP`, enforced in a Code node | Volume that trips a bulk threshold |
| Per-subject counters | A `SendLedger` tab in the templates that need it | Crossing a per-subject-line statutory threshold |
| One-click unsubscribe | A list-unsubscribe header and a link in the body | An opt-out that does not reach the suppression list |
| Write-back of every outcome | A `record-the-outcome` node | Losing the record of who was contacted and when |

## Consent is the question the workflow cannot answer

A template can prove an address is deliverable. It cannot tell you whether you are
allowed to write to it. That depends on the lawful basis for the record, which
comes from where the record came from.

Ask, in writing, before the first send:

- Where did these records come from? A purchased list, a scrape, a form fill and
  an event badge are four different legal positions.
- What were people told at the point of collection?
- Is there a legitimate-interest assessment, and does the actual message match
  what it describes?
- Who is the controller, and who is the processor?

If the answer to the first question is "a list we bought", most jurisdictions that
require prior consent for marketing to individuals rule that out for individual
subscribers, whatever the vendor's terms of service say.

## The regimes that come up most

**United States, email: CAN-SPAM.** Opt-out rather than opt-in. Requires accurate
headers and subject line, a physical postal address, a working unsubscribe
mechanism, and opt-outs honoured within ten business days. Applies per message.

**United States, SMS and voice: TCPA.** Materially stricter than CAN-SPAM. Prior
express written consent is required for marketing messages and for automated
calls, with statutory damages per message. Treat any SMS or voice template as
requiring documented opt-in before the first send, and check the current state of
consent rules rather than assuming last year's position still holds.

**EU and UK: GDPR and PECR.** GDPR governs the personal data; PECR (and its
national equivalents) governs the electronic marketing message itself. For
business-to-business email to a corporate subscriber the position is more
permissive than for individuals, but the data-protection obligations apply either
way: a lawful basis, a privacy notice reachable from the message, honoured
objections, and a defensible retention period.

**Singapore: PDPA and the Spam Control Act.** The Spam Control Act binds messages
sent *from* Singapore, not only messages sent to Singapore recipients, so it
follows the operator rather than the audience. Bulk begins at any of: more than
100 messages with the same subject line in 24 hours, more than 1,000 in 30 days,
or more than 10,000 in a year. Crossing any line requires every subject line to
begin with `<ADV>`.

Those are per-subject-line thresholds, not per-campaign ones, which is what makes
them a design constraint rather than a footnote. A single-subject campaign is
capped at 100 a day. A campaign rotating N subject lines can send N times that
under the same statute. For a monthly target T sent over 22 working days:

| Threshold | Volume measured against it | Subject variants required |
| --- | --- | --- |
| 100 per 24 hours | T / 22 per day | (T / 22) / 100 |
| 1,000 per 30 days | T | T / 1,000 |
| 10,000 per year | T x 12 | (T x 12) / 10,000 |

The annual line binds first at any serious volume. At T = 14,000 a month it
requires 17 subject variants. [`n8n/archive/capacity-planner`](../n8n/archive/capacity-planner/)
computes this from `MONTHLY_TARGET` at runtime, refuses to start with fewer
variants, and tracks per-subject counters for all three windows.

## The deliverability floor binds harder than the statute

Google and Yahoo require bulk senders to keep the spam complaint rate below 0.3%,
and recommend staying under 0.1%. Cold campaigns routinely run between 0.5% and
1%. Crossing that line does not produce a fine. It ends the domain.

So every sending template requires, and each README repeats:

- A separate sending domain. Never the domain that also sends invoices and
  password resets.
- SPF, DKIM and DMARC verified before the first send.
- Warmup completed before the campaign, not during it.
- A one-click unsubscribe that is actually honoured, which means the opt-out
  writes to the suppression list the sending workflow reads.

Google's current sender requirements are the authority here, and they have
changed twice in recent years. Check them rather than trusting this page:
<https://support.google.com/a/answer/81126>.

## Data handling inside the templates

- Fixtures contain no real personal data. See [`../NOTICE`](../NOTICE).
- No template writes a credential to a sheet, a log or a chat message.
- Templates that enrich a record store the provider and the timestamp alongside
  the value, so a record's provenance survives into the CRM and a bad batch can be
  traced and removed.
- Verification results carry an expiry. `crm-data-hygiene-published` re-verifies addresses
  older than `REVERIFY_AFTER_DAYS` and suppresses what fails, rather than treating
  a two-year-old "valid" as still true.
