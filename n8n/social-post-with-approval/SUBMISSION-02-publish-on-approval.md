# Publish approved LinkedIn posts from a Google Sheets queue

**Who's it for**
Teams using the companion drafting workflow, who need the approved draft published to a LinkedIn
company page - and need it to be impossible to publish something nobody approved.

**How it works**
Every five minutes it reads the log for a draft awaiting approval. **Most runs do nothing** and end
at `STOP: nothing awaiting`; that is the correct outcome. When a draft is pending, the approval
channel is read and the reply is interpreted. The gate is deliberately strict: every rule in
**`read the approval reply`** is a refusal, because the looser version of each has an obvious way
to publish something unapproved. Before publishing it re-checks that the approved draft is still
the draft on file, so an edit after approval cannot ride through on an old yes.

Publishing is three LinkedIn calls: register the upload, PUT the image bytes, publish the post. The
publish call has retry switched **off** on purpose - a publish that times out may have succeeded,
and retrying double-posts to the company page, which cannot be undone from here. The result is
written back to the log and the bank row is marked used.

**How to set up**
1. Attach LinkedIn, Google Sheets and Discord credentials.
2. Set your LinkedIn organisation URN in **`config`**.
3. Leave `TEST_RUN = true` until you have watched a full approval cycle end at
   `STOP: not published`.

**Requirements**
A LinkedIn company page with API access, the Google Sheet used by the drafting workflow, and the
Discord approval channel.

**How to customize**
The accepted approval words are in **`read the approval reply`**. Read that node before changing
anything - it is the whole security boundary of this pair.
