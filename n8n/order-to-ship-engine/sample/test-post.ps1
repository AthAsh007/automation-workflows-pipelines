# Send a test order at "01 capture and confirm". PowerShell.
#   1. In n8n open "01 capture and confirm" and click  Test workflow  (it listens for one call)
#   2. Run this, with $Url swapped for your Test URL from the webhook node
#
# Pick a payload from the sample folder. Each one shows a different gate:
#   shopify-order.json         a fresh Shopify order -> row + confirmation email
#   etsy-order-duplicate.json  an order already on the board -> STOP: duplicate delivery
#   square-order-paid.json     a Square order whose deposit has landed -> flows
#   square-order-unpaid.json   deposit still pending -> STOP: not a usable order
#   shopify-order-unruly.json  a product with no PRODUCT_RULES entry -> STOP: needs a product rule
$Url = 'https://n8n.example.com/webhook-test/order-in'
$Payload = Join-Path $PSScriptRoot 'shopify-order.json'

$Body = Get-Content $Payload -Raw
Invoke-RestMethod -Uri $Url -Method Post -Body $Body -ContentType 'application/json'
