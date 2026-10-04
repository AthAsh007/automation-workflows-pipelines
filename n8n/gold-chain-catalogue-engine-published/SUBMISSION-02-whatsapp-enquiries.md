# Answer WhatsApp gold chain enquiries from a Google Sheets price list

**Who's it for**
Jewellery wholesalers who get "22k rope 20 inch, how much?" on WhatsApp all day and want every answer to quote the same approved price list.

**How it works**
Twilio posts each incoming WhatsApp message to the webhook. The workflow reads the Stock tab, then works out what the customer wants: style, karat, length and quantity. Keyword rules always run, and an optional AI model can fill gaps, but only into those fields; it never sees a price and never writes the reply. The reply is decided in order: an opt-out is confirmed and recorded, an order, bulk quantity, custom piece or complaint goes to the owner, a stock question is answered from the sheet at the last approved price, and a vague message is asked for style and karat.

**How to set up**
1. Run **Run the demo messages** first: five invented messages, nothing sent.
2. In `config`, set `SHEET_ID`, `TWILIO_WHATSAPP_FROM` and `OWNER_WHATSAPP`.
3. Connect Google Sheets and Twilio on the `[cred]` nodes and point the sender's incoming webhook here.
4. Set `TEST_WHATSAPP`, then `TEST_RUN = false`.

**Requirements**
A Google Sheet with Stock and Customers tabs and a Twilio WhatsApp sender. An AI key is optional.

**How to customize**
`HANDOFF_QTY` sets when a quantity goes to a person, the keyword lists in `read the message` decide what is recognised, and `STYLES` limits which styles are ever offered. Pair it with the companion repricing workflow, which writes the prices this one quotes.
