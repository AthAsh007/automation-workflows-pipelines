// STOP: Airtable is not configured — build the demo roster instead.
//
// Deterministic. Six students across six niches, sixty brand contacts, four sending inboxes
// with a deliberately mixed health picture — one still warming, one over its bounce
// threshold, one whose health the platform will not report, one clean — and a pitch history
// so the dedupe has something to catch.
//
// Nothing here can be emailed: `demo_data` forces the run into preview in config.
const cfg = $('config').first().json;

if (cfg.airtable_enabled) {
  throw new Error('demo roster reached with Airtable configured — check the IF gate');
}
if (!cfg.demo_data) {
  return [{ json: { source: 'none', read_at: new Date().toISOString(),
    students: [], brands: [], inboxes: [], pitches: [],
    _note: 'No Airtable key and DEMO_ROSTER is off. Nothing to work on.' } }];
}

const DAY = 86400000;
const now = Date.now();
function iso(ms) { return new Date(ms).toISOString(); }

let seed = 20260904;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }

const STUDENTS = [
  ['ST-01', 'Nadia Osei', '@nadiabuilds', 'Home & interiors', 'Instagram', 84000, 21000,
   1400, 900, 'One in-feed reel + two stories',
   'Grew from 12k to 84k in fourteen months; 6.1% average engagement'],
  ['ST-02', 'Tomas Ferreira', '@tomcooks', 'Food', 'TikTok', 210000, 65000,
   2200, 1500, 'One 45-second TikTok + usage rights',
   'Three videos past 1M views this year; audience 71% UK'],
  ['ST-03', 'Priya Raman', '@priyalifts', 'Fitness', 'Instagram', 46000, 12000,
   900, 600, 'Two in-feed posts',
   '4.8% engagement; 63% of audience aged 25-34'],
  ['ST-04', 'Leo Hartmann', '@leoplays', 'Gaming', 'YouTube', 320000, 48000,
   3500, 2400, 'One 60-second integration',
   'Averages 48k views per upload across the last twenty videos'],
  ['ST-05', 'Amara Chike', '@amaraskin', 'Beauty', 'TikTok', 128000, 39000,
   1800, 1200, 'One TikTok + one story set',
   'Two brand videos past 500k views; 82% female audience'],
  ['ST-06', 'Iris Vandermeer', '@irisdraws', 'Art & craft', 'Instagram', 61000, 15000,
   1100, 700, 'One carousel + two stories',
   'Featured twice by the platform editorial team']
];

const BRANDS = [
  ['Home & interiors', 'Kestrel Living', 'Sofie Brandt', 'Head of Brand',
   'launched a spring modular sofa line last month', 'Modular sofas', 'UK', '1-3k'],
  ['Home & interiors', 'Northwood Ceramics', 'Ravi Menon', 'Marketing Manager',
   'opened a second showroom in Leeds', 'Handmade tableware', 'UK', 'under 1k'],
  ['Food', 'Copper Pot Sauces', 'Elena Ruiz', 'Growth Lead',
   'moved into 400 Tesco stores in March', 'Cooking sauces', 'UK', '1-3k'],
  ['Food', 'Grainhouse Bakery', 'Tom Aldridge', 'Founder',
   'started shipping nationwide in February', 'Sourdough kits', 'UK', 'under 1k'],
  ['Fitness', 'Vantage Athletic', 'Kim Dae-jung', 'Partnerships',
   'released a womens training range in April', 'Training apparel', 'EU', '3-5k'],
  ['Fitness', 'Rowan Supplements', 'Beth Okoye', 'Brand Manager',
   'reformulated their protein line without sweeteners', 'Protein powder', 'UK', '1-3k'],
  ['Gaming', 'Hexline Peripherals', 'Marc Dubois', 'Influencer Lead',
   'shipped a low-latency wireless mouse in May', 'Gaming mice', 'EU', '3-5k'],
  ['Gaming', 'Nightfall Studios', 'Sara Lindholm', 'Community Manager',
   'announced an early-access date for their roguelike', 'Indie game', 'Global', '1-3k'],
  ['Beauty', 'Lumen Skin', 'Aisha Rahman', 'Head of Growth',
   'reformulated their serum to fragrance-free in March', 'Vitamin C serum', 'UK', '1-3k'],
  ['Beauty', 'Verdant Haircare', 'Jonas Weber', 'Marketing Director',
   'launched a refill programme across their range', 'Shampoo bars', 'EU', '3-5k'],
  ['Art & craft', 'Paperfold Studio', 'Mei Tanaka', 'Founder',
   'released a limited watercolour set with an illustrator', 'Watercolour sets', 'UK', 'under 1k'],
  ['Art & craft', 'Inkwell Supply', 'Owen Blake', 'Partnerships',
   'opened wholesale to independent shops this quarter', 'Fountain pens', 'UK', '1-3k']
];

const students = STUDENTS.map(function (s, i) {
  return { student_id: s[0], name: s[1], handle: s[2], niche: s[3], platform: s[4],
    followers: s[5], avg_views: s[6], rate_card: s[7], min_rate: s[8], deliverables: s[9],
    proof: s[10], status: 'Active',
    started_on: iso(now - (20 + i * 6) * DAY),
    monthly_target: 400 };
});

// Sixty contacts: each seed brand cloned across regions so the matcher has volume to work
// with, which is what a 10,000-a-month brief actually looks like.
const REGIONS = ['UK', 'EU', 'US', 'AU', 'CA'];
const brands = [];
BRANDS.forEach(function (b, bi) {
  REGIONS.forEach(function (region, ri) {
    const n = bi * REGIONS.length + ri;
    const local = ri === 0;
    brands.push({
      brand_id: 'BR-' + String(n + 1).padStart(3, '0'),
      brand: local ? b[1] : b[1] + ' ' + region,
      niche: b[0],
      contact_name: local ? b[2] : b[2].split(' ')[0] + ' ' + ['Novak', 'Silva', 'Hughes',
        'Bauer', 'Moreau'][ri],
      // One in ten is a role mailbox, which the audit holds. They are where bounce rates
      // come from and a demo that never shows one is not showing the gate working.
      contact_email: (n % 10 === 3 ? 'info' : b[2].toLowerCase().split(' ')[0] + '.' +
        b[2].toLowerCase().split(' ')[1]) + '@' +
        b[1].toLowerCase().replace(/[^a-z]/g, '') + (local ? '.com' : '.' +
        region.toLowerCase()),
      role: n % 7 === 5 ? '' : b[3],
      // One in seven is a thin scraped record — the company and the product, and nothing
      // else. The personalisation gate has to hold those: nothing true and specific to say
      // means no pitch, not a generic one.
      recent_signal: n % 7 === 5 ? '' : b[4],
      product: b[5],
      region: region,
      budget_band: b[7],
      status: 'New'
    });
  });
});

const inboxes = [
  { inbox_id: 'IN-1', email: 'nadia@northbeam-outreach.example', domain: 'northbeam-outreach.example',
    student_id: '', warmed_days: 62, daily_cap: 40, sent_today: 0, bounce_rate: 0.006,
    spam_rate: 0.0002, health_score: 94, state: 'Active' },
  { inbox_id: 'IN-2', email: 'tomas@northbeam-outreach.example', domain: 'northbeam-outreach.example',
    student_id: '', warmed_days: 58, daily_cap: 40, sent_today: 12, bounce_rate: 0.011,
    spam_rate: 0.0004, health_score: 88, state: 'Active' },
  // Still warming — sends nothing, whatever else is true of it.
  { inbox_id: 'IN-3', email: 'priya@northbeam-reach.example', domain: 'northbeam-reach.example',
    student_id: '', warmed_days: 6, daily_cap: 40, sent_today: 0, bounce_rate: 0.002,
    spam_rate: 0, health_score: 91, state: 'Warming' },
  // Over the bounce threshold — pulled from rotation until somebody cleans the list.
  { inbox_id: 'IN-4', email: 'leo@northbeam-reach.example', domain: 'northbeam-reach.example',
    student_id: '', warmed_days: 71, daily_cap: 40, sent_today: 4, bounce_rate: 0.052,
    spam_rate: 0.0009, health_score: 74, state: 'Active' },
  // The platform will not report health for this one. HOLD_UNKNOWN_INBOX decides.
  { inbox_id: 'IN-5', email: 'amara@northbeam-mail.example', domain: 'northbeam-mail.example',
    student_id: '', warmed_days: 40, daily_cap: 40, sent_today: 0, bounce_rate: null,
    spam_rate: null, health_score: null, state: 'Active' },
  { inbox_id: 'IN-6', email: 'iris@northbeam-mail.example', domain: 'northbeam-mail.example',
    student_id: '', warmed_days: 45, daily_cap: 40, sent_today: 3, bounce_rate: 0.008,
    spam_rate: 0.0001, health_score: 85, state: 'Active' }
];

// A pitch history, so the dedupe and the re-pitch window have something to catch.
const pitches = [];
students.forEach(function (s, si) {
  const pool = brands.filter(function (b) { return b.niche === s.niche; });
  pool.slice(0, 4).forEach(function (b, bi) {
    const age = bi === 0 ? 10 : (cfg.repitch_after_days + 30);
    pitches.push({
      pitch_id: 'P-' + s.student_id + '-' + b.brand_id,
      student_id: s.student_id, student: s.name,
      brand_id: b.brand_id, brand: b.brand,
      contact: b.contact_name, email: b.contact_email,
      inbox: inboxes[si % inboxes.length].email,
      subject: '', body: '', facts_used: '',
      sent_at: iso(now - age * DAY),
      state: bi % 2 === 0 ? 'Sent' : 'Closed',
      hold_reason: '', reply_at: '', reply_class: '', booked_at: '', deal_value: ''
    });
  });
});

return [{
  json: {
    source: 'demo',
    read_at: new Date().toISOString(),
    failures: [],
    students: students,
    brands: brands,
    inboxes: inboxes,
    pitches: pitches,
    _note: 'DEMO ROSTER — ' + students.length + ' students, ' + brands.length +
           ' brand contacts, ' + inboxes.length + ' inboxes, ' + pitches.length +
           ' pitches already sent. The run is forced into preview; nothing here can be ' +
           'emailed.'
  }
}];
