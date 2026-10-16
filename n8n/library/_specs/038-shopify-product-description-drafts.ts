import { defineSpec } from '../_kit/spec';
import { trigger, code, ifTrue, merge, stop, http, aiAgent } from '../_kit/n';

const cfg = (k: string) => `$('config').first().json.${k}`;
const shop = (path: string) => `={{ 'https://' + ${cfg('shop_domain')} + '/admin/api/2024-10/${path}' }}`;

export default defineSpec({
  slug: 'shopify-product-description-drafts',
  title: 'Draft Shopify product descriptions with OpenAI for products missing one',
  summary: 'Finds Shopify products with an empty or very short description, drafts one from the product\'s own title, type, options, tags and prices (with OpenAI, or a fixed template without it), rejects drafts that are too short, too long or make banned claims, and saves the rest as a draft metafield for review.',
  category: 'E-commerce',
  description: {
    who: 'Shopify merchants with a catalogue where half the products were imported with no description. It gives every one a first draft to edit instead of a blank box, and never publishes copy on its own unless you tell it to.',
    how: [
      'Every Monday at 07:00 it reads active products from Shopify, or 6 sample products until Shopify is connected.',
      'Products whose description has fewer than 80 characters of text are picked, up to 10 per run; gift cards and products tagged `no-ai-copy` are skipped.',
      'With `USE_OPENAI` on, a model writes from the product facts only. With it off, a template builds an intro, the options and the features from tags.',
      'Each draft must be 120 to 1,200 characters and contain none of the phrases in `BANNED_CLAIMS` such as "best", "guaranteed" or "clinically proven". Failures are held with the reason.',
      'Passing drafts go to the `custom.description_draft` metafield, or straight into an empty description if `WRITE_MODE` is `body`.',
    ],
    setup: [
      'Run it once as imported. It drafts the sample products and stops at `STOP: dry run - Shopify untouched`.',
      'Add a Shopify access token credential to the three Shopify nodes, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.',
      'Optionally add an OpenAI credential to the model under `Write the draft with OpenAI` and set `USE_OPENAI = true`.',
      'Set `DRY_RUN = false`. Review drafts in the product\'s metafields before copying them into the description.',
    ],
    requirements: ['A Shopify store', 'A custom app token with read_products and write_products', 'Optional: an OpenAI API key'],
    customize: [
      '`BANNED_CLAIMS` lists phrases a draft may not contain.',
      '`TONE` is passed to the model; `TYPE_INTROS` sets the template opening per product type.',
      '`WRITE_MODE` chooses between the draft metafield and the description itself.',
    ],
  },
  config: {
    intro: ['USE_SHOPIFY false -> SAMPLE products. USE_OPENAI false -> template drafts.', 'DRY_RUN true -> drafts are shown, nothing is written to Shopify.'],
    consts: [
      { name: 'USE_SHOPIFY', value: false, note: 'set true after adding the Shopify credential to the three Shopify nodes' },
      { name: 'SHOP_DOMAIN', value: 'your-store.myshopify.com', note: 'your myshopify.com domain' },
      { name: 'USE_OPENAI', value: false, note: 'set true after adding an OpenAI credential to the model under Write the draft with OpenAI' },
      { name: 'MIN_DESCRIPTION_CHARS', value: 80, note: 'descriptions with less text than this count as missing' },
      { name: 'MAX_PER_RUN', value: 10, note: 'most products drafted per run' },
      { name: 'SKIP_TAGS', value: ['no-ai-copy'], note: 'products with these tags are never drafted' },
      { name: 'SKIP_TYPES', value: ['Gift Card'], note: 'product types that are never drafted' },
      { name: 'INTERNAL_TAG_PREFIXES', value: ['sale', 'import', 'collection:', 'yotpo'], note: 'tags that are not product features' },
      { name: 'TONE', value: 'warm, plain and specific; short sentences; no hype', note: 'style instruction for the model' },
      { name: 'TYPE_INTROS', value: { Mug: '{title} is a {vendor} mug made for the first coffee of the day.', Apron: '{title} is a work apron from {vendor} for kitchen and studio.', Planter: '{title} is a planter from {vendor} for indoor plants.' }, note: 'template opening per product type; {title} and {vendor} are filled in' },
      { name: 'BANNED_CLAIMS', value: ['best', 'guaranteed', 'cure', 'clinically proven', 'miracle', '#1', 'world class', 'risk-free'], note: 'a draft containing any of these is held' },
      { name: 'DRAFT_LIMITS', value: { min: 120, max: 1200 }, note: 'allowed draft length in characters of text' },
      { name: 'WRITE_MODE', value: 'metafield', note: "'metafield' saves to custom.description_draft; 'body' writes the description itself" },
    ],
    safety: 'dry_run',
  },
  nodes: [
    trigger.manual(),
    trigger.schedule('Every Monday at 07:00', '0 7 * * 1'),
    ifTrue('Shopify connected?', cfg('use_shopify')),
    http('Fetch active products', { url: shop('products.json'), auth: 'shopifyAccessTokenApi', query: { limit: '250', status: 'active', fields: 'id,title,body_html,product_type,vendor,tags,options,variants' } }),
    code('Read Shopify products', `
// Products -> the facts a description may use. Nothing else reaches the draft.
const out = [];
for (const page of $input.all()) for (const p of page.json.products || []) {
  const prices = (p.variants || []).map(v => Number(v.price)).filter(n => !isNaN(n));
  out.push({ json: { id: p.id, title: p.title, body_html: p.body_html || '', type: p.product_type || '', vendor: p.vendor || '',
    tags: String(p.tags || '').split(',').map(t => t.trim()).filter(Boolean),
    options: (p.options || []).filter(o => o.name !== 'Title').map(o => ({ name: o.name, values: o.values })),
    price_min: prices.length ? Math.min(...prices) : null, price_max: prices.length ? Math.max(...prices) : null } });
}
return out;`),
    code('Load sample products', `
// Used until USE_SHOPIFY is true. Three need a draft; one of those has a tag that
// turns into a banned claim, so the check holds it.
const p = (id, title, body_html, type, tags, options, price_min, price_max) => ({ id, title, body_html, type, vendor: 'Kiln & Co', tags, options, price_min, price_max });
return [
  p(801, 'Speckled stoneware mug', '', 'Mug', ['stoneware', 'dishwasher-safe', 'handmade', 'sale-oct'], [{ name: 'Size', values: ['12oz', '16oz'] }], 24, 28),
  p(802, 'Linen apron', '<p>Apron.</p>', 'Apron', ['washed-linen', 'adjustable-strap', 'two-pockets'], [{ name: 'Color', values: ['Sand', 'Charcoal', 'Sage'] }], 38, 38),
  p(803, 'Walnut serving board', '<p>Cut from a single piece of American black walnut and finished with food-safe oil, this board is 40 cm long with a juice groove on one side and a flat serving face on the other.</p>', 'Board', ['walnut'], [], 65, 65),
  p(804, 'Gift card', '', 'Gift Card', [], [{ name: 'Denominations', values: ['25', '50'] }], 25, 50),
  p(805, 'Beeswax pillar candle', '', 'Candle', ['no-ai-copy'], [], 18, 18),
  p(806, 'Ceramic planter', '', 'Planter', ['best-seller', 'drainage-hole'], [{ name: 'Size', values: ['Small', 'Large'] }], 22, 34),
].map(json => ({ json }));`),
    merge('Combine product sources'),
    code('Find products missing a description', `
// Strip HTML and count the text that is left. Short or empty -> needs a draft.
const cfg = $('config').first().json;
const text = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\\s+/g, ' ').trim();
const picked = [];
for (const { json: p } of $input.all()) {
  if (text(p.body_html).length >= cfg.min_description_chars) continue;
  if (cfg.skip_types.includes(p.type)) continue;
  if (p.tags.some(t => cfg.skip_tags.includes(t.toLowerCase()))) continue;
  const features = p.tags.filter(t => !cfg.internal_tag_prefixes.some(x => t.toLowerCase().startsWith(x)))
    .map(t => t.replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase()));
  const price = p.price_min === null ? '' : p.price_min === p.price_max ? String(p.price_min) : p.price_min + ' to ' + p.price_max;
  const facts = ['Title: ' + p.title, 'Type: ' + (p.type || 'n/a'), 'Brand: ' + p.vendor,
    ...p.options.map(o => o.name + ': ' + o.values.join(', ')), 'Features: ' + (features.join(', ') || 'none listed'), 'Price: ' + (price || 'n/a')].join('\\n');
  picked.push({ json: { id: p.id, title: p.title, type: p.type, vendor: p.vendor, options: p.options, features, facts, current: text(p.body_html) } });
}
return picked.slice(0, cfg.max_per_run);`),
    ifTrue('OpenAI switched on?', cfg('use_openai')),
    aiAgent('Write the draft with OpenAI', {
      prompt: "Style: {{ $('config').first().json.tone }}\nWrite a product description using only these facts:\n{{ $json.facts }}",
      system: "You write Shopify product descriptions. Use only the facts given; never invent materials, sizes, certifications or awards. No superlatives and no health or safety claims. Return HTML using only <p>, <ul> and <li>: one or two short paragraphs, then up to 5 bullet points. 60 to 150 words. Follow the style line in the message.",
      schemaExample: { description_html: '<p>A short paragraph.</p><ul><li>One fact</li></ul>' },
    }),
    code('Draft from the template', `
// No model: an intro from TYPE_INTROS, the options, and features from tags.
const cfg = $('config').first().json;
return $input.all().map(({ json: p }) => {
  const intro = (cfg.type_intros[p.type] || '{title} from {vendor}.').replace('{title}', p.title).replace('{vendor}', p.vendor);
  const html = '<p>' + intro + '</p>'
    + (p.options.length ? '<p>' + p.options.map(o => 'Available in ' + o.values.length + ' ' + o.name.toLowerCase() + (o.values.length === 1 ? '' : 's') + ': ' + o.values.join(', ') + '.').join(' ') + '</p>' : '')
    + (p.features.length ? '<ul>' + p.features.map(f => '<li>' + f + '</li>').join('') + '</ul>' : '');
  return { json: { ...p, draft_html: html, source: 'template' } };
});`),
    merge('Combine drafts'),
    code('Check length and claims', `
// Model items carry only { output } and pair back to their product by position.
// Every draft is measured as text and searched for BANNED_CLAIMS as whole words.
const cfg = $('config').first().json;
const products = $('Find products missing a description').all();
const text = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();
const esc = s => s.replace(/[.*+?^$()|[\\]\\\\]/g, '\\\\$&');
return $input.all().map((it, i) => {
  const d = 'output' in it.json ? { ...products[i].json, draft_html: it.json.output?.description_html || '', source: 'openai' } : it.json;
  const t = text(d.draft_html);
  const claim = cfg.banned_claims.find(c => new RegExp('(^|[^a-z0-9])' + esc(c.toLowerCase()) + '([^a-z0-9]|$)').test(t.toLowerCase()));
  const reason = !t ? 'empty draft' : t.length < cfg.draft_limits.min ? 'too short (' + t.length + ' chars)' : t.length > cfg.draft_limits.max ? 'too long (' + t.length + ' chars)' : claim ? 'banned claim: "' + claim + '"' : '';
  return { json: { id: d.id, title: d.title, source: d.source, draft_html: d.draft_html, chars: t.length, ok: !reason, reason,
    write_body: cfg.write_mode === 'body' && !d.current } };
});`),
    ifTrue('Passed the checks?', '$json.ok'),
    stop('STOP: held - draft failed checks'),
    ifTrue('Live run?', cfg('live')),
    stop('STOP: dry run - Shopify untouched'),
    ifTrue('Write into the description?', '$json.write_body'),
    http('Write the description', {
      method: 'PUT', auth: 'shopifyAccessTokenApi', url: `={{ 'https://' + ${cfg('shop_domain')} + '/admin/api/2024-10/products/' + $json.id + '.json' }}`,
      jsonBody: 'JSON.stringify({ product: { id: $json.id, body_html: $json.draft_html } })',
    }),
    http('Save the draft metafield', {
      method: 'POST', auth: 'shopifyAccessTokenApi', url: `={{ 'https://' + ${cfg('shop_domain')} + '/admin/api/2024-10/products/' + $json.id + '/metafields.json' }}`,
      jsonBody: "JSON.stringify({ metafield: { namespace: 'custom', key: 'description_draft', type: 'multi_line_text_field', value: $json.draft_html } })",
    }),
  ],
  edges: [
    ['Run manually', 'config'], ['Every Monday at 07:00', 'config'],
    ['config', 'Shopify connected?'],
    ['Shopify connected?', 0, 'Fetch active products'], ['Shopify connected?', 1, 'Load sample products'],
    ['Fetch active products', 'Read Shopify products'],
    ['Read Shopify products', 'Combine product sources'], ['Load sample products', 0, 'Combine product sources', 1],
    ['Combine product sources', 'Find products missing a description'],
    ['Find products missing a description', 'OpenAI switched on?'],
    ['OpenAI switched on?', 0, 'Write the draft with OpenAI'], ['OpenAI switched on?', 1, 'Draft from the template'],
    ['Write the draft with OpenAI model', 'Write the draft with OpenAI', 'ai_languageModel'],
    ['Write the draft with OpenAI output format', 'Write the draft with OpenAI', 'ai_outputParser'],
    ['Write the draft with OpenAI', 'Combine drafts'], ['Draft from the template', 0, 'Combine drafts', 1],
    ['Combine drafts', 'Check length and claims'],
    ['Check length and claims', 'Passed the checks?'],
    ['Passed the checks?', 0, 'Live run?'], ['Passed the checks?', 1, 'STOP: held - draft failed checks'],
    ['Live run?', 0, 'Write into the description?'], ['Live run?', 1, 'STOP: dry run - Shopify untouched'],
    ['Write into the description?', 0, 'Write the description'], ['Write into the description?', 1, 'Save the draft metafield'],
  ],
  groups: [
    { title: 'Start and settings', why: 'Runs Monday at 07:00 so new imports from the week get drafts. Banned claims, length limits, template openings and the write mode all live in `config`.', nodes: ['Run manually', 'Every Monday at 07:00', 'config'] },
    { title: 'Find products to draft', why: 'Descriptions are measured as text after stripping HTML, so `<p>Apron.</p>` counts as missing. Internal tags such as sale or import markers are removed before they can become "features".', nodes: ['Shopify connected?', 'Fetch active products', 'Read Shopify products', 'Load sample products', 'Combine product sources', 'Find products missing a description'] },
    { title: 'Draft the copy', why: 'The model only sees the facts block, never the web or other products. With `USE_OPENAI` off, `Draft from the template` produces the same shape, so the checks and writes behave identically either way.', nodes: ['OpenAI switched on?', 'Write the draft with OpenAI', 'Draft from the template', 'Combine drafts'] },
    { title: 'Check, then save', why: 'Every draft passes the same length and claims check whether a model or the template wrote it. The default is a draft metafield; even in body mode an existing description is never overwritten.', nodes: ['Check length and claims', 'Passed the checks?', 'STOP: held - draft failed checks', 'Live run?', 'STOP: dry run - Shopify untouched', 'Write into the description?', 'Write the description', 'Save the draft metafield'] },
  ],
  scenarios: [
    {
      name: 'shipped config (dry run)', start: 'Run manually',
      expect: { reached: ['Load sample products', 'Draft from the template', 'STOP: held - draft failed checks', 'STOP: dry run - Shopify untouched'], notReached: ['Write the draft with OpenAI'], outward: 'none' },
      check: out => {
        const f: string[] = [];
        const picked = out['Find products missing a description'].map((p: any) => p.id).join(',');
        if (picked !== '801,802,806') f.push(`expected 801, 802 and 806 to need drafts, got ${picked}`);
        const c = out['Check length and claims'];
        const by = (id: number) => c.find((x: any) => x.id === id);
        if (!by(801)?.ok || !by(802)?.ok) f.push(`mug and apron drafts should pass: ${by(801)?.reason} / ${by(802)?.reason}`);
        if (by(806)?.reason !== 'banned claim: "best"') f.push(`planter draft should be held for "best", got ${by(806)?.reason}`);
        if (by(801)?.draft_html.includes('Sale oct')) f.push('internal sale tag must not become a feature');
        return f;
      },
    },
    {
      name: 'live with Shopify and OpenAI', start: 'Every Monday at 07:00',
      overrides: { USE_SHOPIFY: true, USE_OPENAI: true, DRY_RUN: false },
      mocks: {
        'Fetch active products': [{ products: [
          { id: 9001, title: 'Rattan tray', body_html: '', product_type: 'Tray', vendor: 'Weave Studio', tags: 'rattan, handwoven', options: [{ name: 'Title', values: ['Default Title'] }], variants: [{ price: '42.00' }] },
          { id: 9002, title: 'Jute rug', body_html: '', product_type: 'Rug', vendor: 'Weave Studio', tags: 'jute', options: [{ name: 'Size', values: ['120x180', '160x230'] }], variants: [{ price: '89.00' }, { price: '139.00' }] },
        ] }],
        'Write the draft with OpenAI': (items: any[]) => items.map(p => ({ output: { description_html: p.id === 9001
          ? '<p>A shallow tray handwoven from rattan by Weave Studio, sized for a coffee table or a bedside stack of books.</p><ul><li>Handwoven rattan</li><li>Light enough to carry with one hand</li></ul>'
          : '<p>The best rug you will ever own, guaranteed.</p>' } })),
        'Save the draft metafield': (items: any[]) => items.map(() => ({ metafield: { id: 1, namespace: 'custom', key: 'description_draft' } })),
      },
      expect: { reached: ['Write the draft with OpenAI', 'Save the draft metafield', 'STOP: held - draft failed checks'], notReached: ['Draft from the template', 'Write the description'], outward: 'some' },
      check: out => {
        const f: string[] = [];
        const c = out['Check length and claims'];
        if (!c.find((x: any) => x.id === 9001)?.ok) f.push('tray draft should pass');
        if (c.find((x: any) => x.id === 9002)?.ok) f.push('rug draft makes banned claims and must be held');
        if (out['Save the draft metafield'].length !== 1) f.push('only the tray draft should be saved');
        return f;
      },
    },
  ],
});
