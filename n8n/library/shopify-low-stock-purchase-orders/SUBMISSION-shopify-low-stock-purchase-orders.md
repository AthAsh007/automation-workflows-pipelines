# Draft purchase orders in Google Sheets for low Shopify stock

**Who's it for**
Shopify store owners who reorder from a handful of suppliers and currently eyeball the inventory page every Monday. It writes the draft PO; you still decide whether to send it.

**How it works**
1. Every weekday at 07:30 it reads products, the last 28 days of orders and unit costs from Shopify, or a 9-variant sample until Shopify is connected.
2. For each tracked variant: daily sales = units sold / 28; reorder point = daily sales x supplier lead time + 7 days of safety stock.
3. Below the reorder point it orders enough to cover lead time plus 30 days, rounded up to the case pack and at least the supplier MOQ.
4. Lines are grouped into one PO per supplier. A supplier under its minimum order value is held, and a SKU already on an open draft is skipped.
5. New lines are appended to the PO lines tab as status draft.

**How to set up**
1. Run it once as imported. It drafts POs from the sample and stops at `STOP: dry run - sheet untouched`.
2. Add a Shopify access token credential to the three Shopify nodes, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.
3. Fill `SUPPLIERS` with each vendor name as it appears in Shopify, plus lead time, case pack, MOQ and minimum order value.
4. Create a sheet with a PO lines tab and put its id in `PO_SHEET_ID`, then set `DRY_RUN = false`.

**Requirements**
- A Shopify store with inventory tracking on
- A custom app access token with read_products, read_orders and read_inventory
- A Google Sheet

**How to customize**
- `SAFETY_DAYS` and `COVER_DAYS` set how much buffer and how many days each order covers.
- `SALES_WINDOW_DAYS` changes how far back sales are averaged.
- `SKIP_TAGS` keeps discontinued products out of every PO.
