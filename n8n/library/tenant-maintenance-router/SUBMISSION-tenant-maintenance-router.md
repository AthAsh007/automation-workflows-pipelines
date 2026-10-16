# Route tenant maintenance requests from a form to vendors by trade and urgency

**Who's it for**
Property managers and small landlords who get repair requests by text, email and phone and then forward each one to the right contractor by hand. Every request gets a ticket number, a vendor and a deadline within a minute.

**How it works**
1. A tenant fills in the form with their unit, area, category and a description. A manual run uses a sample gas-smell report.
2. The description is checked for emergency phrases (gas, flood, burst pipe, no heat, sparks, sewage) and urgent ones (leak, no hot water, fridge). That sets the level and a deadline of 4 hours, 24 hours or 5 days.
3. The category maps to a trade. Emergency phrases can override it, so a gas smell reported under Appliance still goes to a gas-safe heating engineer.
4. The Vendors tab is filtered by trade and area. Emergencies only go to vendors marked for emergency call-outs, then the lowest Priority number wins. With no match, the property manager gets the job.
5. The vendor gets a work order, the tenant gets a confirmation with the ticket id and deadline, the manager is copied on emergencies and the ticket is logged.

**How to set up**
1. Run it once as imported. It routes the sample request and stops at `STOP: preview - nothing sent`.
2. Create Vendors (Vendor, Trade, Email, Areas, Emergency, Priority) and Tickets tabs, connect Google Sheets and set `MAINTENANCE_SHEET_ID`.
3. Connect Gmail, set `MANAGER_EMAIL`, and edit the Area options on the form to your patches.
4. Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.

**Requirements**
- A Google Sheet with Vendors and Tickets tabs
- A Gmail account

**How to customize**
- `EMERGENCY_PATTERNS` and `URGENT_PATTERNS` decide the level from the description.
- `SLA_HOURS` sets the deadline for each level.
- `CATEGORY_TRADES` and `KEYWORD_TRADES` map requests to the Trade column of your vendors.
