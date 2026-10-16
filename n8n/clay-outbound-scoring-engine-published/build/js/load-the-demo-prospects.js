// "Run the demo prospects" lands here. Twelve invented B2B SaaS prospects, posted in the same
// shape a Clay HTTP API column sends (Clay's own column names, spaces and all), so pressing
// Execute runs the whole pipeline without Clay, a webhook or a single credential.
//
// The set is chosen to hit every path: clean A and B rows, rows missing an email (paid
// enrichment), a C that goes to Zoho as nurture and is never enriched, two disqualifiers,
// a duplicate of an earlier row, a row with nothing to score, an address the verifier
// calls catch-all and one it calls invalid, and more A/B rows than ENRICH_BUDGET allows.
//
// `_demo` is what the demo enrichment and demo verifier return for that person. It exists only
// on these invented rows; a real Clay row never carries it.
const rows = [
  { 'Clay Row ID': 'r-101', 'First Name': 'Dana', 'Last Name': 'Reyes', 'Job Title': 'VP of Sales',
    'Work Email': 'dana.reyes@ledgerly.example', 'Company Name': 'Ledgerly', 'Company Domain': 'ledgerly.example',
    'Employee Count': 320, 'Industry': 'Fintech software', 'Country': 'United States',
    'Technologies': ['HubSpot', 'Stripe'], 'LinkedIn URL': 'https://www.linkedin.com/in/example-dana-reyes',
    _demo: { phone: '+1 202 555 0101', verify: 'ok' } },
  { 'Clay Row ID': 'r-102', 'First Name': 'Marcus', 'Last Name': 'Obi', 'Job Title': 'Chief Revenue Officer',
    'Company Name': 'Freightline', 'Company Domain': 'freightline.example', 'Employee Count': 850,
    'Industry': 'Logistics software', 'Country': 'United States', 'Technologies': 'Salesforce, Outreach',
    _demo: { email: 'marcus.obi@freightline.example', phone: '+1 202 555 0102', verify: 'ok' } },
  { 'Clay Row ID': 'r-103', 'First Name': 'Priya', 'Last Name': 'Nair', 'Job Title': 'Head of Revenue Operations',
    'Company Name': 'Clinicflow', 'Company Domain': 'clinicflow.example', 'Employee Count': 140,
    'Industry': 'Healthcare software', 'Country': 'Canada', 'Technologies': ['HubSpot'],
    _demo: { email: 'priya@clinicflow.example', verify: 'catch_all' } },
  { 'Clay Row ID': 'r-104', 'First Name': 'Tom', 'Last Name': 'Becker', 'Job Title': 'Sales Manager',
    'Work Email': 'tom.becker@brightdesk.example', 'Company Name': 'Brightdesk', 'Company Domain': 'brightdesk.example',
    'Employee Count': 60, 'Industry': 'SaaS', 'Country': 'United Kingdom', 'Technologies': [],
    _demo: { verify: 'ok' } },
  { 'Clay Row ID': 'r-105', 'First Name': 'Aisha', 'Last Name': 'Khan', 'Job Title': 'Director of Sales',
    'Company Name': 'Stackmart', 'Company Domain': 'stackmart.example', 'Employee Count': 2200,
    'Industry': 'E-commerce software', 'Country': 'United States', 'Technologies': ['Zoho CRM'],
    _demo: { email: 'aisha.khan@stackmart.example', verify: 'ok' } },
  { 'Clay Row ID': 'r-106', 'First Name': 'Leo', 'Last Name': 'Martin', 'Job Title': 'Marketing Intern',
    'Work Email': 'leo@ledgerly.example', 'Company Name': 'Ledgerly', 'Company Domain': 'ledgerly.example',
    'Employee Count': 320, 'Industry': 'Fintech software', 'Country': 'United States', _demo: { verify: 'ok' } },
  { 'Clay Row ID': 'r-107', 'First Name': 'Dana', 'Last Name': 'Reyes', 'Job Title': 'VP Sales',
    'Work Email': 'Dana.Reyes@Ledgerly.example', 'Company Name': 'Ledgerly Inc', 'Company Domain': 'ledgerly.example',
    'Employee Count': 320, 'Industry': 'Fintech software', 'Country': 'United States', _demo: { verify: 'ok' } },
  { 'Clay Row ID': 'r-108', 'Company Name': 'Unnamed row', 'Industry': 'Software' },
  { 'Clay Row ID': 'r-109', 'First Name': 'Sam', 'Last Name': 'Ortiz', 'Job Title': 'IT Director', 'Work Email': 'sam@quarryhealth.example',
    'Company Name': 'Quarry Health', 'Company Domain': 'quarryhealth.example', 'Employee Count': 35,
    'Industry': 'Healthcare', 'Country': 'United States', _demo: { verify: 'ok' } },
  { 'Clay Row ID': 'r-110', 'First Name': 'Grace', 'Last Name': 'Liu', 'Job Title': 'VP Operations',
    'Company Name': 'Parcelhub', 'Company Domain': 'parcelhub.example', 'Employee Count': 450,
    'Industry': 'Logistics software', 'Country': 'United States', 'Technologies': ['Salesforce'],
    _demo: { email: 'grace.liu@parcelhub.example', verify: 'invalid' } },
  { 'Clay Row ID': 'r-111', 'First Name': 'Ben', 'Last Name': 'Adler', 'Job Title': 'CEO & Founder',
    'Company Name': 'Tinytask', 'Company Domain': 'tinytask.example', 'Employee Count': 8,
    'Industry': 'Software', 'Country': 'United States', _demo: { email: 'ben@tinytask.example', verify: 'ok' } },
  { 'Clay Row ID': 'r-112', 'First Name': 'Nora', 'Last Name': 'Quinn', 'Job Title': 'Sales Director',
    'Company Name': 'Vaultline', 'Company Domain': 'vaultline.example', 'Employee Count': 600,
    'Industry': 'Fintech', 'Country': 'United Kingdom', 'Technologies': ['HubSpot'],
    _demo: { email: 'nora.quinn@vaultline.example', verify: 'ok' } }
];

// Shaped like the webhook's output, so everything downstream is identical either way.
return rows.map((row) => ({ json: { body: row, _source: 'demo prospects (invented)' } }));
