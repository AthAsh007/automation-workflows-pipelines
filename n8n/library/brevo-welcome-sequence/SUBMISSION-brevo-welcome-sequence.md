# Send a welcome sequence to new Brevo contacts based on signup source

**Who's it for**
Small teams on Brevo who collect signups from a trial form, webinars and content downloads, and want each group welcomed differently without building three automations in the Brevo editor.

**How it works**
1. Every hour from 08:00 to 18:00 it reads contacts created in the last 7 days from Brevo, or 7 sample contacts until Brevo is connected.
2. The SOURCE attribute picks the variant (trial, webinar, content or default), and the WELCOME_STEP attribute says which email went last.
3. The next email is sent once its day (0, 2 or 5 after signup) arrives. Unsubscribed and hard-bounced contacts stop, contacts who signed up before the sequence existed are left alone, and at most 100 emails go per run.
4. Each email goes through the Brevo transactional API and WELCOME_STEP is updated on the contact, so a step is never repeated.

**How to set up**
1. Run it once as imported. It plans emails for the sample contacts and stops at `STOP: preview - nothing sent`.
2. In Brevo, create the number attribute WELCOME_STEP and a text attribute SOURCE that your forms fill in.
3. Add a Brevo credential to the three Brevo nodes, set `SENDER` to a verified sender and set `USE_BREVO = true`.
4. Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.

**Requirements**
- A Brevo account with transactional email enabled
- Signup forms that set a SOURCE attribute

**How to customize**
- `SEQUENCES` holds the subject and opening line of every email per variant.
- `SOURCE_MAP` maps your SOURCE values to a variant.
- `START_WITHIN_DAYS` and `DAILY_CAP` control who starts the sequence and how many emails one run sends.
