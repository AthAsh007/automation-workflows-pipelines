# Send SMS alerts from new Trello cards with Twilio

**Who's it for**
Small sales and service teams who triage new work on a Trello board and want the person named on
the card texted the moment it lands — without anyone watching the board.

**How it works**
A Trello webhook fires when a card appears on the watched list, or you press **Run the demo** to
walk two invented cards through the whole thing. The card is read field by field — name, company,
phone, budget, timeline — from any field or label, so a board that keeps the phone number in the
description works the same as one that uses a custom field. A card with no phone number is routed
to a named STOP node rather than failing the run. The SMS is built from a template in `config`,
then sent through Twilio. Both the accepted and rejected Twilio responses end at their own named
node, so a delivery failure is visible rather than silent.

**How to set up**
1. Open **`config`** and add `TRELLO_KEY`, `TRELLO_TOKEN`, `TRELLO_BOARD_ID` and `TRELLO_LIST_ID`,
   then `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`.
2. Point your Trello webhook at the production URL of the **`When a card arrives`** node.
3. Leave **`DRY_RUN = true`** for the first run — it builds the message and shows it to you
   without sending.

**Requirements**
A Trello account with API access and a Twilio account with an SMS-capable number.

**How to customize**
The message template and the field mapping are both in `config`. To text a different person, change
which field **`read the card`** treats as the phone number.
