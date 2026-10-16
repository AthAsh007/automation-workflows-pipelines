# Send shipping emails with tracking from a Google Sheet via ShipStation

**Who's it for**
Small ecommerce operations whose office already works out of a Google Sheet and who want the
shipping notification to go out on its own — without anyone remembering to send it, and without a
customer ever getting a ship notice that has no tracking number in it.

**How it works**
Twice each weekday the workflow reads the whole Orders tab once and does two jobs. It ships: any
row the office has flipped to **Shipped** that has not yet had its shipping email goes out, but only
if the confirmation was recorded and a tracking number exists — pasted on the row, or pulled from
ShipStation. It also audits: any row marked shipped that was never confirmed is surfaced rather
than emailed. Once the email is away the row is marked, so the next run leaves it alone. The sheet
stays the contract: flipping the Stage cell is the only trigger, and rows only move when the
workflow has proof.

**How to set up**
1. Open **`config`** and set your sheet id, the tab name and the send window.
2. Attach Google Sheets and Gmail credentials to the `[cred]` nodes.
3. Optionally add a ShipStation key — leave it blank and tracking is read from the row only.
4. Leave **`DEMO_MODE = true`** for the first run; it uses the demo board and sends nothing.

**Requirements**
A Google Sheet with an Orders tab carrying a Stage column, a Gmail account, and optionally a
ShipStation account for tracking lookup.

**How to customize**
The email copy is in **`compose the shipping email`** and the stage names are in `config`. To ship
from a different board, change the field map in **`read the board`** — nothing downstream cares.
