import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, aiAgent } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;

export default defineSpec({
  slug: 'zendesk-ticket-translation',
  title: 'Translate non-English Zendesk tickets with OpenAI and tag the language',
  summary: 'Detects the language of new Zendesk tickets from writing system, stopwords and accents without any API, tags each ticket lang_xx, and for tickets not in your team\'s language adds an internal note with an OpenAI translation (or the detected language when OpenAI is off).',
  category: 'Customer support',
  description: {
    who: 'Support teams on Zendesk that answer in one language but receive tickets in several, and lose time pasting each one into a translator before they can even triage it.',
    how: [
      'Every 10 minutes it searches Zendesk for unsolved tickets from the last 2 hours not yet tagged `lang_checked`, or uses 6 sample tickets until Zendesk is connected.',
      'Language is detected in code: the writing system decides Japanese, Chinese, Korean, Cyrillic, Arabic and others; for Latin text it counts common words in 7 languages and uses accents such as ñ, ã and ß to settle close calls.',
      'Every ticket is tagged `lang_xx` and `lang_checked`; a ticket with too few clues is tagged `lang_unknown` rather than guessed.',
      'With `USE_OPENAI` on, tickets not in `BASE_LANGUAGE` get an internal note with the subject and body translated. With it off, the note names the detected language.',
    ],
    setup: [
      'Run it once as imported. It detects the sample tickets and stops at `STOP: dry run - tickets untouched`.',
      'Add a Zendesk credential to `Search new Zendesk tickets` and `Tag and note the ticket`, fill in `ZENDESK_SUBDOMAIN` and set `USE_ZENDESK = true`.',
      'Optionally add an OpenAI credential to the model under `Translate with OpenAI` and set `USE_OPENAI = true`.',
      'Set `DRY_RUN = false` to start tagging and adding notes.',
    ],
    requirements: ['A Zendesk Support account with API access', 'Optional: an OpenAI API key'],
    customize: [
      '`BASE_LANGUAGE` is the language your team answers in.',
      '`MIN_WORD_HITS` sets how many clues detection needs before it commits.',
      'Use the `lang_xx` tags in Zendesk triggers to route tickets to agents who speak that language.',
    ],
  },
  config: {
    intro: ['USE_ZENDESK false -> SAMPLE tickets. USE_OPENAI false -> notes name the language, no translation.', 'DRY_RUN true -> nothing is tagged or noted in Zendesk.'],
    consts: [
      { name: 'USE_ZENDESK', value: false, note: 'set true after adding the Zendesk credential to both Zendesk nodes' },
      { name: 'ZENDESK_SUBDOMAIN', value: 'yourcompany', note: 'the part before .zendesk.com' },
      { name: 'LOOKBACK_HOURS', value: 2, note: 'tickets created in this window are checked' },
      { name: 'USE_OPENAI', value: false, note: 'set true after adding an OpenAI credential to the model under Translate with OpenAI' },
      { name: 'BASE_LANGUAGE', value: 'en', note: 'language your team answers in; tickets in it are only tagged' },
      { name: 'MIN_WORD_HITS', value: 3, note: 'for Latin-script text, the winning language needs at least this many common-word hits' },
      { name: 'MAX_CHARS', value: 2000, note: 'longest ticket body sent for translation' },
    ],
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every 10 minutes', '*/10 * * * *'),
    ifTrue('Zendesk connected?', cfg('use_zendesk')),
    http('Search new Zendesk tickets', {
      url: `={{ 'https://' + ${cfg('zendesk_subdomain')} + '.zendesk.com/api/v2/search.json' }}`, auth: 'zendeskApi',
      query: { query: `={{ 'type:ticket status<solved -tags:lang_checked created>' + new Date(Date.now() - ${cfg('lookback_hours')} * 36e5).toISOString().slice(0, 19) + 'Z' }}`, sort_by: 'created_at', sort_order: 'asc' },
    }),
    code('Read Zendesk tickets', `
// Search results -> id, subject, first comment.
const out = [];
for (const page of $input.all()) for (const t of page.json.results || []) {
  if (t.result_type && t.result_type !== 'ticket') continue;
  out.push({ json: { id: t.id, subject: t.subject || '', body: t.description || '', tags: t.tags || [] } });
}
return out;`),
    code('Load sample tickets', `
// Used until USE_ZENDESK is true. Five languages and one ticket too short to call.
return [
  { id: 501, subject: 'No puedo acceder a mi cuenta', body: 'Hola, desde ayer no puedo acceder a mi cuenta. El código de verificación no llega a mi correo. ¿Me pueden ayudar con esto?', tags: [] },
  { id: 502, subject: 'Rechnung doppelt bezahlt', body: 'Guten Tag, ich habe die Rechnung für Oktober zweimal bezahlt. Bitte erstatten Sie mir den doppelten Betrag, das ist nicht korrekt. Mit freundlichen Grüßen', tags: [] },
  { id: 503, subject: 'Export is slow', body: 'Hi, the CSV export takes more than ten minutes and then it times out. Is this a known issue with large accounts?', tags: [] },
  { id: 504, subject: 'ログインできません', body: 'パスワードをリセットしましたが、まだログインできません。確認していただけますか。', tags: [] },
  { id: 505, subject: 'Problème avec la facture', body: "Bonjour, je ne trouve pas la facture de septembre dans mon compte. Est-ce que vous pouvez me l'envoyer par email ?", tags: [] },
  { id: 506, subject: 'Re: 4471', body: 'ok gracias', tags: [] },
].map(json => ({ json }));`),
    merge('Combine ticket sources'),
    code('Detect the language', `
// No API: writing system first, then common-word counts for Latin text, with
// accents to separate close pairs (es/pt, fr/it). Too few clues -> unknown.
const cfg = $('config').first().json;
const SCRIPTS = [
  ['ja', /[\\u3040-\\u30ff]/g], ['ko', /[\\uac00-\\ud7af]/g], ['zh', /[\\u4e00-\\u9fff]/g], ['uk', /[\\u0454\\u0456\\u0457\\u0491]/g],
  ['ru', /[\\u0400-\\u04ff]/g], ['ar', /[\\u0600-\\u06ff]/g], ['he', /[\\u0590-\\u05ff]/g], ['el', /[\\u0370-\\u03ff]/g],
  ['th', /[\\u0e00-\\u0e7f]/g], ['hi', /[\\u0900-\\u097f]/g],
];
const WORDS = {
  en: 'the and is to you my it not have with this for are can was of in on',
  es: 'el la los las de que y es no por para con una mi pero esto me desde puedo',
  fr: 'le la les des est et je pas pour une vous mon avec sur ne dans que ce',
  de: 'der die das und ist nicht ich ein eine mit für auf mein sie den zu bitte',
  pt: 'o os as de que e não para com uma meu está você mas um do da',
  it: 'il lo gli che e non per con una mio sono ma è di della questo',
  nl: 'de het een en is niet ik met voor op mijn van dat ook',
};
const ACCENTS = { es: /[ñ¿¡]/g, pt: /[ãõ]/g, de: /[ßäöü]/g, fr: /[èêàçœ]/g, it: /[ìò]/g };
const sets = Object.fromEntries(Object.entries(WORDS).map(([k, v]) => [k, new Set(v.split(' '))]));
const NAMES = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', it: 'Italian', nl: 'Dutch', ja: 'Japanese', zh: 'Chinese', ko: 'Korean', ru: 'Russian', uk: 'Ukrainian', ar: 'Arabic', he: 'Hebrew', el: 'Greek', th: 'Thai', hi: 'Hindi' };
const tickets = [];
for (const { json: t } of $input.all()) {
  const text = (t.subject + ' ' + t.body).toLowerCase();
  let lang = null, how = '', hits = 0;
  for (const [code, re] of SCRIPTS) { const n = (text.match(re) || []).length; if (n >= 2) { lang = code; how = n + ' ' + code + ' characters'; break; } }
  if (!lang) {
    const tokens = text.replace(/[^a-zà-ÿœß ]+/g, ' ').split(/\\s+/).filter(Boolean);
    const score = {};
    for (const [code, s] of Object.entries(sets)) score[code] = tokens.filter(w => s.has(w)).length + 2 * (text.match(ACCENTS[code] || /$^/g) || []).length;
    const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
    hits = ranked[0][1];
    if (hits >= cfg.min_word_hits && hits >= ranked[1][1] * 1.3) { lang = ranked[0][0]; how = hits + ' clues vs ' + ranked[1][1] + ' for ' + ranked[1][0]; }
    else how = 'too few clues (' + ranked[0][0] + ' ' + hits + ', ' + ranked[1][0] + ' ' + ranked[1][1] + ')';
  }
  tickets.push({ ...t, lang: lang || 'unknown', language: NAMES[lang] || 'unknown', how,
    translate: Boolean(lang) && lang !== cfg.base_language });
}
return [{ json: { tickets, to_translate: tickets.filter(t => t.translate).length } }];`),
    ifTrue('Skip the model?', `!${cfg('use_openai')} || $json.to_translate === 0`),
    code('Skip translation', `
// OpenAI is off (or nothing needs translating): no translations, notes name the language.
return [{ json: { translations: {} } }];`),
    code('Prepare translation prompts', `
// Exactly the tickets that need a translation, so model replies pair back by position.
const cfg = $('config').first().json;
return $input.first().json.tickets.filter(t => t.translate).map(t => ({ json: { id: t.id, language: t.language,
  subject: t.subject, body: t.body.slice(0, cfg.max_chars) } }));`),
    aiAgent('Translate with OpenAI', {
      prompt: 'Source language: {{ $json.language }}\nSubject: {{ $json.subject }}\nBody:\n{{ $json.body }}',
      system: 'Translate the support ticket into plain English for a support agent. Keep names, numbers, product terms and order ids exactly as written. Do not answer the ticket and do not add commentary.',
      schemaExample: { subject: 'I cannot access my account', body: 'Hello, since yesterday I cannot access my account.' },
    }),
    code('Attach the translations', `
// Pair each model reply with the ticket that produced it.
const prompts = $('Prepare translation prompts').all();
const translations = {};
$input.all().forEach((it, i) => { const o = it.json.output || {}; if (prompts[i] && (o.subject || o.body)) translations[prompts[i].json.id] = o; });
return [{ json: { translations } }];`),
    merge('Combine translation results'),
    code('Build each Zendesk update', `
// Every ticket gets lang tags. Tickets outside BASE_LANGUAGE also get an internal
// note: the translation when there is one, otherwise the detected language.
const cfg = $('config').first().json;
const { tickets } = $('Detect the language').first().json;
const tr = $input.all().reduce((m, i) => ({ ...m, ...(i.json.translations || {}) }), {});
return tickets.map(t => {
  const x = tr[t.id];
  const note = !t.translate ? null : x
    ? 'Auto-translation from ' + t.language + ' (' + t.how + '):\\n\\nSubject: ' + (x.subject || '') + '\\n\\n' + (x.body || '')
    : 'Detected language: ' + t.language + ' (' + t.how + '). Translation is off; set USE_OPENAI to add one.';
  const tags = ['lang_' + t.lang, 'lang_checked'];
  return { json: { id: t.id, lang: t.lang, translated: Boolean(x), tags, note,
    body: { ticket: { additional_tags: tags, ...(note ? { comment: { body: note, public: false } } : {}) } } } };
});`),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: dry run - tickets untouched'),
    http('Tag and note the ticket', {
      method: 'PUT', auth: 'zendeskApi',
      url: `={{ 'https://' + ${cfg('zendesk_subdomain')} + '.zendesk.com/api/v2/tickets/' + $json.id + '.json' }}`,
      jsonBody: 'JSON.stringify($json.body)',
    }),
  ],
  edges: [
    ['Run manually', 'config'], ['Every 10 minutes', 'config'],
    ['config', 'Zendesk connected?'],
    ['Zendesk connected?', 0, 'Search new Zendesk tickets'], ['Zendesk connected?', 1, 'Load sample tickets'],
    ['Search new Zendesk tickets', 'Read Zendesk tickets'],
    ['Read Zendesk tickets', 'Combine ticket sources'], ['Load sample tickets', 0, 'Combine ticket sources', 1],
    ['Combine ticket sources', 'Detect the language'],
    ['Detect the language', 'Skip the model?'],
    ['Skip the model?', 0, 'Skip translation'], ['Skip the model?', 1, 'Prepare translation prompts'],
    ['Prepare translation prompts', 'Translate with OpenAI'],
    ['Translate with OpenAI model', 'Translate with OpenAI', 'ai_languageModel'],
    ['Translate with OpenAI output format', 'Translate with OpenAI', 'ai_outputParser'],
    ['Translate with OpenAI', 'Attach the translations'],
    ['Skip translation', 'Combine translation results'], ['Attach the translations', 0, 'Combine translation results', 1],
    ['Combine translation results', 'Build each Zendesk update'],
    ['Build each Zendesk update', 'Live run?'],
    ['Live run?', 0, 'Tag and note the ticket'], ['Live run?', 1, 'STOP: dry run - tickets untouched'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs every 10 minutes so a translated note is waiting before an agent opens the ticket. The base language and detection threshold live in `config`.', nodes: ['Run manually', 'Every 10 minutes', 'config'] },
    { title: 'Read new tickets', why: 'The search skips tickets already tagged `lang_checked`, so each ticket is handled once even though the 2 hour window overlaps runs. `Load sample tickets` covers five languages until `USE_ZENDESK` is true.', nodes: ['Zendesk connected?', 'Search new Zendesk tickets', 'Read Zendesk tickets', 'Load sample tickets', 'Combine ticket sources'] },
    { title: 'Detect, then translate', why: 'Detection is free and runs on every ticket; the model is only called for tickets outside `BASE_LANGUAGE`, and not at all when there are none. A short reply like "ok gracias" is tagged unknown instead of guessed.', nodes: ['Detect the language', 'Skip the model?', 'Skip translation', 'Prepare translation prompts', 'Translate with OpenAI', 'Attach the translations', 'Combine translation results'] },
    { title: 'Tag and note in Zendesk', why: 'Tags are added, never replaced, and the note is internal so the customer never sees a machine translation. Nothing is written while `DRY_RUN` is true.', nodes: ['Build each Zendesk update', 'Live run?', 'STOP: dry run - tickets untouched', 'Tag and note the ticket'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample tickets', 'Skip translation', 'STOP: dry run - tickets untouched'], notReached: ['Translate with OpenAI'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const d = out['Detect the language'][0];
        const lang = (id: number) => d.tickets.find((t: any) => t.id === id)?.lang;
        const want: Record<number, string> = { 501: 'es', 502: 'de', 503: 'en', 504: 'ja', 505: 'fr', 506: 'unknown' };
        for (const [id, l] of Object.entries(want)) if (lang(Number(id)) !== l) f.push(`#${id} should be ${l}, got ${lang(Number(id))} (${d.tickets.find((t: any) => t.id === Number(id))?.how})`);
        if (d.to_translate !== 4) f.push(`4 tickets need translation, got ${d.to_translate}`);
        const u = out['Build each Zendesk update'];
        if (u.find((x: any) => x.id === 503)?.note !== null) f.push('English ticket gets tags only, no note');
        if (!u.find((x: any) => x.id === 502)?.note.startsWith('Detected language: German')) f.push('without OpenAI the note names the language');
        return f;
      },
    },
    {
      name: 'live with Zendesk and OpenAI', start: 'Every 10 minutes',
      overrides: { USE_ZENDESK: true, USE_OPENAI: true, DRY_RUN: false },
      mocks: {
        'Search new Zendesk tickets': [{ results: [
          { result_type: 'ticket', id: 801, subject: 'Pedido não chegou', description: 'Olá, o meu pedido não chegou e já passaram duas semanas. Você pode verificar o que aconteceu com a entrega?', tags: [] },
          { result_type: 'ticket', id: 802, subject: 'Need an invoice copy', description: 'Can you send me a copy of the invoice for my last order?', tags: [] },
        ], count: 2 }],
        'Translate with OpenAI': (items: any[]) => items.map(() => ({ output: { subject: 'Order did not arrive', body: 'Hello, my order has not arrived and two weeks have passed. Can you check what happened with the delivery?' } })),
        'Tag and note the ticket': (items: any[]) => items.map(i => ({ ticket: { id: i.id } })),
      },
      expect: { reached: ['Translate with OpenAI', 'Tag and note the ticket'], notReached: ['Load sample tickets', 'Skip translation'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const u = out['Build each Zendesk update'];
        const pt = u.find((x: any) => x.id === 801);
        if (pt?.lang !== 'pt' || !pt.translated || !pt.note.includes('Order did not arrive')) f.push(`#801 should be Portuguese with the translation in the note, got ${pt?.lang}`);
        if (u.find((x: any) => x.id === 802)?.tags.join(',') !== 'lang_en,lang_checked') f.push('#802 should only be tagged lang_en');
        if (out['Prepare translation prompts'].length !== 1) f.push('only one ticket should go to the model');
        return f;
      },
    },
  ],
});
