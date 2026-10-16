// Node builders for library specs.
//
// Every parameter shape here is copied from a workflow that has already been
// imported into n8n (see the catalogue in _kit/README.md), so a spec that only
// uses these builders produces JSON n8n accepts on import.
//
// Two private markers ride on a node while it is being built and are stripped
// before anything is written:
//   _outward  this node reaches the outside world (sends, posts, writes).
//             The simulator fails a spec if one of these runs in preview mode.
//   _service  this node needs an n8n credential. The simulator fails a spec if
//             one of these runs in the zero-credential default scenario.

export type N8nNode = {
  name: string;
  type: string;
  typeVersion: number;
  parameters: Record<string, any>;
  credentials?: Record<string, any>;
  webhookId?: string;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  alwaysOutputData?: boolean;
  onError?: string;
  _outward?: boolean;
  _service?: boolean;
  _sub?: boolean;
};

const cfg = (key: string) => `$('config').first().json.${key}`;
export const c = (key: string) => `={{ ${cfg(key)} }}`;
export const e = (js: string) => `={{ ${js} }}`;

function hashId(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  const a = hex(h), b = hex(Math.imul(h, 2654435761)), d = hex(Math.imul(h ^ 0x5bd1e995, 40503));
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-a${d.slice(1, 4)}-${d}${a.slice(0, 4)}`;
}
export const uid = hashId;

// ---------------------------------------------------------------- triggers

export const trigger = {
  manual: (name = 'Run manually'): N8nNode =>
    ({ name, type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, parameters: {} }),

  /** cron in the instance timezone, e.g. '0 8 * * 1-5' */
  schedule: (name: string, cron: string): N8nNode =>
    ({ name, type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2,
       parameters: { rule: { interval: [{ field: 'cronExpression', expression: cron }] } } }),

  webhook: (name: string, path: string, opts: { method?: string; respond?: 'immediately' | 'node' } = {}): N8nNode =>
    ({ name, type: 'n8n-nodes-base.webhook', typeVersion: 2, webhookId: hashId('wh:' + path),
       parameters: { httpMethod: opts.method || 'POST', path,
         ...(opts.respond === 'node' ? { responseMode: 'responseNode' } : {}), options: {} } }),

  form: (name: string, title: string, description: string,
         fields: { label: string; type?: 'text' | 'email' | 'number' | 'textarea' | 'date' | 'dropdown'; required?: boolean; options?: string[] }[]): N8nNode =>
    ({ name, type: 'n8n-nodes-base.formTrigger', typeVersion: 2.2, webhookId: hashId('form:' + title),
       parameters: { formTitle: title, formDescription: description,
         formFields: { values: fields.map(f => ({ fieldLabel: f.label,
           ...(f.type && f.type !== 'text' ? { fieldType: f.type } : {}),
           ...(f.type === 'dropdown' ? { fieldOptions: { values: (f.options || []).map(o => ({ option: o })) } } : {}),
           ...(f.required ? { requiredField: true } : {}) })) },
         options: {} } }),

  gmail: (name: string, query: string): N8nNode =>
    ({ name, type: 'n8n-nodes-base.gmailTrigger', typeVersion: 1.2, _service: true,
       parameters: { pollTimes: { item: [{ mode: 'everyMinute' }] }, simple: false,
         filters: { readStatus: 'unread', q: query }, options: {} } }),

  subworkflow: (name: string, inputs: { name: string; type?: 'string' | 'number' | 'boolean' | 'object' | 'array' }[]): N8nNode =>
    ({ name, type: 'n8n-nodes-base.executeWorkflowTrigger', typeVersion: 1.1,
       parameters: { workflowInputs: { values: inputs.map(i => i.type && i.type !== 'string' ? { name: i.name, type: i.type } : { name: i.name }) } } }),
};

// ---------------------------------------------------------------- logic

export const code = (name: string, js: string, opts: { perItem?: boolean } = {}): N8nNode =>
  ({ name, type: 'n8n-nodes-base.code', typeVersion: 2,
     parameters: { ...(opts.perItem ? { mode: 'runOnceForEachItem' } : {}), jsCode: js.trim() + '\n' } });

type Op = 'true' | 'false' | 'equals' | 'notEquals' | 'contains' | 'notEmpty' | 'empty' | 'gt' | 'gte' | 'lt' | 'lte';

function condition(id: string, left: string, op: Op, right: any = '') {
  const boolOps = ['true', 'false'];
  const numOps = ['gt', 'gte', 'lt', 'lte'];
  const single = ['true', 'false', 'notEmpty', 'empty'].includes(op);
  const type = boolOps.includes(op) ? 'boolean' : numOps.includes(op) || typeof right === 'number' ? 'number' : 'string';
  return { id, leftValue: left, rightValue: right,
    operator: { type, operation: op, ...(single ? { singleValue: true } : {}) } };
}

/** IF on a boolean expression. Output 0 = true, output 1 = false. */
export const ifTrue = (name: string, js: string): N8nNode => ifWhen(name, [[js, 'true']]);

/** IF on several [expression, operator, value] conditions. */
export const ifWhen = (name: string, conds: [string, Op, any?][], combinator: 'and' | 'or' = 'and'): N8nNode =>
  ({ name, type: 'n8n-nodes-base.if', typeVersion: 2.2,
     parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
       conditions: conds.map(([l, op, r], i) => condition(hashId(name + i), `={{ ${l} }}`, op, r)), combinator },
       options: {} } });

/** Switch on a string expression. One output per value, then a fallback output named 'other'. */
export const switchOn = (name: string, js: string, values: string[]): N8nNode =>
  ({ name, type: 'n8n-nodes-base.switch', typeVersion: 3.2,
     parameters: { rules: { values: values.map((v, i) => ({
       conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
         conditions: [{ id: hashId(name + v), leftValue: `={{ ${js} }}`, rightValue: v, operator: { type: 'string', operation: 'equals' } }],
         combinator: 'and' },
       renameOutput: true, outputKey: v })) },
       options: { fallbackOutput: 'extra', renameFallbackOutput: 'other' } } });

/** Named terminal for an intentionally dropped branch. Name must start with 'STOP: '. */
export const stop = (name: string): N8nNode => {
  if (!name.startsWith('STOP: ')) throw new Error(`stop node must be named 'STOP: ...': ${name}`);
  return { name, type: 'n8n-nodes-base.noOp', typeVersion: 1, parameters: {} };
};
export const noop = (name: string): N8nNode => ({ name, type: 'n8n-nodes-base.noOp', typeVersion: 1, parameters: {} });

export const merge = (name: string, inputs = 2): N8nNode =>
  ({ name, type: 'n8n-nodes-base.merge', typeVersion: 3, parameters: { numberInputs: inputs } });

export const aggregate = (name: string): N8nNode =>
  ({ name, type: 'n8n-nodes-base.aggregate', typeVersion: 1, parameters: { aggregate: 'aggregateAllItemData', options: {} } });

export const splitOut = (name: string, field: string): N8nNode =>
  ({ name, type: 'n8n-nodes-base.splitOut', typeVersion: 1, parameters: { fieldToSplitOut: field, include: 'allOtherFields', options: {} } });

export const wait = (name: string, amount: number | string, unit: 'seconds' | 'minutes' | 'hours' = 'seconds'): N8nNode =>
  ({ name, type: 'n8n-nodes-base.wait', typeVersion: 1.1, webhookId: hashId('wait:' + name), parameters: { amount, unit } });

export const respond = (name: string, bodyJs = 'JSON.stringify($json)', status = 200): N8nNode =>
  ({ name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1,
     parameters: { respondWith: 'json', responseBody: `={{ ${bodyJs} }}`, options: status === 200 ? {} : { responseCode: status } } });

// ---------------------------------------------------------------- HTTP

/** Credential types n8n ships. Anything else: use auth 'header'. */
export const PREDEFINED = new Set([
  'slackApi', 'hubspotAppToken', 'airtableTokenApi', 'notionApi', 'pipedriveApi', 'stripeApi', 'githubApi',
  'shopifyAccessTokenApi', 'jiraSoftwareCloudApi', 'trelloApi', 'asanaApi', 'clickUpApi', 'mailchimpApi',
  'calendlyApi', 'typeformApi', 'zendeskApi', 'freshdeskApi', 'wooCommerceApi', 'mondayComApi', 'todoistApi',
  'linearApi', 'sendGridApi', 'mailgunApi', 'gitlabApi', 'intercomApi', 'quickBooksOAuth2Api', 'xeroOAuth2Api',
  'salesforceOAuth2Api', 'googleSheetsOAuth2Api', 'googleCalendarOAuth2Api', 'googleDriveOAuth2Api', 'gmailOAuth2',
  'twilioApi', 'telegramApi', 'discordBotApi', 'zohoOAuth2Api', 'openAiApi', 'anthropicApi', 'activeCampaignApi',
  'brevoApi', 'convertKitApi', 'paypalApi', 'harvestApi', 'clockifyApi', 'bambooHrApi', 'microsoftOutlookOAuth2Api',
  'microsoftTeamsOAuth2Api', 'dropboxOAuth2Api', 'boxOAuth2Api', 'webflowApi', 'wordpressApi', 'ghostAdminApi',
  'youTubeOAuth2Api', 'spotifyOAuth2Api', 'twitterOAuth2Api', 'facebookGraphApi', 'linkedInOAuth2Api',
  'baserowApi', 'nocoDbApiToken', 'supabaseApi', 'postgres', 'awsApi', 'cloudflareApi', 'netlifyApi', 'vercelApi',
  'sentryIoApi', 'pagerDutyApi', 'opsGenieApi', 'uptimeRobotApi', 'gumroadApi', 'lemonSqueezyApi', 'paddleApi',
  'chargebeeApi', 'invoiceNinjaApi', 'helpScoutOAuth2Api', 'frontApp', 'freshserviceApi', 'serviceNowOAuth2Api',
]);

export type HttpOpts = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  /** predefined credential type, 'header' for Header Auth, 'none' for public endpoints */
  auth: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  /** expression producing the JSON body, e.g. 'JSON.stringify($json.payload)' */
  jsonBody?: string;
  /** a POST that only reads (search endpoints). Defaults to method !== 'GET'. */
  outward?: boolean;
  timeout?: number;
  fullResponse?: boolean;
  /** return 4xx/5xx as data instead of failing (uptime checks, link checkers) */
  neverError?: boolean;
  /** a failed call (timeout, DNS) passes its error on as an item instead of stopping the run */
  continueOnError?: boolean;
};

export const http = (name: string, o: HttpOpts): N8nNode => {
  const method = o.method || 'GET';
  const p: Record<string, any> = { ...(method !== 'GET' ? { method } : {}), url: o.url };
  if (o.auth === 'header') { p.authentication = 'genericCredentialType'; p.genericAuthType = 'httpHeaderAuth'; }
  else if (o.auth !== 'none') {
    if (!PREDEFINED.has(o.auth)) throw new Error(`${name}: '${o.auth}' is not in PREDEFINED; use auth: 'header'`);
    p.authentication = 'predefinedCredentialType'; p.nodeCredentialType = o.auth;
  }
  if (o.query) { p.sendQuery = true; p.queryParameters = { parameters: Object.entries(o.query).map(([name, value]) => ({ name, value })) }; }
  if (o.headers) { p.sendHeaders = true; p.headerParameters = { parameters: Object.entries(o.headers).map(([name, value]) => ({ name, value })) }; }
  if (o.jsonBody) { p.sendBody = true; p.specifyBody = 'json'; p.jsonBody = `={{ ${o.jsonBody} }}`; }
  const response = { ...(o.fullResponse ? { fullResponse: true } : {}), ...(o.neverError ? { neverError: true } : {}) };
  p.options = { timeout: o.timeout || 20000, ...(Object.keys(response).length ? { response: { response } } : {}) };
  return { name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, parameters: p,
    retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
    ...(o.continueOnError ? { onError: 'continueRegularOutput' } : {}),
    _service: o.auth !== 'none', _outward: o.outward ?? method !== 'GET' };
};

// ---------------------------------------------------------------- services

const rl = (value: string, mode: 'id' | 'name' = 'id') => ({ __rl: true, mode, value });

export const sheets = {
  read: (name: string, docJs: string, sheet: string): N8nNode =>
    ({ name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, _service: true, alwaysOutputData: true,
       parameters: { documentId: rl(`={{ ${docJs} }}`), sheetName: rl(sheet, 'name'), options: {} } }),
  append: (name: string, docJs: string, sheet: string): N8nNode =>
    ({ name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, _service: true, _outward: true,
       parameters: { operation: 'append', documentId: rl(`={{ ${docJs} }}`), sheetName: rl(sheet, 'name'),
         columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [] }, options: {} } }),
  upsert: (name: string, docJs: string, sheet: string, matchColumn: string): N8nNode =>
    ({ name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, _service: true, _outward: true,
       parameters: { operation: 'appendOrUpdate', documentId: rl(`={{ ${docJs} }}`), sheetName: rl(sheet, 'name'),
         columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [matchColumn], schema: [] }, options: {} } }),
  update: (name: string, docJs: string, sheet: string, matchColumn: string): N8nNode =>
    ({ name, type: 'n8n-nodes-base.googleSheets', typeVersion: 4.5, _service: true, _outward: true,
       parameters: { operation: 'update', documentId: rl(`={{ ${docJs} }}`), sheetName: rl(sheet, 'name'),
         columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [matchColumn], schema: [] }, options: {} } }),
};

export const gmail = {
  /** to/subject/message are expressions (no leading '='). */
  send: (name: string, o: { to: string; subject: string; message: string; html?: boolean }): N8nNode =>
    ({ name, type: 'n8n-nodes-base.gmail', typeVersion: 2.1, _service: true, _outward: true, retryOnFail: true, maxTries: 2, waitBetweenTries: 3000,
       parameters: { sendTo: `={{ ${o.to} }}`, subject: `={{ ${o.subject} }}`, emailType: o.html ? 'html' : 'text',
         message: `={{ ${o.message} }}`, options: { appendAttribution: false } } }),
};

export const slack = {
  post: (name: string, channelJs: string, textJs: string): N8nNode =>
    ({ name, type: 'n8n-nodes-base.slack', typeVersion: 2.2, _service: true, _outward: true,
       parameters: { select: 'channel', channelId: rl(`={{ ${channelJs} }}`), text: `={{ ${textJs} }}`, otherOptions: {} } }),
};

export const telegram = {
  send: (name: string, chatJs: string, textJs: string): N8nNode =>
    ({ name, type: 'n8n-nodes-base.telegram', typeVersion: 1.2, _service: true, _outward: true,
       parameters: { chatId: `={{ ${chatJs} }}`, text: `={{ ${textJs} }}`, additionalFields: { appendAttribution: false } } }),
};

export const discord = {
  send: (name: string, channelJs: string, contentJs: string): N8nNode =>
    ({ name, type: 'n8n-nodes-base.discord', typeVersion: 2, _service: true, _outward: true,
       parameters: { resource: 'message', operation: 'send', guildId: rl(''), channelId: rl(`={{ ${channelJs} }}`),
         content: `={{ ${contentJs} }}`, options: {} } }),
};

export const twilio = {
  send: (name: string, o: { from: string; to: string; message: string; whatsapp?: boolean }): N8nNode =>
    ({ name, type: 'n8n-nodes-base.twilio', typeVersion: 1, _service: true, _outward: true,
       parameters: { from: `={{ ${o.from} }}`, to: `={{ ${o.to} }}`, ...(o.whatsapp ? { toWhatsapp: true } : {}),
         message: `={{ ${o.message} }}`, options: {} } }),
};

export const rss = {
  read: (name: string, urlJs: string): N8nNode =>
    ({ name, type: 'n8n-nodes-base.rssFeedRead', typeVersion: 1.2, _service: false,
       parameters: { url: `={{ ${urlJs} }}`, options: {} } }),
};

// ---------------------------------------------------------------- AI

/**
 * An AI Agent with an OpenAI chat model and a structured output parser.
 * Returns [agent, model, parser]; wire model and parser with ai(). The agent's
 * output lands on $json.output.
 */
export const aiAgent = (name: string, o: { prompt: string; system: string; schemaExample: object; model?: string }): N8nNode[] => [
  { name, type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 3, _service: true,
    parameters: { promptType: 'define', text: `=${o.prompt}`, hasOutputParser: true, options: { systemMessage: `=${o.system}` } } },
  { name: `${name} model`, type: '@n8n/n8n-nodes-langchain.lmChatOpenAi', typeVersion: 1.2, _service: true, _sub: true,
    parameters: { model: { __rl: true, mode: 'list', value: o.model || 'gpt-4o-mini', cachedResultName: o.model || 'gpt-4o-mini' }, options: {} } },
  { name: `${name} output format`, type: '@n8n/n8n-nodes-langchain.outputParserStructured', typeVersion: 1.3, _sub: true,
    parameters: { jsonSchemaExample: JSON.stringify(o.schemaExample, null, 2) } },
];

// ---------------------------------------------------------------- config

export type Const = { name: string; value: string | number | boolean | string[] | Record<string, any> | any[]; note: string };

/**
 * The single settings node. Consts are UPPER_SNAKE; the returned json is lower_snake.
 * `flags` derive *_enabled booleans from consts; `mode` is always derived from
 * TEST_RUN + TEST_EMAIL (or DRY_RUN) so precedence lives in one place.
 */
export function configNode(o: { title: string; intro: string[]; consts: Const[]; flags?: Record<string, string>; safety: 'test_run' | 'dry_run'; extra?: string }, overrides: Record<string, any> = {}): N8nNode {
  const lines: string[] = [];
  lines.push(`// ${o.title.toUpperCase()} - CONFIG`);
  lines.push('// Edit values only in this node. Nothing else in this workflow needs changing.');
  for (const l of o.intro) lines.push(`// ${l}`);
  lines.push('');
  const all: Const[] = [...o.consts];
  if (o.safety === 'test_run') {
    all.push({ name: 'TEST_RUN', value: true, note: 'ships true. Nothing reaches a real recipient or system.' });
    all.push({ name: 'TEST_EMAIL', value: '', note: "blank -> preview only. Set -> sends go here instead. Never causes a send on its own." });
  } else {
    all.push({ name: 'DRY_RUN', value: true, note: 'ships true. The run computes and reports, and writes nothing.' });
  }
  for (const k of all) {
    const v = k.name in overrides ? overrides[k.name] : k.value;
    // Strings get single quotes; arrays and objects are JSON, which is valid JS and
    // escapes apostrophes and quotes correctly. Plain keys are unquoted for readability.
    const lit = typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : JSON.stringify(v, null, 2).replace(/"([a-z_][a-z0-9_]*)":/gi, '$1:');
    lines.push(`// ${k.note}`);
    lines.push(`const ${k.name} = ${lit};`);
  }
  if (o.extra) { lines.push(''); lines.push(o.extra.trim()); }
  lines.push('');
  if (o.safety === 'test_run') {
    lines.push("const MODE = TEST_RUN !== true ? 'live' : (TEST_EMAIL.trim() !== '' ? 'test' : 'preview');");
  } else {
    lines.push("const MODE = DRY_RUN !== true ? 'live' : 'preview';");
  }
  lines.push('');
  lines.push('return [{');
  lines.push('  json: {');
  for (const k of all) lines.push(`    ${k.name.toLowerCase()}: ${k.name},`);
  for (const [f, expr] of Object.entries(o.flags || {})) lines.push(`    ${f}: ${expr},`);
  lines.push('    mode: MODE,');
  lines.push("    live: MODE === 'live',");
  lines.push("    sends_enabled: MODE !== 'preview',");
  lines.push('    run_started_at: new Date().toISOString()');
  lines.push('  }');
  lines.push('}];');
  return code('config', lines.join('\n'));
}
