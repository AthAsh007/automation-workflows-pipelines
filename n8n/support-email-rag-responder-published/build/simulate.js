// Runs both workflows' Code nodes against the demo emails and demo knowledge base, down the
// path an import with nothing configured takes, and then down the OpenAI + Pinecone + Gmail
// paths with stand-in API responses, including failed and malformed ones. It is the test plan
// in the spec, run before anything is imported into n8n.
//   bun simulate.js            (--show prints every reply and escalation)
const fs = require('fs');
const path = require('path');
const SHOW = process.argv.includes('--show');

function load(file) {
  const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
  const nodes = {};
  for (const n of wf.nodes) if (n.type === 'n8n-nodes-base.code') nodes[n.name] = n;
  return nodes;
}
let failures = 0;
let checks = 0;
const expect = (label, got, want) => {
  checks++;
  const ok = String(got) === String(want);
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + label.padEnd(52) + String(got).slice(0, 70));
  if (!ok) { failures++; console.log('        expected: ' + want); }
};

// A minimal stand-in for the n8n Code node runtime: $input, $('node').first/all/itemMatching.
// itemMatching(i) returns the i-th item that node produced, which is what n8n's paired-item
// tracking gives when each node maps one item to one item, as every node here does.
function harness(WF, overrides) {
  const store = {};
  return {
    store,
    set(name, items) { store[name] = items; },
    run(name, items) {
      const node = WF[name];
      if (!node) throw new Error('no Code node named ' + name);
      const wrap = (a) => a.map((j) => ({ json: j }));
      const $input = { all: () => wrap(items), first: () => ({ json: items[0] }) };
      const $ = (n) => {
        const a = store[n];
        if (!a) throw new Error('simulate: "' + n + '" has no recorded output');
        return { all: () => wrap(a), first: () => ({ json: a[0] }), itemMatching: (i) => ({ json: a[i] }) };
      };
      let src = node.parameters.jsCode;
      if (name === 'config' && overrides) {
        for (const [k, v] of Object.entries(overrides)) {
          const re = new RegExp('^const ' + k + '\\s*=.*$', 'm');
          if (!re.test(src)) throw new Error('no const ' + k + ' in config');
          src = src.replace(re, 'const ' + k + ' = ' + v + ';');
        }
      }
      const out = new Function('$input', '$', '"use strict";' + src)($input, $);
      store[name] = out.map((o) => o.json);
      return store[name];
    }
  };
}
const by = (list, from) => list.find((x) => x.from === from);
const chat = (obj) => ({ choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }] });
const vec = () => ({ data: [{ embedding: Array.from({ length: 8 }, (_, i) => i / 10) }] });

const W1 = load('01-answer-support-email.json');
const W2 = load('02-load-knowledge-base.json');

// ============================================================ 01, preview, nothing configured
console.log('--- 01: demo emails, nothing configured ---');
let h = harness(W1);
let cfg = h.run('config', [{}])[0];
expect('mode', cfg.mode, 'preview');
expect('nothing enabled', [cfg.openai_enabled, cfg.retrieval_enabled, cfg.send_enabled, cfg.alert_enabled].join(), 'false,false,false,false');

const read = h.run('read the email', h.store.config);
expect('six demo emails read', read.length, 6);
expect('all marked demo', read.every((e) => e.demo), true);
const bad = read.filter((e) => !e.usable);
expect('empty email is unreadable', bad.map((e) => e.problem).join(), 'no usable sender address');
expect('unreadable stops by name', h.run('STOP: unreadable email', bad)[0].outcome, 'ignored: no usable sender address');

const cls = h.run('classify by keywords', read.filter((e) => e.usable));
expect('portal question: support, answer', [by(cls, 'priya@example.com').category, by(cls, 'priya@example.com').route].join(), 'support,answer');
expect('portal question intent', by(cls, 'priya@example.com').intent, 'access');
expect('invoice follow-up intent', by(cls, 'tom@example.org').intent, 'billing');
expect('sales pitch: not support', by(cls, 'hello@example.com').route, 'not_support');
expect('complaint + refund: person', by(cls, 'mark@example.co.uk').route, 'person');
expect('complaint intent', by(cls, 'mark@example.co.uk').intent, 'refund');
expect('classified by keyword rules', cls[0].classified_by, 'keyword rules');
expect('not-support stops by name', h.run('STOP: not a support email', cls.filter((c) => c.route === 'not_support'))[0].outcome,
  'not a support email: left in the inbox');

const toAnswer = cls.filter((c) => c.route === 'answer');
expect('three go on to retrieval', toAnswer.length, 3);
const kb = h.run('search the demo knowledge base', toAnswer);
expect('portal question finds the portal entry', by(kb, 'priya@example.com').matches[0].id, 'portal-access#0');
expect('portal question: enough knowledge', by(kb, 'priya@example.com').knowledge_ok, true);
expect('invoice question finds invoices', by(kb, 'tom@example.org').matches[0].id, 'invoices#0');
expect('invoice question: enough knowledge', by(kb, 'tom@example.org').knowledge_ok, true);
expect('TikTok question: not enough knowledge', by(kb, 'ana@example.net').knowledge_ok, false);
expect('...with the reason', /^not enough knowledge/.test(by(kb, 'ana@example.net').knowledge_reason), true);

const written = h.run('write the reply from the knowledge', kb.filter((k) => k.knowledge_ok));
expect('template reply uses only the knowledge', by(written, 'priya@example.com').reply_text.includes('Forgot password'), true);
expect('template reply greets by first name', by(written, 'priya@example.com').reply_text.startsWith('Hi Priya,'), true);
expect('sources recorded', by(written, 'tom@example.org').used_sources.join(), 'invoices#0');

const addressed = h.run('address the reply', written);
const tom = by(addressed, 'tom@example.org');
expect('thread: reply attaches to the message id', tom.reply_to_message_id, 'demo-msg-002');
expect('thread: reply stays in the thread', tom.reply_thread_id, 'demo-thread-777');
expect('thread: In-Reply-To is the original Message-ID', tom.reply_in_reply_to, '<b2@example.org>');
expect('thread: no "Re: Re:"', tom.reply_subject, 'Re: March invoice');
expect('first email gets "Re:"', by(addressed, 'priya@example.com').reply_subject, 'Re: Locked out of the portal');
expect('preview: nothing held by the cap', addressed.some((a) => a.held_by_cap), false);
const shown = h.run('STOP: preview - reply not sent', addressed);
expect('preview shows both replies', shown.length, 2);
expect('preview outcome', shown[0].outcome, 'preview: reply not sent (mode preview)');

const esc = h.run('prepare the escalation', [by(cls, 'mark@example.co.uk'), by(kb, 'ana@example.net')]);
expect('complaint escalation reason', /^needs a person: refund/.test(esc[0].escalation_reason), true);
expect('no-knowledge escalation reason', /^not enough knowledge/.test(esc[1].escalation_reason), true);
expect('escalation links the thread', esc[1].alert_body.includes('#all/demo-thread-003'), true);
const escShown = h.run('STOP: preview - escalation not sent', esc);
expect('preview shows both escalations', escShown.length, 2);
expect('escalation preview outcome', escShown[0].outcome, 'preview: escalation not sent');
if (SHOW) {
  for (const s of shown) console.log('\n=== reply -> ' + s.to + '\n' + s.reply);
  for (const s of escShown) console.log('\n=== escalation: ' + s.reason + '\n' + s.alert_body);
}

// ============================================================ 01, a real Gmail trigger payload
console.log('\n--- 01: a real Gmail trigger item ---');
h = harness(W1, { OWN_ADDRESSES: "['support@demo-agency.example']" });
cfg = h.run('config', [
  { id: '18f0a', threadId: '18e99', messageId: '<CAF123@mail.example>', subject: 'Re: report access',
    from: { value: [{ address: 'Jo.Bloggs@Example.com', name: 'Jo Bloggs' }] },
    text: 'Still cannot see the dashboard.\n\nOn Mon, 1 Sep 2026, Support wrote:\n> Try logging in again', headers: {} },
  { id: '18f0b', threadId: '18f0b', subject: 'Re: hi', from: { value: [{ address: 'support@demo-agency.example', name: 'Us' }] },
    text: 'our own reply', headers: {} },
  { id: '18f0c', threadId: '18f0c', subject: 'Out of office', from: { value: [{ address: 'x@example.com' }] },
    text: 'I am away', headers: { 'auto-submitted': 'auto-replied' } }
]);
const real = h.run('read the email', h.store.config);
expect('not demo', real[0].demo, false);
expect('sender lower-cased', real[0].from, 'jo.bloggs@example.com');
expect('quoted history dropped', real[0].body, 'Still cannot see the dashboard.');
expect('thread id captured', real[0].thread_id, '18e99');
expect('Message-ID captured', real[0].rfc_message_id, '<CAF123@mail.example>');
expect('our own mail ignored', real[1].problem, 'sent from one of our own addresses');
expect('auto-reply ignored', real[2].problem, 'an automatic or bulk message');

// ============================================================ 01, OpenAI + Pinecone, stand-in responses
console.log('\n--- 01: OpenAI + Pinecone configured, stand-in API responses ---');
h = harness(W1, { USE_OPENAI: 'true', PINECONE_INDEX_HOST: "'https://support-kb.svc.example.pinecone.io'" });
cfg = h.run('config', [{}])[0];
expect('retrieval enabled', cfg.retrieval_enabled, true);
expect('still preview', cfg.send_enabled, false);
const emails = h.run('read the email', h.store.config).filter((e) => e.usable);
const req = h.run('build the classification request', emails);
expect('classifier gets only subject and body', req[0]._body.messages[1].content.startsWith('Subject: Locked out'), true);
expect('classifier asked for JSON', req[0]._body.response_format.type, 'json_object');
const aiCls = h.run('apply the AI classification', [
  chat({ category: 'support', intent: 'access', handoff: false, confidence: 0.93, reason: 'portal login' }),
  chat('not json at all'),
  { error: { message: '401 Incorrect API key provided' } },
  chat({ category: 'not_support', intent: 'other', handoff: false, confidence: 0.97, reason: 'sales pitch' }),
  chat({ category: 'support', intent: 'complaint', handoff: true, confidence: 0.9, reason: 'angry, wants refund' })
]);
expect('AI classification used', aiCls[0].classified_by, 'AI (gpt-4o-mini)');
expect('unparseable answer falls back to keywords', aiCls[1].classified_by, 'keyword rules (AI answer did not parse)');
expect('invalid credential falls back to keywords', /^keyword rules \(AI call failed: 401/.test(aiCls[2].classified_by), true);
expect('...and still classifies', aiCls[2].route, 'answer');
expect('AI not-support routes out', aiCls[3].route, 'not_support');
expect('AI handoff routes to a person', aiCls[4].route, 'person');
const lowConf = h.run('apply the AI classification', [chat({ category: 'support', intent: 'question', handoff: false, confidence: 0.4, reason: 'unclear' })]);
expect('low confidence goes to a person', lowConf[0].route, 'person');
// restore the recorded requests for the pairing below
h.run('build the classification request', emails);
h.run('apply the AI classification', [
  chat({ category: 'support', intent: 'access', handoff: false, confidence: 0.93, reason: 'portal login' }),
  chat({ category: 'support', intent: 'billing', handoff: false, confidence: 0.9, reason: 'billing contact' }),
  chat({ category: 'support', intent: 'question', handoff: false, confidence: 0.8, reason: 'feed problem' })
]);
const three = h.store['apply the AI classification'];

const emb = h.run('build the embedding request', three);
expect('embedding model matches workflow 02', emb[0]._body.model, 'text-embedding-3-small');
const q = h.run('build the Pinecone query', [vec(), vec(), { error: { message: '429 Rate limit reached' } }]);
expect('embedded questions get a query', [q[0].embedded, q[0]._body.topK, q[0]._body.includeMetadata].join(), 'true,4,true');
expect('failed embedding does not query', q[2].embedded, false);
expect('...and says why', /^knowledge search failed: OpenAI embeddings - 429/.test(q[2].knowledge_reason), true);
h.set('build the Pinecone query', q.slice(0, 2));
const m = h.run('read the matches', [
  { matches: [{ id: 'portal-access#0', score: 0.86, metadata: { title: 'Logging in to the client portal', text: 'Click Forgot password.', source: 'demo' } }] },
  { matches: [{ id: 'invoices#0', score: 0.52, metadata: { title: 'Invoices', text: 'Invoices are issued monthly.', source: 'demo' } }] }
]);
expect('relevant match passes the gate', m[0].knowledge_ok, true);
expect('irrelevant match fails the gate', m[1].knowledge_ok, false);
expect('...with the floor in the reason', m[1].knowledge_reason, 'not enough knowledge: best match scored 0.52, below the floor of 0.75');
const mErr = h.run('read the matches', [{ error: { message: '401 Invalid API Key' } }, { matches: [] }]);
expect('Pinecone failure is no knowledge', /^knowledge search failed: Pinecone - 401/.test(mErr[0].knowledge_reason), true);
expect('empty index is no knowledge', mErr[1].knowledge_reason, 'not enough knowledge: the index returned nothing for this question');

h.set('read the matches', m);
const rr = h.run('build the reply request', [m[0], m[0], m[0], m[0], m[0]]);
expect('reply prompt carries the excerpt id', rr[0]._body.messages[1].content.includes('[portal-access#0]'), true);
expect('reply prompt forbids outside knowledge', rr[0]._body.messages[0].content.includes('ONLY from the knowledge excerpts'), true);
const ar = h.run('apply the AI reply', [
  chat({ reply: 'Hi Priya, click Forgot password.\n\nThe Demo Agency support team', used_sources: ['portal-access#0'], escalate: false, reason: '' }),
  chat({ reply: '', used_sources: [], escalate: true, reason: 'excerpts do not cover this' }),
  chat({ reply: 'Sure, refunded.', used_sources: ['refund-policy#3'], escalate: false }),
  chat({ reply: 'Hello.', used_sources: [], escalate: false }),
  { error: { message: '500 The server had an error' } }
]);
expect('grounded reply may be sent', ar[0].reply_ok, true);
expect('model refusal goes to a person', /^the model said the knowledge does not answer it/.test(ar[1].reply_problem), true);
expect('invented source goes to a person', ar[2].reply_problem, 'the reply cites a source it was not given: refund-policy#3');
expect('uncited reply goes to a person', ar[3].reply_problem, 'the reply cites no knowledge source');
expect('generation failure goes to a person', /^reply generation failed: 500/.test(ar[4].reply_problem), true);
const escAi = h.run('prepare the escalation', [ar[2]]);
expect('escalation carries the unsent draft', escAi[0].alert_body.includes('Draft that was not sent:\nSure, refunded.'), true);

// ============================================================ 01, test and live modes
console.log('\n--- 01: test mode and live mode ---');
h = harness(W1, { TEST_EMAIL: "'me@example.com'" });
cfg = h.run('config', [{}])[0];
expect('test mode', [cfg.mode, cfg.send_enabled, cfg.alert_enabled].join(), 'test,true,true');
const four = [0, 1, 2, 3].map((n) => Object.assign({}, written[0], { from: 'c' + n + '@example.com' }));
const tAddr = h.run('address the reply', four);
expect('test copies go to TEST_EMAIL', tAddr[0].test_to, 'me@example.com');
expect('test subject marked', tAddr[0].test_subject, '[TEST] Re: Locked out of the portal');
expect('test body names the real thread', tAddr[0].test_body.includes('in thread demo-thread-001'), true);
expect('TEST_CAP holds the fourth', tAddr.map((a) => a.held_by_cap).join(), 'false,false,false,true');
expect('test mode is not live', tAddr[0].live, false);
h.set('address the reply', tAddr);
expect('test copy sent', h.run('STOP: test copy sent', [{ id: 'g1' }])[0].outcome, 'test copy sent to me@example.com');
const tEsc = h.run('prepare the escalation', [by(cls, 'mark@example.co.uk')]);
expect('test escalation redirected', [tEsc[0].alert_to, tEsc[0].alert_subject.startsWith('[TEST] ')].join(), 'me@example.com,true');

h = harness(W1, { TEST_RUN: 'false' });
cfg = h.run('config', [{}])[0];
expect('live, no team inbox: replies on, alerts off', [cfg.mode, cfg.send_enabled, cfg.alert_enabled].join(), 'live,true,false');
const lAddr = h.run('address the reply', written);
expect('live reply', lAddr[0].live, true);
h.set('address the reply', lAddr);
const replied = h.run('STOP: replied in the thread', [{ id: 'g2', threadId: 'demo-thread-001' }, { id: 'g3', threadId: 'NEW' }]);
expect('same thread confirmed', replied[0].same_thread, true);
expect('a reply that left the thread is visible', replied[1].same_thread, false);
expect('Gmail refusal keeps the error', h.run('STOP: Gmail refused the send', [{ error: { message: 'Requested entity was not found.' } }])[0].error,
  'Requested entity was not found.');
const lEsc = h.run('prepare the escalation', [by(cls, 'mark@example.co.uk')]);
expect('no team inbox: shown, not sent', h.run('STOP: preview - escalation not sent', lEsc)[0].outcome, 'no SUPPORT_TEAM_EMAIL: escalation not sent');

h = harness(W1, { TEST_RUN: 'false', REPLY_CAP_PER_RUN: '1' });
h.run('config', [{}]);
expect('REPLY_CAP_PER_RUN enforced', h.run('address the reply', written).map((a) => a.held_by_cap).join(), 'false,true');

// ============================================================ 02
console.log('\n--- 02: load the knowledge base ---');
h = harness(W2);
cfg = h.run('config', [{}])[0];
expect('loading off in preview', cfg.upsert_enabled, false);
const docs = h.run('use the demo knowledge base', [cfg]);
expect('five demo documents', docs.length, 5);
const ch = h.run('chunk the documents', docs)[0];
expect('one chunk per short document', ch.chunk_count, 5);
expect('chunk ids are stable', ch.chunks[0].id, 'portal-access#0');
const pv = h.run('STOP: preview - vectors not upserted', [ch])[0];
expect('preview outcome', pv.outcome, 'OpenAI and Pinecone not configured: 5 chunks from 5 documents not upserted');
expect('preview shows the metadata', pv.would_upsert[1].metadata.title, 'Invoices and billing');

h = harness(W2, { USE_OPENAI: 'true', PINECONE_INDEX_HOST: "'https://support-kb.svc.example.pinecone.io'",
  TEST_EMAIL: "'me@example.com'", DOC_URLS: "['https://help.example.com/a', 'https://help.example.com/b', 'https://help.example.com/c']",
  CHUNK_WORDS: '50', CHUNK_OVERLAP: '10' });
cfg = h.run('config', [{}])[0];
expect('loading on in test mode', cfg.upsert_enabled, true);
const list = h.run('list the documents', [cfg]);
expect('doc ids from the URLs', list[0].doc_id, 'help-example-com-a');
const long = '<html><head><title>Billing FAQ</title><style>x{}</style></head><body><p>' + Array.from({ length: 120 }, (_, i) => 'word' + i).join(' ') + '</p></body></html>';
const texts = h.run('read the document text', [{ data: long }, { error: { message: 'getaddrinfo ENOTFOUND' } }, { data: '<p>tiny</p>' }]);
expect('page read, title kept', [texts[0].ok, texts[0].title].join(), 'true,Billing FAQ');
expect('fetch failure is listed', texts[1].problem, 'fetch failed: getaddrinfo ENOTFOUND');
expect('near-empty page is listed', texts[2].problem, 'almost no text on the page');
const ch2 = h.run('chunk the documents', texts)[0];
expect('overlapping chunks (120 words, 50/10)', ch2.chunk_count, 3);
expect('skipped pages reported', ch2.skipped.length, 2);
expect('overlap: chunk 2 starts at word 40', ch2.chunks[1].text.split(' ')[0], 'word40');
const bt = h.run('build the embedding batches', [ch2]);
expect('one batch', [bt.length, bt[0]._body.input.length].join(), '1,3');
const up = h.run('build the Pinecone upsert', [{ data: [0, 1, 2].map(() => ({ embedding: [0.1, 0.2] })) }]);
expect('vectors carry text as metadata', [up[0].embedded, up[0]._body.vectors[0].metadata.text.startsWith('word0')].join(), 'true,true');
expect('namespace from config', up[0]._body.namespace, 'support-kb');
const upBad = h.run('build the Pinecone upsert', [{ error: { message: '400 dimensions mismatch' } }]);
expect('failed batch not upserted', upBad[0].embedded, false);
expect('embedding failure reported', h.run('STOP: embedding failed', upBad)[0].outcome, 'batch 1 not embedded: 400 dimensions mismatch');
h.set('build the Pinecone upsert', up);
expect('Pinecone count reported', h.run('STOP: knowledge base loaded', [{ upsertedCount: 3 }])[0].upserted, 3);

console.log('\n' + checks + ' checks, ' + (failures ? failures + ' FAILED' : 'all passed'));
process.exit(failures ? 1 : 0);
