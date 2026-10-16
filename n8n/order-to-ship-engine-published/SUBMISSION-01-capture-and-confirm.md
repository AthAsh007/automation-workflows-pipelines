# Log Shopify, Etsy and Square orders to a Google Sheet and confirm by email

**Who's it for**

Small makers and studios taking orders from more than one storefront, who still retype each one into a spreadsheet and write the confirmation email by hand.

**How it works**

A store webhook posts an order. `read the order` works out whether the payload is Shopify, Etsy or Square and pulls the same facts out of each shape; a Square order whose deposit has not landed is held. The order is matched against the board so a retried webhook is never written twice, every line item is checked against the product rules, and the ship window is worked out in working days from the longest lead time. The row is written to the sheet **before** the confirmation email goes out, then stamped confirmed. Every path ends at `Reply to the store`, so the storefront stops retrying whichever way the order went.

**How to set up**

1. Open `config`, set `BOARD_SHEET_ID` and `BOARD_TAB`, then set `BOARD_READY = true`.
2. Attach Google Sheets and Gmail credentials to the four `[cred]` nodes.
3. Point the store webhook at this workflow's production URL.
4. Leave `TEST_RUN = true` for the first run, read the preview, then set it to `false`.

**Requirements**

A Google Sheets credential, a Gmail credential, and an `Orders` tab with the headings listed in `config`. A blank setting skips a step rather than failing the run, so the workflow can be run end to end on the built-in demo board before any credential exists.

**How to customize**

`PRODUCT_RULES` holds the lead time and wall-anchor rule per sku; the two buffer values set how wide the promised window is. Email wording lives in `compose the confirmation`, and the board column headings and stage names are both in `config`.
