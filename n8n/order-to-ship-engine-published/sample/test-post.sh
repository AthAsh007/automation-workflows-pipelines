#!/bin/sh
# Send a test order at "01 capture and confirm". Swap the URL for your own Test URL.
#
# Pick a payload from the sample folder. Each one shows a different gate:
#   shopify-order.json         a fresh Shopify order -> row + confirmation email
#   etsy-order-duplicate.json  an order already on the board -> STOP: duplicate delivery
#   square-order-paid.json     a Square order whose deposit has landed -> flows
#   square-order-unpaid.json   deposit still pending -> STOP: not a usable order
#   shopify-order-unruly.json  a product with no PRODUCT_RULES entry -> STOP: needs a product rule
URL='https://n8n.example.com/webhook-test/order-in'
PAYLOAD="$(dirname "$0")/shopify-order.json"

curl -s -X POST "$URL" -H 'Content-Type: application/json' --data-binary @"$PAYLOAD"
