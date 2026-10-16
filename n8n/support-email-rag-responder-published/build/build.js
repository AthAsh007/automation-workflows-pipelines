// Builds ../01-answer-support-email.json and ../02-load-knowledge-base.json from js/*.js.
// Run: bun build.js   (or: node build.js)
// `//@include lib-classify.js` inside a node's code is replaced by that file, so the keyword
// classifier and the AI fallback are the same function.
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const OUT = path.join(HERE, '..');
const CFG = "$('config').first().json";

function js(file) {
  const src = fs.readFileSync(path.join(HERE, 'js', file), 'utf8').trimEnd();
  return src.replace(/^\/\/@include (\S+)\s*$/m, (_, inc) =>
    fs.readFileSync(path.join(HERE, 'js', inc), 'utf8').trimEnd());
}
const pos = (col, lane) => [col * 260, lane * 200];

const code = (id, name, p, file, extra) => Object.assign({ parameters: { jsCode: js(file) }, id, name,
  type: 'n8n-nodes-base.code', typeVersion: 2, position: p }, extra || {});

function ifExpr(id, name, p, left) {
  return { parameters: { conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id: id + '-c', leftValue: left, rightValue: 'true',
        operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and' }, looseTypeValidation: true, options: {} },
    id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: p };
}
const ifFlag = (id, name, p, flag) => ifExpr(id, name, p, '={{ ' + CFG + '.' + flag + ' }}');

// OpenAI over plain HTTP with n8n's own OpenAI credential, so no LangChain nodes are needed and
// no key is ever in the file. Retries cover rate limits and blips; a call that still fails
// comes out as an item with `error`, which the next Code node turns into a named outcome.
const openai = (id, name, p, endpoint, note) => ({
  parameters: { method: 'POST', url: 'https://api.openai.com/v1/' + endpoint,
    authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi',
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json._body) }}',
    options: { timeout: 60000 } },
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: p,
  retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, onError: 'continueRegularOutput', notes: note });

// Pinecone's data plane: the index host from config, the API key in a Header Auth credential
// (header name Api-Key).
const pinecone = (id, name, p, route, onError, note) => ({
  parameters: { method: 'POST', url: '={{ ' + CFG + ".pinecone_index_host + '" + route + "' }}",
    authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
    sendHeaders: true, headerParameters: { parameters: [{ name: 'X-Pinecone-API-Version', value: '2025-01' }] },
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json._body) }}',
    options: { timeout: 30000 } },
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: p,
  retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, onError, notes: note });

const gmail = (id, name, p, parameters, note) => ({ parameters, id, name, type: 'n8n-nodes-base.gmail',
  typeVersion: 2.1, position: p, webhookId: id, retryOnFail: true, maxTries: 2, waitBetweenTries: 5000,
  onError: 'continueErrorOutput', notes: note });
const sendMail = (to, subject, message) => ({ sendTo: '={{ $json.' + to + ' }}', subject: '={{ $json.' + subject + ' }}',
  emailType: 'text', message: '={{ $json.' + message + ' }}', options: { appendAttribution: false } });

const sticky = (id, p, w, h, colour, content) => ({ parameters: { content, height: h, width: w, color: colour },
  id, name: 'Sticky Note ' + id, type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: p });

const link = (...t) => ({ main: [t.map((n) => ({ node: n, type: 'main', index: 0 }))] });
const branch = (yes, no) => ({ main: [yes.map((n) => ({ node: n, type: 'main', index: 0 })),
                                        no.map((n) => ({ node: n, type: 'main', index: 0 }))] });

function save(file, name, nodes, connections) {
  const wf = { name, nodes, connections, settings: { executionOrder: 'v1' }, pinData: {},
    meta: { templateCredsSetupCompleted: false }, tags: [] };
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(wf, null, 2) + '\n');
  console.log('wrote ' + file + ' (' + nodes.filter((n) => !/sticky/i.test(n.type)).length + ' nodes)');
}

// ===================================================================== WORKFLOW 01
const ESC = 'prepare the escalation';
const w1 = [
  { parameters: { pollTimes: { item: [{ mode: 'everyMinute' }] }, simple: false,
      filters: { readStatus: 'unread', q: 'in:inbox -from:me' }, options: {} },
    id: 'trigger', name: '[cred] Gmail - new email in the inbox', type: 'n8n-nodes-base.gmailTrigger',
    typeVersion: 1.2, position: pos(0, 0),
    notes: 'Polls the support inbox every minute. "Simplify" is off so the full body, the thread id and the Message-ID header come through.' },
  { parameters: {}, id: 'demo', name: 'Run the demo emails', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0, 1) },
  code('cfg1', 'config', pos(1, 0.5), 'config.js'),
  code('read', 'read the email', pos(2, 0.5), 'read-the-email.js'),
  ifExpr('usable', 'a readable email?', pos(3, 0.5), '={{ $json.usable }}'),
  code('unreadable', 'STOP: unreadable email', pos(4, 2), 'stop-unreadable-email.js'),

  ifFlag('ai-on', 'OpenAI configured?', pos(4, 0.5), 'openai_enabled'),
  code('cls-req', 'build the classification request', pos(5, 0), 'build-the-classification-request.js'),
  openai('cls-http', '[cred] OpenAI - classify the email', pos(6, 0), 'chat/completions',
    'Returns a typed classification only. It never sees the knowledge base and never writes a reply.'),
  code('cls-apply', 'apply the AI classification', pos(7, 0), 'apply-the-ai-classification.js'),
  code('cls-kw', 'classify by keywords', pos(7, 1), 'classify-by-keywords.js'),
  ifExpr('support', 'a support request?', pos(8, 0.5), "={{ $json.route !== 'not_support' }}"),
  code('not-support', 'STOP: not a support email', pos(9, 2), 'stop-not-a-support-email.js'),
  ifExpr('person', 'needs a person?', pos(9, 0.5), "={{ $json.route === 'person' }}"),

  ifFlag('rag-on', 'knowledge search configured?', pos(10, 0.5), 'retrieval_enabled'),
  code('emb-req', 'build the embedding request', pos(11, 0), 'build-the-embedding-request.js'),
  openai('emb-http', '[cred] OpenAI - embed the question', pos(12, 0), 'embeddings',
    'Same model as workflow 02 loaded the knowledge base with, or the scores mean nothing.'),
  code('pc-req', 'build the Pinecone query', pos(13, 0), 'build-the-pinecone-query.js'),
  ifExpr('embedded', 'question embedded?', pos(14, 0), '={{ $json.embedded }}'),
  pinecone('pc-http', '[cred] Pinecone - find matching knowledge', pos(15, 0), '/query', 'continueRegularOutput',
    'Top TOP_K chunks with their text as metadata. A failed query becomes "no knowledge", and no knowledge means a person answers.'),
  code('matches', 'read the matches', pos(16, 0), 'read-the-matches.js'),
  code('demo-kb', 'search the demo knowledge base', pos(16, 1), 'search-the-demo-knowledge-base.js'),
  ifExpr('enough', 'enough knowledge?', pos(17, 0.5), '={{ $json.knowledge_ok }}'),

  ifFlag('ai-write', 'OpenAI writes the reply?', pos(18, 0.5), 'openai_enabled'),
  code('rep-req', 'build the reply request', pos(19, 0), 'build-the-reply-request.js'),
  openai('rep-http', '[cred] OpenAI - write the reply', pos(20, 0), 'chat/completions',
    'Answers only from the retrieved excerpts, and must list which ones it used. It may refuse, which sends the email to a person.'),
  code('rep-apply', 'apply the AI reply', pos(21, 0), 'apply-the-ai-reply.js'),
  code('rep-tpl', 'write the reply from the knowledge', pos(21, 1), 'write-the-reply-from-the-knowledge.js'),
  ifExpr('rep-ok', 'a reply we can send?', pos(22, 0.5), '={{ $json.reply_ok }}'),
  code('address', 'address the reply', pos(23, 0.5), 'address-the-reply.js'),
  ifExpr('send-on', 'sending on?', pos(24, 0.5), '={{ ' + CFG + '.send_enabled && !$json.held_by_cap }}'),
  code('preview', 'STOP: preview - reply not sent', pos(25, 1.5), 'stop-preview-reply-not-sent.js'),
  ifExpr('live', 'live reply?', pos(25, 0.5), '={{ $json.live }}'),
  gmail('reply', '[cred] Gmail - reply in the thread', pos(26, 0),
    { resource: 'message', operation: 'reply', messageId: '={{ $json.reply_to_message_id }}', emailType: 'text',
      message: '={{ $json.reply_text }}', options: { appendAttribution: false, replyToSenderOnly: true } },
    'Replies on the customer\'s own message, so Gmail keeps it in their thread and sets In-Reply-To and References.'),
  code('replied', 'STOP: replied in the thread', pos(27, 0), 'stop-replied-in-the-thread.js'),
  gmail('test-copy', '[cred] Gmail - send the test copy', pos(26, 1), sendMail('test_to', 'test_subject', 'test_body'),
    'Test mode only: the reply goes to TEST_EMAIL, never to the customer.'),
  code('test-sent', 'STOP: test copy sent', pos(27, 1), 'stop-test-copy-sent.js'),
  code('refused', 'STOP: Gmail refused the send', pos(28, 2), 'stop-gmail-refused-the-send.js'),

  code('esc', ESC, pos(23, 3), 'prepare-the-escalation.js'),
  ifExpr('alert-on', 'alerts on?', pos(24, 3), '={{ ' + CFG + '.alert_enabled && !$json.held_by_cap }}'),
  gmail('alert', '[cred] Gmail - alert the support team', pos(25, 2.5), sendMail('alert_to', 'alert_subject', 'alert_body'),
    'One email per case, with the reason, the customer\'s words, what was retrieved and any draft.'),
  code('escalated', 'STOP: escalated to a person', pos(26, 2.5), 'stop-escalated-to-a-person.js'),
  code('esc-preview', 'STOP: preview - escalation not sent', pos(25, 3.5), 'stop-preview-escalation-not-sent.js'),

  sticky('start1', [-40, -700], 640, 600, 4,
    '## Answer support email — start here\n\n' +
    'The first of two workflows. Import it alongside **02-load-knowledge-base**; both share the same **config** node, and 02 is what fills the index this one searches.\n\n' +
    '**Run it before you configure anything.** Press **Execute Workflow** on **Run the demo emails**: six invented emails (two answerable, one with no matching knowledge, a sales pitch, a complaint, an empty one) through the whole thing, against a built-in demo knowledge base. ' +
    'Open **STOP: preview - reply not sent** and **STOP: preview - escalation not sent** to read every reply and every escalation. Nothing is sent.\n\n' +
    '**Setup, in order**\n' +
    '1. **config**: `COMPANY_NAME`, `SIGNATURE`, `SUPPORT_TEAM_EMAIL`, `OWN_ADDRESSES`.\n' +
    '2. Gmail credential on the trigger and the three `[cred] Gmail` nodes.\n' +
    '3. OpenAI credential on the three `[cred] OpenAI` nodes, then `USE_OPENAI = true`.\n' +
    '4. Pinecone: a Header Auth credential (`Api-Key`) on `[cred] Pinecone`, and `PINECONE_INDEX_HOST`. Load the index with workflow 02.\n' +
    '5. `TEST_EMAIL` = your address: real replies, all redirected to you.\n' +
    '6. Only then `TEST_RUN = false`.'),
  sticky('s1', [480, 480], 1560, 260, 7,
    '### 1. Read it, then decide if it is ours to answer\n\n`read the email` captures sender, subject, the new text of the body, and the message and thread ids the reply must attach to. Empty mail, our own mail and auto-replies stop at `STOP: unreadable email`. ' +
    'Classification is typed (category, intent, handoff, confidence). A sales pitch leaves the workflow; a complaint, refund or legal intent, or a classifier below `MIN_CLASSIFY_CONFIDENCE`, goes to a person.'),
  sticky('s2', [2600, 480], 1900, 260, 7,
    '### 2. Retrieve, and refuse to guess\n\nThe question is embedded with the same model as the knowledge base and matched in Pinecone. **`enough knowledge?` is the gate**: if the best chunk scores under `MIN_MATCH_SCORE`, or the search failed after its retries, the email goes to a person. ' +
    'The model is never asked to answer something the knowledge base does not cover.'),
  sticky('s3', [4700, 480], 2000, 260, 7,
    '### 3. Write from the excerpts, reply in the thread\n\nThe model gets the email and the excerpts only, must list the excerpts it used, and may refuse. A reply that cites nothing, cites an excerpt it was not given, or failed to generate goes to a person with the draft attached. ' +
    'The reply is sent on the customer\'s own message, so it stays in their thread. `TEST_RUN` decides whether it is shown, redirected to you, or sent.')
];
const c1 = {
  '[cred] Gmail - new email in the inbox': link('config'),
  'Run the demo emails': link('config'),
  config: link('read the email'),
  'read the email': link('a readable email?'),
  'a readable email?': branch(['OpenAI configured?'], ['STOP: unreadable email']),
  'OpenAI configured?': branch(['build the classification request'], ['classify by keywords']),
  'build the classification request': link('[cred] OpenAI - classify the email'),
  '[cred] OpenAI - classify the email': link('apply the AI classification'),
  'apply the AI classification': link('a support request?'),
  'classify by keywords': link('a support request?'),
  'a support request?': branch(['needs a person?'], ['STOP: not a support email']),
  'needs a person?': branch([ESC], ['knowledge search configured?']),
  'knowledge search configured?': branch(['build the embedding request'], ['search the demo knowledge base']),
  'build the embedding request': link('[cred] OpenAI - embed the question'),
  '[cred] OpenAI - embed the question': link('build the Pinecone query'),
  'build the Pinecone query': link('question embedded?'),
  'question embedded?': branch(['[cred] Pinecone - find matching knowledge'], [ESC]),
  '[cred] Pinecone - find matching knowledge': link('read the matches'),
  'read the matches': link('enough knowledge?'),
  'search the demo knowledge base': link('enough knowledge?'),
  'enough knowledge?': branch(['OpenAI writes the reply?'], [ESC]),
  'OpenAI writes the reply?': branch(['build the reply request'], ['write the reply from the knowledge']),
  'build the reply request': link('[cred] OpenAI - write the reply'),
  '[cred] OpenAI - write the reply': link('apply the AI reply'),
  'apply the AI reply': link('a reply we can send?'),
  'write the reply from the knowledge': link('a reply we can send?'),
  'a reply we can send?': branch(['address the reply'], [ESC]),
  'address the reply': link('sending on?'),
  'sending on?': branch(['live reply?'], ['STOP: preview - reply not sent']),
  'live reply?': branch(['[cred] Gmail - reply in the thread'], ['[cred] Gmail - send the test copy']),
  '[cred] Gmail - reply in the thread': branch(['STOP: replied in the thread'], ['STOP: Gmail refused the send']),
  '[cred] Gmail - send the test copy': branch(['STOP: test copy sent'], ['STOP: Gmail refused the send']),
  [ESC]: link('alerts on?'),
  'alerts on?': branch(['[cred] Gmail - alert the support team'], ['STOP: preview - escalation not sent']),
  '[cred] Gmail - alert the support team': branch(['STOP: escalated to a person'], ['STOP: Gmail refused the send'])
};
save('01-answer-support-email.json', '01 Answer support email from a Pinecone knowledge base', w1, c1);

// ===================================================================== WORKFLOW 02
const w2 = [
  { parameters: {}, id: 'run', name: 'Run it now', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: pos(0, 0.5) },
  code('cfg2', 'config', pos(1, 0.5), 'config.js'),
  ifFlag('docs-on', 'document list configured?', pos(2, 0.5), 'docs_enabled'),
  code('list', 'list the documents', pos(3, 0), 'list-the-documents.js'),
  { parameters: { url: '={{ $json.url }}', options: { timeout: 20000,
      response: { response: { responseFormat: 'text' } } } },
    id: 'fetch', name: 'Fetch the document', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(4, 0),
    retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, onError: 'continueRegularOutput',
    notes: 'Public pages only. A page that still fails after the retries is listed as skipped, not silently left out.' },
  code('doc-text', 'read the document text', pos(5, 0), 'read-the-document-text.js'),
  code('demo-kb2', 'use the demo knowledge base', pos(5, 1), 'use-the-demo-knowledge-base.js'),
  code('chunk', 'chunk the documents', pos(6, 0.5), 'chunk-the-documents.js'),
  ifFlag('load-on', 'loading on?', pos(7, 0.5), 'upsert_enabled'),
  code('preview2', 'STOP: preview - vectors not upserted', pos(8, 1.5), 'stop-preview-vectors-not-upserted.js'),
  code('batches', 'build the embedding batches', pos(8, 0.5), 'build-the-embedding-batches.js'),
  openai('emb2', '[cred] OpenAI - embed the chunks', pos(9, 0.5), 'embeddings',
    'The same model and dimensions workflow 01 embeds each question with.'),
  code('upsert-req', 'build the Pinecone upsert', pos(10, 0.5), 'build-the-pinecone-upsert.js'),
  ifExpr('batch-ok', 'batch embedded?', pos(11, 0.5), '={{ $json.embedded }}'),
  code('emb-fail', 'STOP: embedding failed', pos(12, 1.5), 'stop-embedding-failed.js'),
  pinecone('upsert', '[cred] Pinecone - upsert the vectors', pos(12, 0.5), '/vectors/upsert', 'continueErrorOutput',
    'Chunk ids are stable, so loading the same page again overwrites its chunks rather than duplicating them.'),
  code('loaded', 'STOP: knowledge base loaded', pos(13, 0), 'stop-knowledge-base-loaded.js'),
  code('pc-refused', 'STOP: Pinecone refused the upsert', pos(13, 1), 'stop-pinecone-refused-the-upsert.js'),
  sticky('start2', [-40, -640], 620, 540, 4,
    '## Load the knowledge base — start here\n\n' +
    'The second of two workflows. Import it alongside **01-answer-support-email**; both share the same **config** node. Run this one whenever the help content changes.\n\n' +
    '**Run it before you configure anything.** Press **Execute Workflow** on **Run it now**: the demo knowledge base is chunked and every chunk is shown on **STOP: preview - vectors not upserted**, exactly as it would be loaded. Nothing is embedded or written.\n\n' +
    '**Setup, in order**\n' +
    '1. Create a Pinecone index: dimension = `EMBED_DIMENSIONS` (1536), metric cosine. Put its host in `PINECONE_INDEX_HOST`.\n' +
    '2. `DOC_URLS`: the public help pages to load.\n' +
    '3. OpenAI credential on `[cred] OpenAI - embed the chunks`, Header Auth (`Api-Key`) on `[cred] Pinecone`, `USE_OPENAI = true`.\n' +
    '4. `TEST_EMAIL` set or `TEST_RUN = false`: loading is skipped in preview.'),
  sticky('s21', [480, 440], 1320, 240, 7,
    '### 1. Read the pages and chunk them\n\nEach page is fetched on its own, so one broken URL is listed as skipped rather than failing the load. Text is split into overlapping windows of `CHUNK_WORDS`, and each chunk keeps its title and source.'),
  sticky('s22', [2040, 440], 1400, 240, 7,
    '### 2. Embed and upsert\n\nChunks are embedded in batches of 96 with the same model workflow 01 uses for questions, then upserted with the text as metadata, which is what replies are written from. A batch that fails is reported with its error and the rest still load.')
];
const c2 = {
  'Run it now': link('config'),
  config: link('document list configured?'),
  'document list configured?': branch(['list the documents'], ['use the demo knowledge base']),
  'list the documents': link('Fetch the document'),
  'Fetch the document': link('read the document text'),
  'read the document text': link('chunk the documents'),
  'use the demo knowledge base': link('chunk the documents'),
  'chunk the documents': link('loading on?'),
  'loading on?': branch(['build the embedding batches'], ['STOP: preview - vectors not upserted']),
  'build the embedding batches': link('[cred] OpenAI - embed the chunks'),
  '[cred] OpenAI - embed the chunks': link('build the Pinecone upsert'),
  'build the Pinecone upsert': link('batch embedded?'),
  'batch embedded?': branch(['[cred] Pinecone - upsert the vectors'], ['STOP: embedding failed']),
  '[cred] Pinecone - upsert the vectors': branch(['STOP: knowledge base loaded'], ['STOP: Pinecone refused the upsert'])
};
save('02-load-knowledge-base.json', '02 Load help pages into a Pinecone knowledge base', w2, c2);
