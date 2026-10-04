# Source and verify B2B leads with Apify into Google Sheets

**Who's it for**
B2B sales and lead-generation teams who want a repeatable pipeline from "the kind of company I
want" to a verified contact list with a drafted first email, all recorded in Google Sheets.

**How it works**
Two passes that share one spreadsheet.

**Sourcing** starts when you submit the search brief. Companies are sourced, split one per row and
saved. The batch is sent to an Apify actor that finds contact emails from LinkedIn, rows with no
email are dropped rather than carried forward, and what remains is passed to a second Apify actor
that verifies each address. Only verified contacts reach the final tab, so the list you work from
has already had the bounces taken out.

**Outreach** is a separate pass you run when you are ready. It reads the verified leads and the log
of what has already been sent, drops anyone previously contacted, and asks an AI agent - with an
Apify research tool available to it - to draft a first email per lead. The drafts are written back
to the sheet for review rather than sent, so a human approves before anything leaves.

**How to set up**
1. Attach Google Sheets credentials and point each sheet node at your spreadsheet and tab.
2. Attach an Apify credential to the three Apify nodes and set your actor ids.
3. Attach an OpenRouter credential to the model node.
4. Submit the form once with a small search to watch a batch flow through end to end.

**Requirements**
An Apify account with actors for company sourcing, LinkedIn email lookup and email verification, an
OpenRouter API key, and a Google Sheet.

**How to customize**
The tone and structure of the first email is the prompt on **`write the outreach email`**. To change
what counts as a usable lead, edit **`drop rows with no email`**.
