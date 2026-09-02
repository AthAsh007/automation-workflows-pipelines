# Running a template safely

These templates send email, send SMS, place calls, publish posts and write to
CRMs. A misconfigured first run reaches real people. This is how each layer stops
that, and what you have to do deliberately to switch a layer off.

## The four layers

**1. Preview is the shipped default.**
Every template carries `TEST_RUN = true` (or `preview: true`, or `DRY_RUN = true`)
in its `config` node. In that state, a named `STOP:` node sits in front of every
send, write, publish and call, and the branch ends there. The run completes, the
execution list shows exactly which items would have been acted on, and nothing
leaves the machine.

**2. Fixture data cannot reach anyone.**
Every sample contact is at a domain under `.example`. RFC 2606 reserves that
top-level domain: it has no DNS delegation, so it cannot resolve and cannot
receive mail. Fixture phone numbers use the `555-01xx` range, which is reserved
for fictional use in North American numbering.

Do not swap a fixture address for your own to "test properly". Use `TEST_EMAIL`,
which redirects a real send to one address you control without changing anything
else about the run.

**3. Test mode redirects, it never enables.**
Setting `TEST_EMAIL` to a real address turns preview into test. In test mode the
workflow actually sends, but every message goes to that one address, and the
write-back gate stays shut, so nothing is marked as contacted. Going live is a
separate, deliberate act: setting `TEST_RUN = false`.

**4. Caps are enforced in code.**
`DAILY_CAP` is a counter checked in a Code node, not a comment describing intent.
A template that would exceed it stops and reports how many items it held back.

## Before a first live run

- [ ] Read the template's README section headed **What it deliberately does not do**.
- [ ] Replace every fixture row with your own data. Confirm no `.example` address
      survives into the sheet you point the workflow at.
- [ ] Configure the credentials the `[cred]` nodes name. Leave every optional key
      blank on the first run and confirm the workflow completes with those branches
      skipped.
- [ ] Run once with `TEST_RUN = true` and read the whole execution list. Every
      `STOP:` node tells you what it dropped and why.
- [ ] Run once with `TEST_EMAIL` set to an address you own. Read what actually
      arrives, including the attachments.
- [ ] Set `DAILY_CAP` to something small for the first live run. Raise it after a
      full day of clean output, not before.
- [ ] Confirm your suppression list is loaded and that the workflow reads it. An
      empty suppression list is indistinguishable from a working one until the
      first complaint.

## What no template can do for you

**Consent.** None of these workflows can tell you whether you are allowed to
contact a given person. That answer comes from where the record came from and
which jurisdiction the recipient is in. See [COMPLIANCE.md](COMPLIANCE.md).

**Deliverability.** Verification reduces bounces. It does not warm a domain, set
up SPF, DKIM and DMARC, or stop a cold campaign from a primary domain damaging the
domain you also send invoices from.

**Judgement about content.** The model in a template writes a subject line and an
opening sentence from facts the workflow assembled in code. It does not know
whether the claim in your template body is true.

## Reporting a problem

If a template can reach a real person from a clean import with no configuration,
that is a security issue, not a bug. See [../SECURITY.md](../SECURITY.md).
