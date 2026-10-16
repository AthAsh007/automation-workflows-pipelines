# School iPad booking bot (n8n + Kapso)

Teachers chat on WhatsApp to book the school's iPads. School hours are 07:00–12:00 and there are no fixed slots: any start and end inside those hours can be booked.

```
WhatsApp -> Kapso webhook (?token=...) -> [01 orchestrator]
   config -> Read message -> School clock -> Needs the agent?
                                               | yes                         | no (media / unknown number)
                                   AI Agent (LLM + per-phone memory)         |
                                               |                             |
                                   ai_tool ──┬── book_ipads          -> 02   |
                                             ├── cancel_booking      -> 03   |
                                             ├── check_availability  -> 04   |
                                             └── list_my_bookings    -> 05   |
                                               |                             |
                                         Prepare reply  <────────────────────┘
                                               |
                                   Send reply on WhatsApp (Kapso API, Header Auth credential)
```

| # | File | n8n workflow name | What it does |
|---|---|---|---|
| 1 | `01-orchestrator.json` | WhatsApp Chatbot Orchestrator | Webhook → AI Agent → one WhatsApp reply, sent straight to Kapso. Works out intent, asks for missing details, confirms before booking/cancelling. |
| 2 | `02-book-the-slot.json` | Tool: Book the slot | Validates date / times / count, refuses exact repeats, checks which iPads are free for the whole window, appends the booking. |
| 3 | `03-cancel-the-slot.json` | Tool: Cancel the slot | Cancels one of the teacher's upcoming bookings by `booking_id` (or their only one). |
| 4 | `04-check-availability.json` | Tool: Check availability | Free iPads for an exact window, or the start times that work on a morning / over the coming days. |
| 5 | `05-my-bookings.json` | Tool: My bookings | The teacher's upcoming bookings with their IDs. |

Tools 02–05 return `{ toolResult: { action, success, data } }` with `data.reply`, a ready-made line for the teacher. There is no separate send workflow any more: 01 posts the reply to Kapso itself, so all the Kapso settings live in 01.

## Rules the bot follows

- **Never invents details.** A booking needs a date, a start time, an end time and a number of iPads. Anything missing gets asked for.
- **Confirms before changing data.** Booking and cancelling are proposed first and only run after the teacher replies "yes". The agent's final answer *is* the WhatsApp reply, so the window-buffer memory (keyed by phone number) holds the proposal and the next message can confirm it.
- **Exactly one reply per turn.** *Prepare reply* always produces one message: the agent's answer, a fixed reply (media messages, numbers not on the allow-list), or an apology if the agent failed (LLM error, too many steps, empty answer). The failure reason is kept in `agent_error` on that item for the execution log.
- **Uses the sender's number, never one from the LLM.** Every tool takes `phone` from the incoming message (`$json.from` of the item the agent is working on), so in a batched webhook each teacher gets their own number, and nobody can list or cancel someone else's bookings by typing another number.
- **Only real Kapso calls count.** The webhook must be called with `?token=<WEBHOOK_TOKEN>`. Anything else is dropped without a reply. While the token is still the placeholder (or shorter than 16 characters) every webhook call is dropped.
- **No double handling.** Message ids already handled in the last 24 h are skipped (Kapso retries slow webhooks), several messages from one teacher in one batch become one turn, and *Book the slot* answers an exact repeat (same teacher, date, times and count) with the existing booking instead of booking again.
- **Validated by the tools as well.** Booking rejects impossible dates (2026-02-31), times outside school hours, times in the past, closed days (`CLOSED_WEEKDAYS`, Sunday by default), dates more than `MAX_DAYS_AHEAD` days out, and anything over `MAX_DEVICES_PER_BOOKING`. Availability never reports closed days or past times as free.
- **Upcoming means not ended yet.** A booking from earlier today that has finished is no longer listed and can't be cancelled.

## Setup

1. **Google Sheet** with two tabs, using the headers in `dummy-sheets/`:
   - `Devices`: `device_id, label, model, status, location`. Only rows with `status = available` can be booked.
   - `Bookings`: `booking_id, phone, teacher_name, date, start_time, end_time, device_ids, devices, status, created_at`.
2. **Kapso credential.** In n8n create a **Header Auth** credential: name `X-API-Key`, value your Kapso API key. The key lives only there, so it never appears in a node or in execution data.
3. **Import 02–05 first**, each as its own workflow, keeping the workflow names above. In each one:
   - open **config** and replace the `PUT ... HERE` Sheet ID;
   - check `TIMEZONE` (default `Asia/Kolkata`);
   - attach your Google Sheets credential to the Sheets nodes.
4. **Import 01.**
   - Open each tool node (`book_ipads` … `list_my_bookings`) and pick the matching workflow in the *Workflow* dropdown.
   - Attach your OpenRouter credential to the chat model, and the Kapso Header Auth credential to **Send reply on WhatsApp**.
   - In **config**:
     - `KAPSO_PHONE_NUMBER_ID`: your Kapso phone number ID.
     - `WEBHOOK_TOKEN`: a long random string you make up (e.g. `openssl rand -hex 24`). The same value goes into the Kapso webhook URL in step 5.
     - `ALLOWED_PHONES` (optional): the teachers' numbers, digits with country code. Leave it empty to allow anyone.
     - `DRY_RUN`: ships `true`, so every reply is prepared and stops at `STOP: dry run - reply not sent` instead of reaching WhatsApp. Set it to `false` once the demo replies read right.
   - Optional: under *Workflow settings → Error workflow*, pick your alerting workflow so crashes outside the agent reach you.
5. **Activate** 02–05, then 01. In Kapso, set the inbound-message webhook to `POST <n8n>/webhook/school-ipad-booking?token=<WEBHOOK_TOKEN>`, using the same token as in 01's config.
6. **Test.** Each workflow has a *Run demo* manual trigger with a sample request (the demo in 01 skips the token check). Run the sub-tools on their own before chatting with the bot.

The workflow ID fields in 01 ship blank, so pick each tool workflow as in step 4. If the old **Tool: Send WhatsApp** workflow is still on your instance, deactivate or delete it: nothing calls it now, and its config node may still hold the old API key.

## Folders

- `dev/`: the source of the code nodes and the agent prompt, plus `build.js` (rebuilds 01–05 from fresh n8n exports; the old *Send WhatsApp* export is only used as the template for 01's Kapso node; refuses to write anything that looks like a secret, and checks every connection points at a real node) and `test.js` (runs the code nodes against `dummy-sheets/` with a mocked n8n runtime). Run with `cd dev && bun install && bun test.js ../dummy-sheets`, and rebuild with `bun build.js ../_raw-exports ..`.
- `_raw-exports/`: live exports straight from n8n. **They can contain real API keys, so the folder is git-ignored.** Do not commit it.
- `legacy/`: an earlier standalone (non-n8n) version of the bot, kept for reference.

## Known limits

- Two teachers confirming a booking at the same moment could both get the same iPad, because Google Sheets has no locking. Booking IDs carry a random 2-character tag (`BK-0012-K7`) so they stay unique, but the iPad overlap would need a database to rule out completely. That's fine at school scale.
- The webhook is protected by a secret token in the URL, not by Kapso's request signature. Treat the full webhook URL like a password.
- School hours, closed days and the time zone are set in the config node of each workflow that needs them. `build.js` writes them all from one place; if you change them in the n8n UI, change every copy.
