# The setup interview

Ninety minutes with the person the agent belongs to. Do this before writing any config.

This is the whole deliverable for *Hermes Personal Assistant Setup*, and it's the reason
those engagements succeed or quietly die. An assistant configured from assumptions gets
muted in week two.

## Rules for running it

- **The person who will use it must be in the room.** Not their chief of staff, not their
  ops lead. If they can't spare ninety minutes, they won't use the agent either, that's
  worth finding out on day one.
- Write the answers down verbatim where you can. Their words become the agent's words.
- Don't propose features. Ask what their week looks like and listen for what's repetitive.

---

## 1. The shape of the day (20 min)

- When does your working day start and end? When do you *actually* look at your phone first?
- Which channel do you already have open all day. And which one do you resent?
- What's the first thing you do at your desk? The last thing before you close the laptop?
- On a bad day, what went wrong? On a good one, what did you get to do?

**Produces:** brief times, delivery channel, and the difference between a good and bad day , 
which is what the "One thing" section of the brief is aiming at.

## 2. What they carry (25 min)

- What do you keep forgetting?
- What do you check repeatedly to make sure it hasn't slipped?
- Who do you owe something to right now? How do you know that?
- What do you get chased about?

**Produces:** the **Owed** and **Waiting** sections. Listen for where the answer is "it's in
my head", that's exactly what the agent is for. Where the answer is "it's in the CRM", the
agent should query it, not duplicate it.

## 3. Voice (15 min)

Ask for **three things they've actually written**. A follow-up, a decline, a nudge. Read
them back. Ask:

- Do you open with the ask or with context?
- Do you use their first name? Sign off how?
- What makes a message from someone else feel like a template to you?

**Produces:** a `preference` memory holding their voice. Guessing at this is the single
fastest way to have the drafts ignored.

## 4. Boundaries (20 min)

- What must this never do without asking you?
- What must it never see? (personal calendar, certain people, certain channels)
- If it's about to be wrong, how would you rather find out. It asks, or it does it and
  tells you?
- Who else can see what it produces?

**Produces:** the approval table from `../_shared/deploy.md`, adjusted and **signed off in
writing**. Do not skip the writing part.

## 5. The first week (10 min)

Agree exactly one thing the agent will do in week one. One brief, one channel, nothing else.

Say plainly that everything else waits for week two. The failure mode of these engagements
is configuring nine capabilities on day one, none of which fit, and losing the person's
attention before any of them get corrected.

---

## After the interview

Send a one-page summary the same day: brief times, channel, the four sections, the approval
table, and the one thing for week one. Ask them to reply "yes" or correct it.

That page is the specification. If they don't reply, you don't have a client yet, you have
someone who liked the meeting.
