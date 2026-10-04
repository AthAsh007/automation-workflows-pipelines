# Subscribe newsletter signups to Mailchimp from a webhook and welcome them by email

**Who's it for**
Anyone running a newsletter signup form on their own site who wants the subscriber added to
Mailchimp and welcomed immediately, with the form told whether it worked.

**How it works**
Your signup form posts to the webhook. **`validate the signup`** checks the body before anything
else happens, and an invalid payload is answered with an error response rather than being allowed
to reach Mailchimp. A valid signup is looked up first: an address already on the list is updated
rather than re-added, so a repeat signup refreshes the record instead of creating a duplicate or
failing. Either way the subscriber gets a welcome email, and the form receives a success response.
Both outcomes end in an explicit response node, so the browser is never left waiting.

**How to set up**
1. Open **`config`** and set your Mailchimp audience id and the welcome email subject.
2. Attach Mailchimp and Gmail credentials to the `[cred]` nodes.
3. Copy the production URL of **`When someone subscribes`** into your form's action or fetch call.
4. Post a test signup and check the response body.

**Requirements**
A Mailchimp account with an audience, and a Gmail account for the welcome email.

**How to customize**
The welcome email is built in **`[cred] Gmail - send the welcome email`** — swap that node for any
other sender without touching the rest. To capture extra fields, add them in
**`validate the signup`** and pass them through as merge fields.
