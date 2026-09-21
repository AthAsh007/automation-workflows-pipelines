// One candidate pitch per item: this creator, this brand contact, today.
//
// "Each matched to their niche and rates" is the brief's own phrasing, and both halves are
// enforced here rather than left to the writer:
//
//   niche  a brand is only ever offered to a creator in the same niche. A gaming creator
//          does not get a skincare brand because the volume target was short today.
//   rates  a brand whose budget band tops out below the creator's minimum is not pitched
//          at all. Sending it wastes the send, and it wastes the reply the person working
//          the inbox has to read.
//
// Everything the dedupe needs comes from the pitch log, which is why that log has to be
// written same-day. A log written tomorrow is a duplicate sent today.
const cfg = $('config').first().json;
const roster = $json;

const DAY = 86400000;
const now = Date.now();

// Budget bands, lowest ceiling first. A band the config does not know is treated as
// unknown, and unknown never blocks a pitch — it is a soft signal, not a gate.
const BAND_CEILING = { 'under 1k': 1000, '1-3k': 3000, '3-5k': 5000, '5-10k': 10000,
  '10k+': 100000 };

function stamp(s) {
  if (!s) return null;
  const ms = Date.parse(String(s));
  return isNaN(ms) ? null : ms;
}

// What has already been sent, per student and per brand.
const sentByStudentBrand = {};
const sentByStudentToday = {};
const today = new Date().toISOString().slice(0, 10);
(roster.pitches || []).forEach(function (p) {
  const key = p.student_id + '|' + p.brand_id;
  const at = stamp(p.sent_at);
  if (!sentByStudentBrand[key] || at > sentByStudentBrand[key]) {
    sentByStudentBrand[key] = at;
  }
  if (String(p.sent_at || '').slice(0, 10) === today) {
    sentByStudentToday[p.student_id] = (sentByStudentToday[p.student_id] || 0) + 1;
  }
});

const suppressed = cfg.suppression || [];
function isSuppressed(email) {
  const e = String(email || '').toLowerCase();
  const domain = e.split('@')[1] || '';
  return suppressed.indexOf(e) !== -1 || suppressed.indexOf(domain) !== -1;
}

const byNiche = {};
(roster.brands || []).forEach(function (b) {
  const k = String(b.niche || '');
  if (!byNiche[k]) byNiche[k] = [];
  byNiche[k].push(b);
});

const perStudent = Number(cfg.pitches_per_student_per_day || 25);
const cap = Number(cfg.daily_cap || 0);

const out = [];
const skipped = { already_pitched: 0, too_recent: 0, budget: 0, suppressed: 0,
  no_brands: 0, student_cap: 0 };
let total = 0;

(roster.students || []).forEach(function (student) {
  const pool = byNiche[String(student.niche || '')] || [];
  if (!pool.length) { skipped.no_brands++; return; }

  const alreadyToday = sentByStudentToday[student.student_id] || 0;
  let budget = Math.max(0, perStudent - alreadyToday);
  if (budget === 0) { skipped.student_cap++; return; }

  const minRate = Number(student.min_rate || 0);

  for (let i = 0; i < pool.length && budget > 0; i++) {
    const brand = pool[i];
    if (cap > 0 && total >= cap) break;

    const key = student.student_id + '|' + brand.brand_id;
    const last = sentByStudentBrand[key];
    if (last !== undefined && last !== null) {
      const days = (now - last) / DAY;
      if (Number(cfg.max_per_brand_per_student || 1) <= 1 &&
          days < Number(cfg.repitch_after_days || 90)) {
        skipped.too_recent++;
        continue;
      }
      if (days >= Number(cfg.repitch_after_days || 90)) {
        // Fine to pitch again — a no from last quarter is not a no forever.
      } else {
        skipped.already_pitched++;
        continue;
      }
    }

    if (isSuppressed(brand.contact_email)) { skipped.suppressed++; continue; }

    const ceiling = BAND_CEILING[String(brand.budget_band || '').toLowerCase()];
    if (ceiling !== undefined && minRate > 0 && ceiling < minRate) {
      skipped.budget++;
      continue;
    }

    total++;
    budget--;
    out.push({
      json: {
        _has_work: true,
        pitch_id: 'P-' + student.student_id + '-' + brand.brand_id + '-' +
          today.replace(/-/g, ''),
        student_id: student.student_id,
        student: student.name,
        handle: student.handle,
        niche: student.niche,
        platform: student.platform,
        followers: student.followers,
        avg_views: student.avg_views,
        rate_card: student.rate_card,
        min_rate: minRate,
        deliverables: student.deliverables,
        proof: student.proof,
        brand_id: brand.brand_id,
        brand: brand.brand,
        contact: brand.contact_name,
        email: brand.contact_email,
        role: brand.role,
        recent_signal: brand.recent_signal,
        product: brand.product,
        region: brand.region,
        budget_band: brand.budget_band,
        _roster: { source: roster.source, read_at: roster.read_at,
                   inboxes: roster.inboxes || [], students: (roster.students || []).length }
      }
    });
  }
});

if (!out.length) {
  return [{
    json: {
      _has_work: false,
      skipped: skipped,
      source: roster.source,
      read_at: roster.read_at,
      _note: 'Nothing to pitch: ' + Object.keys(skipped).map(function (k) {
        return k + ' ' + skipped[k];
      }).join(', ')
    }
  }];
}

out.forEach(function (item) {
  item.json._skipped = skipped;
  item.json._candidates = out.length;
});
return out;
