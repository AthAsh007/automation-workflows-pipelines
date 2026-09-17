# Newsletter signup to Mailchimp

Subscribe newsletter signups to Mailchimp from a webhook and welcome them by email.

**Import** [`workflow.json`](workflow.json). 10 nodes, one file. The smallest workflow here.

## Who it is for

Anyone running a newsletter signup form on their own site who wants the subscriber added
to Mailchimp and welcomed immediately, with the form told whether it worked.

## How it works

Your signup form posts to the webhook. The validation node checks the body before anything
else happens, and an invalid payload is answered with an error response rather than being
allowed to reach Mailchimp. A valid signup is looked up first: an address already on the
list is updated rather than re-added, so a repeat signup refreshes the record instead of
creating a duplicate or failing. Either way the subscriber gets a welcome email, and the
form receives a success response.

Both outcomes end in an explicit response node, so the browser is never left waiting.

## Setting it up

1. Open the `Config` node and set your Mailchimp audience id and the welcome email subject.
2. Attach Mailchimp and Gmail credentials to the credential nodes.
3. Copy the production URL of the webhook node into your form's action or fetch call.
4. Post a test signup and check the response body.

## Requirements

A Mailchimp account with an audience, and a Gmail account for the welcome email.

## Changing what it does

The welcome email is built in the Gmail send node. Swap that node for any other sender
without touching the rest. To capture extra fields, add them in the validation node and
pass them through as merge fields.

The email body ships with a placeholder link at `example.com`. Point it at your own
newsletter before you send to anyone.

## Pinned data

The pinned sample on the webhook node is one signup body. Request-tracing headers from the
original capture have been replaced with placeholders.
