# Draft purchase orders in Google Sheets for low Shopify stock

Works out a reorder point for every tracked Shopify variant from its last 28 days of sales, supplier lead time and safety stock, rounds order quantities to case packs and minimums, groups them into one draft PO per supplier, and appends the lines to a Google Sheets tab.

Import `shopify-low-stock-purchase-orders-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Shopify store owners who reorder from a handful of suppliers and currently eyeball the inventory page every Monday. It writes the draft PO; you still decide whether to send it.

## How it works

1. Every weekday at 07:30 it reads products, the last 28 days of orders and unit costs from Shopify, or a 9-variant sample until Shopify is connected.
2. For each tracked variant: daily sales = units sold / 28; reorder point = daily sales x supplier lead time + 7 days of safety stock.
3. Below the reorder point it orders enough to cover lead time plus 30 days, rounded up to the case pack and at least the supplier MOQ.
4. Lines are grouped into one PO per supplier. A supplier under its minimum order value is held, and a SKU already on an open draft is skipped.
5. New lines are appended to the PO lines tab as status draft.

## Sections on the canvas

1. **Start and settings.** Runs every weekday at 07:30, before suppliers open. Lead times, case packs, MOQs and minimum order values live per supplier in `config`, so a new supplier is one entry.
2. **Read stock, sales and cost.** Three read-only Shopify calls: products for stock, orders for the last `SALES_WINDOW_DAYS`, and inventory items for unit cost. Cancelled orders are ignored so a refunded rush does not inflate demand.
3. **Check open POs and compute.** Open draft and ordered lines are read first, so a SKU drafted on Monday is not drafted again on Tuesday. Every skipped variant keeps its reason, from untracked stock to above reorder point.
4. **Draft and write.** A supplier below its minimum order value is held whole rather than sent a partial PO. `Write to the sheet?` needs both a live run and a sheet id; the summary is built either way.

## Setup

1. Run it once as imported. It drafts POs from the sample and stops at `STOP: dry run - sheet untouched`.
2. Add a Shopify access token credential to the three Shopify nodes, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.
3. Fill `SUPPLIERS` with each vendor name as it appears in Shopify, plus lead time, case pack, MOQ and minimum order value.
4. Create a sheet with a PO lines tab and put its id in `PO_SHEET_ID`, then set `DRY_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_SHOPIFY` | `false` | set true after adding the Shopify credential to the three Shopify nodes |
| `SHOP_DOMAIN` | `'your-store.myshopify.com'` | your myshopify.com domain |
| `SALES_WINDOW_DAYS` | `28` | days of orders used to average daily sales |
| `SAFETY_DAYS` | `7` | days of average sales kept as safety stock |
| `COVER_DAYS` | `30` | each order covers lead time plus this many days |
| `SUPPLIERS` | `{"Kiln & Co":{"lead_time_days":21,"case_` | Shopify vendor name -> lead time (days), case pack, minimum units per line, minimum order value |
| `DEFAULT_SUPPLIER` | `{"lead_time_days":14,"case_pack":1,"moq"` | used for vendors not listed above |
| `SKIP_TAGS` | `["discontinued","made-to-order"]` | product tags that are never reordered |
| `OPEN_PO_DAYS` | `30` | a SKU on a draft or ordered line newer than this is not drafted again |
| `PO_SHEET_ID` | `''` | Google Sheets id with a PO lines tab; blank uses sample open lines and writes nothing |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Fetch products and variants`
- `Fetch orders in the sales window`
- `Fetch unit costs`
- `Read open PO lines`
- `Append PO draft lines`

## Requirements

- A Shopify store with inventory tracking on
- A custom app access token with read_products, read_orders and read_inventory
- A Google Sheet

## Customising

- `SAFETY_DAYS` and `COVER_DAYS` set how much buffer and how many days each order covers.
- `SALES_WINDOW_DAYS` changes how far back sales are averaged.
- `SKIP_TAGS` keeps discontinued products out of every PO.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 14 | none | `Summarise the drafts`, `STOP: dry run - sheet untouched` |
| live with Shopify and the PO sheet | 17 | `Append PO draft lines` | `Summarise the drafts`, `Append PO draft lines` |
