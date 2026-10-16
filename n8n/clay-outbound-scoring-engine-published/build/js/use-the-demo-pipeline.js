// Zoho is not connected, so an invented pipeline stands in, in the same shape `read the leads`
// produces: two interested replies, a referral, and two A-tier leads from earlier runs.
const now = Date.now();
const ago = (h) => new Date(now - h * 3600000).toISOString();
const rows = [
  { name: 'Dana Reyes', company: 'Ledgerly', title: 'VP of Sales', phone: '+1 202 555 0101', email: 'dana.reyes@ledgerly.example', status: 'Replied - Interested', score: 95, action: 'Call today, then sequence A', modified: ago(14) },
  { name: 'Jamie Cole', company: 'Stackmart', title: 'RevOps Lead', phone: '', email: 'jamie.cole@stackmart.example', status: 'Replied - Referral', score: null, action: '', modified: ago(20) },
  { name: 'Owen Park', company: 'Brightline Analytics', title: 'Head of Sales', phone: '+1 202 555 0114', email: 'owen.park@brightline.example', status: 'Replied - Interested', score: 70, action: 'Call within 24 hours, then sequence A', modified: ago(3) },
  { name: 'Elena Rossi', company: 'Corebill', title: 'VP Sales', phone: '+1 202 555 0115', email: 'elena.rossi@corebill.example', status: 'Qualified - A', score: 92, action: 'Call within 24 hours, then sequence A', modified: ago(40) },
  { name: 'Victor Hale', company: 'Shipwise', title: 'Chief Revenue Officer', phone: '', email: 'victor.hale@shipwise.example', status: 'Qualified - A', score: 100, action: 'Call today, then sequence A', modified: ago(60) }
];
return [{ json: { source: 'demo pipeline (invented)', rows: rows, more: false } }];
