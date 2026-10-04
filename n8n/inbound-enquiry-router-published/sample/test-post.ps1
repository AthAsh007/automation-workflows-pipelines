# Send a test enquiry at workflow 1. PowerShell.
#   1. In n8n open "01 capture and reply" and click  Test workflow  (it listens for one call)
#   2. Run this, with $Url swapped for your Test URL from the webhook node
$Url = 'https://n8n.acme.example/webhook-test/cleaning-enquiry'

$Body = @{
  'your-name'    = 'Rachel Okonkwo'
  'your-email'   = 'r.okonkwo@brightpath-dental.example'
  'your-phone'   = '020 7946 0412'
  'company'      = 'Brightpath Dental'
  'postcode'     = 'SW1A 1AA'
  'your-subject' = 'Dental practice, 2 floors'
  'your-message' = 'We need a regular clean for our practice on Victoria Street. Two floors, six surgeries and a waiting room. Evenings only, after 7pm.'
} | ConvertTo-Json

Invoke-RestMethod -Uri $Url -Method Post -Body $Body -ContentType 'application/json'
