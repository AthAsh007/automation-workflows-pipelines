# The production board

One tab, `Orders`, with the headings in `Orders.csv` — generated from the `config` node's
column list so the tab and the workflow can never disagree about a heading.
`validate.py` fails if they drift.

| File | Becomes | Why |
|---|---|---|
| `Orders.csv` | the **Orders** tab | the production board itself. Headings only — the workflows fill it. |
| `Lists.csv` | the **Lists** tab | the options behind the Stage dropdown |

## Naming it

**The spreadsheet file** (`Production Board` or similar) is a free choice — n8n addresses
it by id, not name, so it can be renamed without breaking anything. Avoid dates, `v2`,
`final` or anyone's initials; it is a living document.

**The tab: `Orders` — this one is load-bearing.** It must match `BOARD_TAB` in the
`config` node exactly, capitalisation included. Rename the tab and both workflows stop
finding it.

## Import — about five minutes

1. New Google Sheet → **File → Import → Upload → `Orders.csv`**.
   Import location: **Replace spreadsheet**. Separator: Detect automatically.
2. Rename the tab to **Orders**.
3. **File → Import → Upload → `Lists.csv`**, location **Insert new sheet**. Rename to
   **Lists**.
4. **View → Freeze → 1 row** on Orders.
5. Copy the sheet id out of the address bar — the long code between `/d/` and `/edit` —
   and paste it into `BOARD_SHEET_ID` in the `config` node of **both** workflows. Then set
   `BOARD_READY = true`.

That is enough for it to run.

## Worth doing: the Stage dropdown

This is the one column a human has to keep honest — it is what stops a shipped order
sitting without its email, and it is the whole contract with the office.

- Select column **K** on Orders (Stage), then **Data → Data validation → Add rule**
- Criteria: **Dropdown (from a range)** → `Lists!A2:A8`
- Tick **Show a warning** rather than *Reject the input*, so a stage the workflow writes
  can never be bounced

**The flow:** the workflow writes `New order` when a row lands, then stamps `Confirmed`
once the confirmation email is away. The office moves the row to `In production` while it
is being made, and to **`Shipped`** the moment a label exists. That last flip is what
sends the shipping email. Moving it to `Delivered` or `Cancelled` closes it out.

## Worth doing: conditional colour for rows needing attention

Orders → select `A2:Q2000` → **Format → Conditional formatting → Add another rule** →
*Custom formula is*:

```
=AND($K2="Shipped", $P2="", $M2<>"")
```

`$K` is **Stage**, `$P` is **Ship email sent**, `$M` is **Confirmation sent**. The rule
lights up a shipped order that has not had its email — while leaving the genuinely stuck
ones (`Confirmation sent` blank) alone, because those are held on purpose until a human
sends the confirmation. Swap the columns if you add your own to the right of Notes; the
workflows only touch the columns they know and leave everything else alone.

## The columns

| Column | Written by | Notes |
|---|---|---|
| Order key | workflow | `shopify|5103`. The key every update matches on — **do not edit**. |
| Source / Order no. | workflow | from the store webhook. `Order no.` is the store's own number. |
| Placed | workflow | when the order arrived |
| Customer / Email | workflow | straight off the order |
| Items (json) | workflow | the line items as JSON — one row per order, machine-readable at ship time |
| Spec | workflow | custom notes from the order |
| Ship window start / end | workflow | the honest window quoted in the confirmation email |
| **Stage** | **you** | the only column the automation needs a human to maintain |
| Confirmation sent | workflow | stamped only when the confirmation email really went out |
| Carrier / Tracking no. / Shipped date | you **or** ShipStation | paste when the label is made, or let the ShipStation fetch fill it in |
| Ship email sent | workflow | stamped when the shipping email goes out — stops the next run |
| Notes | both | free text |

You can add your own columns to the right of Notes — the workflow only touches the ones
it knows.
