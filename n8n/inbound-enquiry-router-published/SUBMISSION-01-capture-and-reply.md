# Log cleaning enquiries to Google Sheets and auto-reply with Gmail

**Who's it for**

Commercial cleaning companies, and any small service business, whose website form fills up faster than anyone can answer it.

**How it works**

Your website form posts to the webhook. `read the form fields` reads the payload whatever the plugin calls its fields — Contact Form 7, WPForms, Gravity Forms, Elementor and Fluent Forms all land cleanly — then honeypot hits and anything with no usable email are dropped. The postcode picks the area owner, longest prefix first, with a fallback owner so nothing falls through. The row is written to Google Sheets **before any email is attempted**, so an enquiry can never be lost to a mail failure. The customer gets a plain acknowledgement asking the three questions you always end up asking anyway; the owner gets the details and a short reference. Every path answers the form, so the visitor never sees a timeout.

**How to set up**

1. Create a sheet with an `Enquiries` tab and the column headings listed in `config`.
2. Attach a Google Sheets credential and a Gmail credential to the three `[cred]` nodes.
3. Open `config` and set `TRACKER_SHEET_ID`, the `AREAS` postcode table and your company details.
4. Point your form plugin at this workflow's webhook URL.

It ships with `TEST_RUN = true` and a blank `TEST_EMAIL`: the sheet row is written but no email goes out, and **STOP: preview - nothing sent** holds both drafts so you can read them. Put your own address in `TEST_EMAIL` to send real emails to yourself, then set `TEST_RUN = false` to go live.

**Requirements**

A Google Sheets credential, a Gmail credential, and a website form that can POST the submission as JSON.

**How to customize**

`QUESTIONS` and `AREAS` in `config` change what you ask and who quotes where. The email wording lives in `write the first reply`, and the sheet columns are named in one `COLUMNS` map.
