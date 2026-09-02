# Delivery Checklist, Enrichment Waterfall

**For:** *Looking for an n8n Expert to Automate Workflows and Boost Lead Generation* (post 14)

The post is deliberately broad, "automate various parts of my business and streamline lead
generation", which means the client has not scoped it yet and the first deliverable is a
scope, not a workflow. This checklist is the order that gets from a vague post to a signed
S$1,100 build without a discovery call that goes nowhere.

Template 14's `workflow-v2.json` is what you demo in §2 and deliver in §5.

---

## 0. Before you reply to the post

- [ ] Run `cd demo && node simulate.js` and `python validate.py`. Both green. You are about
      to claim this works; check that it does today, on the current export.
- [ ] Have the dry run ready to screen-share. It needs no keys, so it survives a call where
      the client has not sent anything yet.
- [ ] Read [`../_shared/credentials.md`](../_shared/credentials.md). The two questions there
      decide the quote.

**The reply, in three lines:** what the waterfall does, that the guess gets thrown away
unless a third party confirms it, and one sentence offering to run it on five of their
records live. Do not attach the JSON to the first message. The demo is the hook, the file
is the deliverable.

---

## 1. Discovery. The questions that decide the quote

Ask all of these in one message. Chasing them one at a time is the single biggest reason a
two-week build takes six.

- [ ] **"Is your Apollo plan on a tier that includes API access?"** The entry tier does not.
      If it is not, the waterfall starts at RocketReach and list quality drops measurably —
      say so **before** the quote, not after.
- [ ] **"Which email verifier do you already pay for?"** NeverBounce, ZeroBounce and
      MillionVerifier are all one line in `config`. A fourth is S$250.
- [ ] **"Where do the leads come from today?"** Clay table, a Google Sheet, a CRM export, or
      a person doing it by hand. This decides whether they need template 08 in front of this
      one.
- [ ] **"What happens to the enriched lead next?"** If the answer is "we email it", the
      conversation is 14 + 12, not 14 alone.
- [ ] **"What's your current bounce rate?"** If they know it, they have been burned and the
      discarded-guess argument sells itself. If they do not know it, that is the first thing
      you tell them to measure.
- [ ] **"How many rows a month?"** Under ~2,000 this is a fixed-price build. Above that,
      talk about batching and a retainer.

Do not quote until every box above has a written answer.

---

## 2. The demo call, three runs, ten minutes

Follow [`demo/README.md`](demo/). The order matters more than the content.

- [ ] **Run 1, no keys.** Blank in, blank out, `providers_skipped` populated.
      Say: *"It built the guess and threw it away, because nothing confirmed it — and it
      tells you it never looked, rather than looking like it looked and found nothing."*
- [ ] **Run 2, verifier key only.** Same guess survives at `confidence: 55`,
      `recommended_action: "review"`. Say: *"Four tenths of a cent. And it's still not
      cleared to send."*
- [ ] **Run 3, the catch-all.** `confidence: 75`, above the send line, still `review`.
      Say: *"A catch-all accepts everything, so not bouncing proves nothing. Own segment,
      sent last."*
- [ ] Offer to run it live on **five of their own records** before they pay anything. This
      is the close. Almost nobody else offers it, because almost nobody else's template
      runs without credentials.

---

## 3. Before they hand over a single key

- [ ] Confirm **whose account the keys belong to**. The client runs this on the client's
      own keys. Apollo, RocketReach and Clay all restrict re-selling or re-exporting their
      data — we never pull records on our key and hand them over.
- [ ] Keys go into the `config` node on **their** n8n, entered by them or pasted while
      screen-sharing. Never into chat, never into a shared doc, never into the JSON you send.
- [ ] Check the exported file one more time before sending:
      `grep -o "_API_KEY = '[^']*'" workflow-v2.json` — three empty strings, no exceptions.
- [ ] Agree the thresholds **in writing**: `MIN_CONFIDENCE_TO_SEND` and
      `MIN_CONFIDENCE_TO_REVIEW`. Defaults are 70 and 40. They are in the config node so
      that the number in the contract and the number in the workflow are the same number.

---

## 4. Build

- [ ] Import `workflow-v2.json` into their instance.
- [ ] Fill `config`. Leave blank anything they do not have yet. It degrades, it does not
      break, and they can add the key later without you.
- [ ] Set `VERIFIER` to whichever vendor they actually pay for.
- [ ] Execute once on the pinned sample. Confirm the response shape on screen with them.
- [ ] Activate. Copy the **production** URL, not the test URL. The test URL works exactly
      once and then silently stops, and it is the most common failure with these templates.
- [ ] Add the Clay **HTTP API** column together, on the call, with them driving. Body is in
      the README. Do not do this for them off-call; the column is the part they will need to
      change later.
- [ ] Map the response into Clay columns: `email`, `email_status`, `confidence`,
      `recommended_action`, `tried`.

---

## 5. Acceptance. Run these, with them watching

- [ ] **A record you know is in Apollo** → `email_source: "apollo"`, confidence 95–100.
- [ ] **A record you know is not in Apollo** → falls through to RocketReach or the guess.
      This is the test that proves it is a waterfall and not one API call.
- [ ] **A junk domain** → blank, `confidence: 0`, `recommended_action: "do_not_send"`.
- [ ] **The same record twice** → identical `lead_id`, so re-running costs providers but
      never creates a duplicate row downstream.
- [ ] **A record with no `lead_id`** → one is minted, `lead_id_generated: true`.
- [ ] Check the execution list: the runs that found nothing are visible under
      **STOP: no address found**, not vanished.

---

## 6. Handover

- [ ] 20-minute recording covering exactly three things: where the keys live (the `config`
      node), how to change a threshold, and how to read `providers_skipped` when a column
      comes back blank.
- [ ] Send `config.example.js` and `demo/` with the recording. The demo folder is what lets
      them re-run the scenarios themselves after you are gone.
- [ ] Written note of the agreed thresholds and the cost model. One verifier credit per
      lead that has an address, provider credits only for the steps that run.
- [ ] Tell them the one thing that will break it: **an expired verifier key returns
      `unknown`, not an error.** Enrichment quietly gets worse instead of stopping. Put a
      calendar reminder on the credit balance.

---

## 7. The upsell, in order

Do not pitch these on the build call. Pitch them once the waterfall has run a week and they
have seen the numbers.

1. **A fourth provider**, S$250. The obvious one, and the smallest ask.
2. **Template 08 in front**, S$900. Only if their list building is still manual.
3. **Template 12 behind**. The sender that enforces the same thresholds this workflow
   assigns. This is the one that produces meetings, and it is a much easier sell after they
   have watched confidence scores be right for a fortnight.
4. **Template 10**, deliverability watchdog. Sell it the first time a bounce rate moves.

---

## 8. What we do not agree to

- [ ] **No scraping LinkedIn or Sales Navigator as a human.** If they ask, the answer is
      the RocketReach step and template 05's task queue — see the top-level README.
- [ ] **No sending on our infrastructure or our keys.**
- [ ] **No "just send the guess if you can't find a real one."** This is the one to hold the
      line on, politely and once: the unconfirmed guess is exactly what burns a sending
      domain. Note what `PATTERN_GUESS_ENABLED` actually does — **off** stops the workflow
      guessing at all; there is no setting that ships an unconfirmed guess, because the
      discard is in `score confidence`, not behind a flag. If a client insists, that is a
      code change, quoted separately, and agreed in writing that it is against our advice.
