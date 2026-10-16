# Win back gym members with no recent check-ins via Gmail

Each week reads members and their last check-in from Google Sheets, puts inactive members on a 14, 30 or 60-day tier with its own offer, skips frozen, cancelled, opted-out and recently contacted members, emails up to a weekly cap and writes the contact date back.

Import `gym-member-win-back-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Independent gyms, studios and climbing walls that track members in a spreadsheet and notice lapsed members only when they cancel. It catches people at two weeks away, while a friendly nudge still works.

## How it works

1. Every Tuesday at 10:00 it reads the Members tab, or 10 sample members until a sheet is set.
2. Days inactive = days since the last check-in, or since joining for someone who never came. Members inactive 14, 30 or 60 days land on that tier, each with its own offer and tone.
3. Frozen and cancelled memberships, opted-out members, members who joined in the last 14 days and anyone contacted in the last 30 days are held back with a reason.
4. The 14-day tier goes first because those members come back most often, then `WEEKLY_CAP` applies. Each email is sent through Gmail and the contact date and offer are written to the member row.

## Sections on the canvas

1. **Start and settings.** Runs every Tuesday at 10:00, after the Monday rush shows who did not come back. Tiers, offers, the cooldown and the weekly cap all live in `config`.
2. **Read members.** One read of the Members tab gives status, join date, last check-in and last contact in a single row per member. `Load sample members` covers every hold-back rule until `MEMBERS_SHEET_ID` is set.
3. **Pick tiers and write emails.** Hold-back rules run before tiering, so a frozen member at 60 days never gets the half-price offer. A member who joined and never came uses the join date and gets different wording.
4. **Send and record.** Nothing is emailed while `TEST_RUN` is true and `TEST_EMAIL` is blank. Only a live run writes Last contacted, which is what the 30-day cooldown reads next week.

## Setup

1. Run it once as imported. It previews against sample members and stops at `STOP: preview - nothing sent`.
2. Make sure your Members tab has Member ID, Name, Email, Status, Joined, Last check-in, Last contacted and Opt out columns, connect Google Sheets and set `MEMBERS_SHEET_ID`.
3. Connect Gmail and edit the offers in `TIERS` and the sign-off in `GYM_NAME`.
4. Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `MEMBERS_SHEET_ID` | `''` | Google Sheets id holding the Members tab; blank uses sample members |
| `TIERS` | `[{"tier":1,"days":14,"offer":"a free ses` | days inactive that unlock each tier, the offer and the subject line |
| `CONTACT_COOLDOWN_DAYS` | `30` | members contacted this recently are skipped |
| `NEW_MEMBER_DAYS` | `14` | members who joined this recently are never chased |
| `SKIP_STATUSES` | `["frozen","cancelled","canceled","paused` | membership statuses that are never emailed |
| `WEEKLY_CAP` | `40` | hard ceiling on emails per run |
| `GYM_NAME` | `'Northside Strength'` | used in subjects and the sign-off |
| `BOOKING_URL` | `'https://northside-strength.example/book'` | link in every email |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read the Members tab`
- `Email the member`
- `Record the contact date`

## Requirements

- A Google Sheet of members with a last check-in date
- A Gmail account

## Customising

- `TIERS` sets the day thresholds, offers and subject lines.
- `CONTACT_COOLDOWN_DAYS` stops the same member hearing from you more than once a month.
- `WEEKLY_CAP` limits emails per run so front desk can handle the replies.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 10 | none | `Summarise the run`, `STOP: preview - nothing sent` |
| live send and write-back | 13 | `Email the member`, `Record the contact date` | `Summarise the run`, `Record the contact date` |
