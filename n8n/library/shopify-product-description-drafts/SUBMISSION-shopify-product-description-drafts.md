# Draft Shopify product descriptions with OpenAI for products missing one

**Who's it for**
Shopify merchants with a catalogue where half the products were imported with no description. It gives every one a first draft to edit instead of a blank box, and never publishes copy on its own unless you tell it to.

**How it works**
1. Every Monday at 07:00 it reads active products from Shopify, or 6 sample products until Shopify is connected.
2. Products whose description has fewer than 80 characters of text are picked, up to 10 per run; gift cards and products tagged `no-ai-copy` are skipped.
3. With `USE_OPENAI` on, a model writes from the product facts only. With it off, a template builds an intro, the options and the features from tags.
4. Each draft must be 120 to 1,200 characters and contain none of the phrases in `BANNED_CLAIMS` such as "best", "guaranteed" or "clinically proven". Failures are held with the reason.
5. Passing drafts go to the `custom.description_draft` metafield, or straight into an empty description if `WRITE_MODE` is `body`.

**How to set up**
1. Run it once as imported. It drafts the sample products and stops at `STOP: dry run - Shopify untouched`.
2. Add a Shopify access token credential to the three Shopify nodes, set `SHOP_DOMAIN` and `USE_SHOPIFY = true`.
3. Optionally add an OpenAI credential to the model under `Write the draft with OpenAI` and set `USE_OPENAI = true`.
4. Set `DRY_RUN = false`. Review drafts in the product's metafields before copying them into the description.

**Requirements**
- A Shopify store
- A custom app token with read_products and write_products
- Optional: an OpenAI API key

**How to customize**
- `BANNED_CLAIMS` lists phrases a draft may not contain.
- `TONE` is passed to the model; `TYPE_INTROS` sets the template opening per product type.
- `WRITE_MODE` chooses between the draft metafield and the description itself.
