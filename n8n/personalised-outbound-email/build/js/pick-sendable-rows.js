// Decide who gets an email this run, and stop there.
// Every reason a row is skipped is counted, because "0 sent" with no explanation is
// the single most common support question this workflow will generate.
const cfg = $('config').first().json;
const C = cfg.columns;

const rows = $input.all().map((i) => i.json);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PLACEHOLDER = new Set(['', 'tbd', 'n/a', 'na', 'none', '-', 'unknown', 'pending']);

const val = (row, key) => String(row[C[key]] ?? '').trim();
// Status and Task Progress are typed by hand into the sheet, so compare loosely.
const same = (a, b) => a.toLowerCase() === String(b || '').trim().toLowerCase();

const domainOf = (url) => String(url || '')
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .replace(/^www\./, '')
  .split(/[/?#]/)[0]
  .replace(/\.$/, '');

// "David Ho (Insurance Broker)" -> a person. "Acclaim Insurance Brokers" -> a firm.
// Wrong guesses here are visible to the client, so the test is deliberately strict.
const FIRM_WORDS = /\b(law|llc|llp|lp|pte|ltd|limited|corporation|corp|chambers|associates|partners|advisory|advisers|advisors|capital|management|financial|insurance|brokers?|group|holdings|consultancy|services|company|co|firm|practice|wealth|asset|trust|planners?|solutions)\b/i;

const greetingFor = (business) => {
  const cleaned = String(business || '')
    .replace(/\([^)]*\)/g, ' ')           // drop "(Insurance Broker)"
    .replace(/,\s*(cfp|cfa|afc|chfc|clu|mba|llb|jd|phd|esq)\.?\b/gi, ' ')
    .replace(/[&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length === 2 && !FIRM_WORDS.test(cleaned) && parts.every((p) => /^[A-Z][a-z'-]+$/.test(p))) {
    return { greeting: 'Hi ' + parts[0] + ',', person: cleaned };
  }
  return { greeting: 'Hi there,', person: '' };
};

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

const skipped = {
  wrong_task_progress: 0,
  wrong_status: 0,
  no_valid_email: 0,
  no_redesign_link: 0,
  not_an_email_channel: 0,
  other_dev: 0,
  duplicate_email: 0,
  over_cap: 0
};

const seenEmail = new Set();
const candidates = [];

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const sourceRow = i + 2;                 // header is row 1

  // A blank gate in config means "do not look at that column at all".
  if (cfg.send_when_task_progress && !same(val(row, 'task_progress'), cfg.send_when_task_progress)) {
    skipped.wrong_task_progress++; continue;
  }
  if (cfg.send_when_status && !same(val(row, 'status'), cfg.send_when_status)) {
    skipped.wrong_status++; continue;
  }
  if (cfg.only_dev && val(row, 'dev') !== cfg.only_dev) { skipped.other_dev++; continue; }

  const email = val(row, 'email').toLowerCase();
  if (PLACEHOLDER.has(email) || !EMAIL_RE.test(email)) { skipped.no_valid_email++; continue; }

  // A generated email is built around this link, so without one there is nothing to
  // send. A row carrying its own Email Content is exempt: whoever wrote it decided
  // what it points at.
  const redesignLink = val(row, 'redesign_link');
  const hasOwnCopy = val(row, 'email_content').length > 40;
  const linkLooksReal = !PLACEHOLDER.has(redesignLink.toLowerCase()) &&
                        /^https?:\/\//i.test(redesignLink);
  if (cfg.require_redesign_link && !linkLooksReal && !hasOwnCopy) {
    skipped.no_redesign_link++; continue;
  }

  if (cfg.require_email_channel && !/email/i.test(val(row, 'method'))) { skipped.not_an_email_channel++; continue; }

  if (seenEmail.has(email)) { skipped.duplicate_email++; continue; }
  seenEmail.add(email);

  const business = val(row, 'business');
  const who = greetingFor(business);

  candidates.push({
    row_id:          val(row, 'row_id'),
    _source_row:     sourceRow,
    business,
    business_display: business.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim() || business,
    greeting:        who.greeting,
    contact_person:  who.person,
    email,
    website:         val(row, 'website'),
    domain:          domainOf(val(row, 'website')),
    type:            val(row, 'type'),
    segment:         val(row, 'segment'),
    specialty:       val(row, 'specialty'),
    priority:        val(row, 'priority'),
    task_progress:   val(row, 'task_progress'),
    status:          val(row, 'status'),
    diagnosis:       val(row, 'diagnosis'),
    pitch_angle:     val(row, 'pitch_angle'),
    redesign_link:   redesignLink,
    existing_notes:  val(row, 'notes'),
    existing_title:  val(row, 'email_title'),
    existing_body:   val(row, 'email_content'),
    // Copy already written into the sheet by a human wins over anything we build.
    _has_custom_subject: val(row, 'email_title') !== '',
    _has_custom_body:    val(row, 'email_content').length > 40,
    _priority_rank:  PRIORITY_RANK[val(row, 'priority').toLowerCase()] ?? 3
  });
}

candidates.sort((a, b) =>
  (a._priority_rank - b._priority_rank) || (Number(a.row_id) - Number(b.row_id))
);

// A test run mails TEST_BATCH leads (1 by default) - enough to read the email, not
// enough to fill an inbox. A preview builds the whole batch because it sends nothing.
const testing = cfg.test_send === true;
const cap = testing
  ? (cfg.test_batch > 0 ? cfg.test_batch : 1)
  : (cfg.daily_cap > 0 ? cfg.daily_cap : candidates.length);

skipped.over_cap = Math.max(0, candidates.length - cap);
const selected = candidates.slice(0, cap);

const summary = {
  rows_read: rows.length,
  eligible: candidates.length,
  selected: selected.length,
  cap,
  cap_reason: testing ? 'TEST_BATCH, because this is a test run' : 'DAILY_CAP',
  skipped
};

if (!selected.length) {
  return [{ json: { _nothing_to_send: true, _summary: summary } }];
}

return selected.map((lead) => ({ json: Object.assign({ _summary: summary }, lead) }));
