# Draft Shopify product descriptions with OpenAI for products missing one

Finds Shopify products with an empty or very short description, drafts one from the product's own title, type, options, tags and prices (with OpenAI, or a fixed template without it), rejects drafts that are too short, too long or make banned claims, and saves the rest as a draft metafield for review.

Import `shopify-product-description-drafts-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Shopify merchants with a catalogue where half the products were imported with no description. It gives every one a first draft to edit instead of a blank box, and never publishes copy on its own unless you tell it to.

## How it works

1. Every Monday at 07:00 it reads active products from Shopify, or 6 sample products until Shopify is connected.
2. Products whose description has fewer than 80 characters of text are picked, up to 10 per run; gift cards and products tagged `no-ai-copy` are skipped.
3. With `USE_OPENAI` on, a model writes from the product facts only. With it off, a template builds an intro, the options and the features from tags.
4. Each draft must be 120 to 1,200 characters and contain none of the phrases in `BANNED_CLAIMS` such as "best", "guaranteed" or "clinically proven". Failures are held with the reason.
5. Passing drafts go to the `custom.description_draft` metafield, or straight into an empty description if `WRITE_MODE` is `body`.

## Sections on the canvas

1. **Start and settings.** Runs Monday at 07:00 so new imports from the week get drafts. Banned claims, length limits, template openings and the write mode all live in `config`.
2. **Find products to draft.** Descriptions are measured as text after stripping HTML, so `<p>Apron.</p>` counts as missing. Internal tags such as sale or import markers are removed before they can become "features".
3. **Draft the copy.** The model only sees the facts block, never the web or other products. With `USE_OPENAI` off, `Draft from the template` produces the same shape, so the checks and writes behave identically either way.
4. **Check, then save.** Every draft passes the same length and claims check whether a model or the template wrote it. The default is a draft metafield; even in body mode an existing description is never overwritten.

## Setup

1. Run it once as imported. It drafts the sample products and stops at `STOP: dry run - Shopify untouched`.
2. Add a Shopify access token credential to the three Shopify nodes, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.
3. Optionally add an OpenAI credential to the model under `Write the draft with OpenAI` and set `USE_OPENAI = true`.
4. Set `DRY_RUN = false`. Review drafts in the product's metafields before copying them into the description.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_SHOPIFY` | `false` | set true after adding the Shopify credential to the three Shopify nodes |
| `SHOP_DOMAIN` | `'your-store.myshopify.com'` | your myshopify.com domain |
| `USE_OPENAI` | `false` | set true after adding an OpenAI credential to the model under Write the draft with OpenAI |
| `MIN_DESCRIPTION_CHARS` | `80` | descriptions with less text than this count as missing |
| `MAX_PER_RUN` | `10` | most products drafted per run |
| `SKIP_TAGS` | `["no-ai-copy"]` | products with these tags are never drafted |
| `SKIP_TYPES` | `["Gift Card"]` | product types that are never drafted |
| `INTERNAL_TAG_PREFIXES` | `["sale","import","collection:","yotpo"]` | tags that are not product features |
| `TONE` | `'warm, plain and specific; short sente...'` | style instruction for the model |
| `TYPE_INTROS` | `{"Mug":"{title} is a {vendor} mug made f` | template opening per product type; {title} and {vendor} are filled in |
| `BANNED_CLAIMS` | `["best","guaranteed","cure","clinically ` | a draft containing any of these is held |
| `DRAFT_LIMITS` | `{"min":120,"max":1200}` | allowed draft length in characters of text |
| `WRITE_MODE` | `'metafield'` | 'metafield' saves to custom.description_draft; 'body' writes the description itself |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Fetch active products`
- `Write the draft with OpenAI`
- `Write the draft with OpenAI model`
- `Write the description`
- `Save the draft metafield`

## Requirements

- A Shopify store
- A custom app token with read_products and write_products
- Optional: an OpenAI API key

## Customising

- `BANNED_CLAIMS` lists phrases a draft may not contain.
- `TONE` is passed to the model; `TYPE_INTROS` sets the template opening per product type.
- `WRITE_MODE` chooses between the draft metafield and the description itself.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 14 | none | `STOP: held - draft failed checks`, `STOP: dry run - Shopify untouched` |
| live with Shopify and OpenAI | 16 | `Save the draft metafield` | `STOP: held - draft failed checks`, `Save the draft metafield` |
