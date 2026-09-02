# Compliance - the caps are part of the product

## Singapore Spam Control Act

Applies to messages sent **from** Singapore, not only to Singapore recipients. It follows us
even when the client is in London.

"Bulk" begins at any of:

- more than **100** messages with the same subject in 24 hours,
- more than **1,000** in 30 days,
- more than **10,000** in a year.

Cross any line and every subject line must begin with `<ADV>`. Penalty runs to S$25 per
message, capped at S$1m.

**These are per-subject-line thresholds, not per-campaign ones.** That distinction decides
what is buildable. A single-subject blast is capped at 100 a day; a campaign rotating N
subject lines can send N times that and stay inside the same statute. Which means the real
question on any volume brief is not "is this legal" but "how many subject variants does this
volume need".

The arithmetic, for a monthly target T sent over 22 working days:

| Threshold | Volume measured against it | Variants required |
|---|---|---|
| 100 / 24h | T ÷ 22 per day | (T ÷ 22) ÷ 100 |
| 1,000 / 30d | T | T ÷ 1,000 |
| 10,000 / year | T x 12 | **(T x 12) ÷ 10,000** |

The annual line binds at any serious volume. At T = 14,000 that is **17 subject variants
minimum**. Template 12 computes this from `MONTHLY_TARGET` at runtime and refuses to start
with fewer, tracking per-subject counters for all three windows in a `SendLedger` tab.

**Where the client sends from matters too.** The Act binds mail sent *from* Singapore. A
system we build that the client operates on their own infrastructure, from their own
country, is governed by their jurisdiction, not ours. That is the structural answer when a
brief genuinely needs volume we would not send ourselves. Get it signed off rather than
assumed.

**An earlier version of this file framed the cap as 80 sends a day, full stop.** That was
the right cap for a single-subject campaign and wrong as a general rule. The corrected
position is above.

## Deliverability floor

Gmail and Yahoo require spam complaints under **0.3%**. Cold campaigns routinely run
0.5-1%. In practice this binds harder than the statute: cross it and the client's domain is
finished, not fined.

So every sending template requires, and each README repeats:

- a separate sending domain, never the client's primary,
- SPF, DKIM and DMARC verified before the first send - 04 refuses to run without the
  `SENDING_DOMAIN_VERIFIED` flag set,
- warmup already complete - we do not warm up on a client's live list,
- a one-click unsubscribe that is honoured; 05 writes opt-outs to a suppression list that
  04 reads on every run.

## GDPR and PDPA, briefly

B2B outreach on legitimate interest is workable in the EU and UK when the message is
relevant, the sender is identifiable, and opting out is easy - all three are structural
here. What is not workable: a bought consumer list, personal addresses, or ignoring a
deletion request. The suppression list in 05 is the deletion mechanism. It is checked
before every send and never cleared.

## What to tell a client who wants 10,000 emails a month

That we will not build it, why (the two sections above), and what we build instead: under
100 a day, researched, with a reply rate that makes the smaller number worth more money.
If they still want volume they want a different vendor, and hearing that on the discovery
call is a good outcome for everyone.
