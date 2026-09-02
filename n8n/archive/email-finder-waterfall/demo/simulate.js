// Runs the real Code nodes out of workflow-v2.json against a mocked n8n context,
// following the same connection logic the engine would, so the README's claims
// are checked rather than asserted.
const fs = require('fs');

const WF = process.argv[2] || require('path').join(__dirname, '..', 'workflow-v2.json');
const wf = JSON.parse(fs.readFileSync(WF, 'utf8'));
const codeOf = {};
for (const n of wf.nodes) if (n.type.endsWith('.code')) codeOf[n.name] = n.parameters.jsCode;

function runCode(name, ctx) {
  const items = ctx.input.map((j) => ({ json: j }));
  const $input = {
    first: () => items[0],
    all: () => items,
  };
  const $ = (nodeName) => {
    if (!(nodeName in ctx.store)) throw new Error(`no data for node "${nodeName}"`);
    return { first: () => ({ json: ctx.store[nodeName] }) };
  };
  const fn = new Function('$input', '$', `${codeOf[name]}`);
  const out = fn($input, $);
  return out.map((o) => o.json);
}

// --- fake provider responses -------------------------------------------------
const APOLLO_HIT = { person: { email: 'Jane.Doe@acme.example', title: 'Head of Operations', organization: { name: 'Acme Pte Ltd' } } };
const APOLLO_LOCKED = { person: { email: 'email_not_unlocked@domain.com', title: 'Head of Operations' } };
const APOLLO_MISS = { person: null };
const RR_HIT = { emails: [{ email: 'j.doe@acme.example', type: 'personal', grade: 'B' }, { email: 'jane.doe@acme.example', type: 'professional', grade: 'A' }] };
const RR_MISS = { emails: [] };

function verifierResponse(verifier, verdict) {
  if (verdict === null) return {}; // outage / error payload
  if (verifier === 'zerobounce') return { status: verdict };
  return { result: verdict };
}

// --- the graph ---------------------------------------------------------------
function run(scenario) {
  const { cfgOverrides = {}, request, apollo, rocketreach, verifierRaw } = scenario;
  const store = {};

  // config node: patch the consts by string replacement, the same edit a human makes
  let cfgJs = codeOf['config'];
  for (const [k, v] of Object.entries(cfgOverrides)) {
    const re = new RegExp(`^const ${k} = .*?;$`, 'm');
    if (!re.test(cfgJs)) throw new Error(`config has no const ${k}`);
    cfgJs = cfgJs.replace(re, `const ${k} = ${JSON.stringify(v)};`);
  }
  const cfg = new Function(cfgJs)()[0].json;
  store['config'] = cfg;
  store['Webhook - enrich request'] = { body: request };

  let lead = runCode('normalise request', { input: [{}], store })[0];
  store['normalise request'] = lead;

  // Apollo configured?
  if (cfg.apollo_enabled) {
    lead = runCode('read Apollo result', { input: [apollo], store })[0];
    store['read Apollo result'] = lead;
  }
  store['waterfall after Apollo'] = lead;

  if (!lead.email) {
    if (cfg.rocketreach_enabled) {
      lead = runCode('read RocketReach result', { input: [rocketreach], store })[0];
      store['read RocketReach result'] = lead;
    }
    store['waterfall after RocketReach'] = lead;

    if (!lead.email) {
      lead = runCode('guess pattern (unverified)', { input: [lead], store })[0];
    }
  }
  store['collect candidates'] = lead;

  // anything to verify? -> Verifier configured?
  let verdictItem;
  if (lead.email && cfg.verifier_enabled) {
    const raw = verifierResponse(cfg.verifier, verifierRaw);
    verdictItem = runCode('read verifier result', { input: [raw], store })[0];
  } else {
    verdictItem = lead; // both skip NoOps pass the lead straight through
  }

  return runCode('score confidence', { input: [verdictItem], store })[0];
}

const REQ = {
  lead_id: 'acme-jane-doe', first_name: 'Jane', last_name: 'Doe',
  company: 'Acme Pte Ltd', domain: 'https://www.acme.example/careers',
  linkedin_url: 'https://www.linkedin.com/in/jane-doe',
};

const KEYS = { APOLLO_API_KEY: 'a', ROCKETREACH_API_KEY: 'r', VERIFIER_API_KEY: 'v' };

const cases = [
  ['no keys at all (dry run)', { cfgOverrides: {}, request: REQ }],
  ['verifier only, guess confirmed', { cfgOverrides: { VERIFIER_API_KEY: 'v' }, request: REQ, verifierRaw: 'valid' }],
  ['verifier only, guess unconfirmed', { cfgOverrides: { VERIFIER_API_KEY: 'v' }, request: REQ, verifierRaw: 'catchall' }],
  ['apollo hit + valid', { cfgOverrides: KEYS, request: REQ, apollo: APOLLO_HIT, verifierRaw: 'valid' }],
  ['apollo hit + catchall', { cfgOverrides: KEYS, request: REQ, apollo: APOLLO_HIT, verifierRaw: 'catchall' }],
  ['apollo hit + invalid', { cfgOverrides: KEYS, request: REQ, apollo: APOLLO_HIT, verifierRaw: 'invalid' }],
  ['apollo hit, no verifier key', { cfgOverrides: { APOLLO_API_KEY: 'a' }, request: REQ, apollo: APOLLO_HIT }],
  ['apollo locked placeholder -> RR hit', { cfgOverrides: KEYS, request: REQ, apollo: APOLLO_LOCKED, rocketreach: RR_HIT, verifierRaw: 'valid' }],
  ['apollo miss, RR miss, guess valid', { cfgOverrides: KEYS, request: REQ, apollo: APOLLO_MISS, rocketreach: RR_MISS, verifierRaw: 'valid' }],
  ['apollo miss, RR miss, guess unknown', { cfgOverrides: KEYS, request: REQ, apollo: APOLLO_MISS, rocketreach: RR_MISS, verifierRaw: 'unknown' }],
  ['verifier outage (empty payload)', { cfgOverrides: KEYS, request: REQ, apollo: APOLLO_HIT, verifierRaw: null }],
  ['zerobounce vocabulary', { cfgOverrides: { ...KEYS, VERIFIER: 'zerobounce' }, request: REQ, apollo: APOLLO_HIT, verifierRaw: 'catch-all' }],
  ['millionverifier vocabulary', { cfgOverrides: { ...KEYS, VERIFIER: 'millionverifier' }, request: REQ, apollo: APOLLO_HIT, verifierRaw: 'ok' }],
  ['pattern guess disabled', { cfgOverrides: { ...KEYS, PATTERN_GUESS_ENABLED: false }, request: REQ, apollo: APOLLO_MISS, rocketreach: RR_MISS }],
  ['no last name (guess impossible)', { cfgOverrides: KEYS, request: { ...REQ, last_name: '' }, apollo: APOLLO_MISS, rocketreach: RR_MISS }],
  ['no lead_id supplied', { cfgOverrides: KEYS, request: { ...REQ, lead_id: '' }, apollo: APOLLO_HIT, verifierRaw: 'valid' }],
];

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('scenario', 34), pad('email', 22), pad('src', 13), pad('status', 9), pad('conf', 5), 'action');
console.log('-'.repeat(100));
let failed = 0;
for (const [name, sc] of cases) {
  try {
    const r = run(sc);
    console.log(pad(name, 34), pad(r.email || '(blank)', 22), pad(r.email_source || '-', 13),
      pad(r.email_status, 9), pad(r.confidence, 5), r.recommended_action,
      '| tried:' + (r.tried || []).join(',') || '-');
  } catch (e) {
    failed++;
    console.log(pad(name, 34), 'THREW: ' + e.message);
  }
}
console.log('-'.repeat(100));

// explicit assertions on the promises the README makes
const assert = (label, cond) => { if (!cond) { failed++; console.log('ASSERT FAIL:', label); } else console.log('ok  ', label); };
const dry = run({ cfgOverrides: {}, request: REQ });
assert('dry run returns a blank, not a guess', dry.email === '' && dry.confidence === 0 && dry.recommended_action === 'do_not_send');
assert('dry run reports what it skipped', JSON.stringify(dry.providers_skipped) === JSON.stringify(['apollo', 'rocketreach', 'verifier']));
const g = run({ cfgOverrides: { VERIFIER_API_KEY: 'v' }, request: REQ, verifierRaw: 'valid' });
assert('confirmed guess scores 55 / review', g.confidence === 55 && g.recommended_action === 'review');
const gu = run({ cfgOverrides: { VERIFIER_API_KEY: 'v' }, request: REQ, verifierRaw: 'catchall' });
assert('unconfirmed guess is discarded', gu.email === '' && gu.confidence === 0);
const ca = run({ cfgOverrides: KEYS, request: REQ, apollo: APOLLO_HIT, verifierRaw: 'catchall' });
assert('catch-all is held for review, never auto-sent', ca.email_status === 'risky' && ca.confidence === 75 && ca.recommended_action === 'review');
const a = run({ cfgOverrides: KEYS, request: REQ, apollo: APOLLO_HIT, verifierRaw: 'valid' });
assert('apollo + valid scores 100 / send', a.confidence === 100 && a.recommended_action === 'send');
const nv = run({ cfgOverrides: { APOLLO_API_KEY: 'a' }, request: REQ, apollo: APOLLO_HIT });
assert('apollo without verifier keeps address at unknown', nv.email && nv.email_status === 'unknown' && nv.confidence === 70);
const out = run({ cfgOverrides: KEYS, request: REQ, apollo: APOLLO_HIT, verifierRaw: null });
assert('verifier outage never returns valid', out.email_status === 'unknown' && out.confidence === 70);
const inv = run({ cfgOverrides: KEYS, request: REQ, apollo: APOLLO_HIT, verifierRaw: 'invalid' });
assert('invalid is dropped, not downgraded', inv.email === '' && inv.confidence === 0);
assert('domain is normalised out of a full url', dry.domain === 'acme.example');
const noid = run({ cfgOverrides: KEYS, request: { ...REQ, lead_id: '' }, apollo: APOLLO_HIT, verifierRaw: 'valid' });
assert('lead_id is minted and flagged when missing', noid.lead_id === 'acme-com-jane-doe' && noid.lead_id_generated === true);
assert('callback_url never leaks into the response', !('callback_url' in a));

console.log(failed ? `\n${failed} FAILURE(S)` : '\nall checks passed');
process.exit(failed ? 1 : 0);
