# Triage inbound enquiries with AI and queue voice or video replies

**Who's it for**
Anyone running a "digital clone" or AI persona that answers inbound email - founders, coaches,
agencies - who needs the triage layer in front of it: deciding what each enquiry is, whether it
deserves a written reply, a synthesised voice note or an avatar video, and what the reply says.

**How it works**
An enquiry arrives by webhook, or you press **Run it now** to use the built-in sample. It is
normalised, then classified by a low-latency model into booking, pricing, question, complaint or
spam. If no model key is set - or the call fails or times out - keyword rules classify it instead,
so the workflow never stops because an API did. The intent picks the medium from a table in
`config`: rendering costs money and takes time, so the default is text and an enquiry has to earn
its way up to video. Low confidence is never allowed to buy an expensive medium. Complaints, legal
and press are routed to a person and get no automated answer of any kind. Voice and video requests
are handed to the companion render workflow; everything else is answered in writing.

**How to set up**
1. Open **`config`**: set `CLONE_NAME`, `CLONE_ROLE` and `CLONE_SCOPE`, then the `MODE_FOR` table.
2. Add an LLM key, or leave it blank to run on keyword rules.
3. Paste workflow 02's production webhook URL into `RENDER_WEBHOOK_URL`.
4. Leave **`DRY_RUN = true`** and open **`STOP: preview - nothing queued`** to read the decision.

**Requirements**
An OpenAI-compatible endpoint (optional), and the companion render workflow for voice and video.
The booking link and report webhook are optional.

**How to customize**
`MODE_FOR` decides which intent gets which medium; `HANDOFF_INTENTS` decides what a human answers.
The reply wording is in **`decide the reply and the medium`**.
