#!/bin/sh
# Send a test enquiry at workflow 1. Swap the URL for your own Test URL.
URL='https://n8n.acme.example/webhook-test/cleaning-enquiry'

curl -s -X POST "$URL" -H 'Content-Type: application/json' -d @- <<'JSON'
{
  "your-name": "Rachel Okonkwo",
  "your-email": "r.okonkwo@brightpath-dental.example",
  "your-phone": "020 7946 0412",
  "company": "Brightpath Dental",
  "postcode": "SW1A 1AA",
  "your-subject": "Dental practice, 2 floors",
  "your-message": "We need a regular clean for our practice on Victoria Street. Two floors, six surgeries and a waiting room. Evenings only, after 7pm."
}
JSON
