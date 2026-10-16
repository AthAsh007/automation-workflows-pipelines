# Send a welcome sequence to new Brevo contacts based on signup source

Every hour, reads Brevo contacts created in the last week, picks a welcome variant from their SOURCE attribute, sends the day 0, 2 and 5 emails through the Brevo transactional API one step at a time, and stops for anyone who unsubscribed.

Import `brevo-welcome-sequence-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Small teams on Brevo who collect signups from a trial form, webinars and content downloads, and want each group welcomed differently without building three automations in the Brevo editor.

## How it works

1. Every hour from 08:00 to 18:00 it reads contacts created in the last 7 days from Brevo, or 7 sample contacts until Brevo is connected.
2. The SOURCE attribute picks the variant (trial, webinar, content or default), and the WELCOME_STEP attribute says which email went last.
3. The next email is sent once its day (0, 2 or 5 after signup) arrives. Unsubscribed and hard-bounced contacts stop, contacts who signed up before the sequence existed are left alone, and at most 100 emails go per run.
4. Each email goes through the Brevo transactional API and WELCOME_STEP is updated on the contact, so a step is never repeated.

## Sections on the canvas

1. **Start and settings.** Runs hourly in working hours, so a day 0 email arrives within an hour of signup. Every subject, opening line and source mapping is in `config`.
2. **Read new contacts.** Only contacts created in the last week are read, filtered by Brevo itself with createdSince. `Load sample contacts` covers every sequence decision, including an unsubscribe and a pre-existing contact.
3. **Pick the next step.** The step already sent lives on the contact in WELCOME_STEP, so the sequence survives a reinstall and is visible in Brevo. `START_WITHIN_DAYS` stops the first run from emailing everyone who joined last week.
4. **Send and record.** Nothing is sent in preview. A test send goes to `TEST_EMAIL` and leaves WELCOME_STEP alone; only a live send moves the contact on to the next step.

## Setup

1. Run it once as imported. It plans emails for the sample contacts and stops at `STOP: preview - nothing sent`.
2. In Brevo, create the number attribute WELCOME_STEP and a text attribute SOURCE that your forms fill in.
3. Add a Brevo credential to the three Brevo nodes, set `SENDER` to a verified sender and set `USE_BREVO = true`.
4. Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_BREVO` | `false` | set true after adding the Brevo credential to the three Brevo nodes |
| `SENDER` | `{"name":"Mara at Tallyroom","email":"hel` | verified Brevo sender |
| `SEQUENCE_DAYS` | `[0,2,5]` | days after signup for steps 1, 2 and 3 |
| `SOURCE_MAP` | `{"trial":"trial","free-trial":"trial","w` | SOURCE attribute value (lowercase) -> variant; anything else uses default |
| `SEQUENCES` | `{"trial":[{"subject":"Your trial is read` | per variant: one entry per step with subject and opening line (avoid apostrophes) |
| `START_WITHIN_DAYS` | `1` | contacts older than this with no step sent never start (protects existing contacts on day one) |
| `DAILY_CAP` | `100` | hard ceiling on emails per run |
| `UNSUBSCRIBE_URL` | `'https://www.yourcompany.example/unsub...'` | your unsubscribe page; the contact email is appended as ?email= |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Fetch new Brevo contacts`
- `Send through Brevo`
- `Record the step on the contact`

## Requirements

- A Brevo account with transactional email enabled
- Signup forms that set a SOURCE attribute

## Customising

- `SEQUENCES` holds the subject and opening line of every email per variant.
- `SOURCE_MAP` maps your SOURCE values to a variant.
- `START_WITHIN_DAYS` and `DAILY_CAP` control who starts the sequence and how many emails one run sends.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 11 | none | `STOP: preview - nothing sent` |
| live with Brevo | 14 | `Send through Brevo`, `Record the step on the contact` | `Record the step on the contact` |
