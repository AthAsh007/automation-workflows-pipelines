# Validate, normalise and deduplicate webhook leads before forwarding to a CRM

**Who's it for**
Marketing and sales ops teams whose landing pages, ad forms and partners all post leads straight into the CRM, along with typos, throwaway addresses, bots and the same person three times. The CRM only sees leads that pass.

**How it works**
1. Each form posts its lead to `Receive a lead`. A manual run pushes 7 sample leads through the same rules.
2. Field names are matched loosely (email, Email, email_address), and a filled honeypot field marks the lead as a bot.
3. The email is trimmed and lower-cased, common typos like gmial.com are corrected, and syntax and `DISPOSABLE_PROVIDERS` are checked. Phone numbers become E.164 and names become proper case, including O'Neill and Smith-Jones.
4. A lead whose email or phone was accepted in the last `DEDUPE_HOURS` hours is a duplicate. The hash is kept in workflow static data on live runs.
5. The form gets 200 with a lead id, 200 with duplicate true, or 422 with every reason. Accepted leads are posted to `CRM_WEBHOOK_URL` on a live run.

**How to set up**
1. Run it once as imported. It validates the sample leads and stops at `STOP: not live - lead not forwarded`.
2. Point your forms at the production URL of `Receive a lead` and show the 422 reasons next to the form fields.
3. Set `CRM_WEBHOOK_URL` to your CRM or automation inbound webhook and check `REQUIRED_FIELDS`.
4. Send a few test submissions and read the replies, then set `TEST_RUN = false` to forward.

**Requirements**
- Web forms that can POST JSON
- A CRM or tool with an inbound webhook URL

**How to customize**
- `DISPOSABLE_PROVIDERS` and `DOMAIN_TYPOS` are plain lists you can extend.
- `DEDUPE_HOURS` sets how long a repeat counts as a duplicate.
- `DEFAULT_COUNTRY_CODE` decides how local phone numbers are read.
