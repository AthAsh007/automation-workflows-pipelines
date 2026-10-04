# Send cold outreach from a lead file and detect replies in Gmail

**Who's it for**
Small sales teams running cold email who want three things joined up: importing a lead list,
sending the first touch, and knowing the moment somebody replies with interest - without watching
an inbox.

**How it works**
Three flows around one lead table.

**Import** - upload a CSV or spreadsheet through the form. The rows are read and upserted into the
lead table, so re-uploading a corrected file updates people rather than duplicating them.

**Send** - on a schedule, or on demand, the offer settings are loaded and the leads not yet
contacted are read. Each gets the outreach email through Gmail, the sent message is recorded, and
the lead row is marked contacted. Marking after the send is what stops a crash re-mailing anyone.

**Reply detection** - a Gmail trigger fires on an incoming message. It is matched back to a lead,
stored, and the whole thread is pulled so the classifier reads the conversation rather than one
message. Only the prospect's own messages are kept - feeding your own sent copy back to the model
is how a reply classifier convinces itself every thread is interested. An AI agent returns a typed
classification against a fixed schema, and an interested prospect is flagged for human handoff.

**How to set up**
1. Attach Gmail credentials to the send node and the trigger, and set the sender address.
2. Fill in **`config: the offer`** with your offer, subject line and email body.
3. Create the data tables for leads, sent messages and received messages.
4. Attach an OpenRouter credential to the model node.

**Requirements**
A Gmail account, an OpenRouter API key, and n8n data tables for leads and messages.

**How to customize**
The email copy lives in **`config: the offer`**. What counts as interested is the prompt on
**`classify the reply`** plus **`reply classification schema`** - change them together.
