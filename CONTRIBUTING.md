# Contributing

## What belongs here

A template earns a place if it runs end to end with no credentials configured and
teaches a mechanism rather than a product. "Enrich a list, verify every address,
suppress, push, report what was held back" is a mechanism. "Uses Apollo" is not.

Before adding one, check whether an existing template already demonstrates the
mechanism in a different industry's clothes. Extending an existing template with
a second branch is usually better than a fifteenth workflow.

## What does not belong here

- Real customer, lead or employee data of any kind, in any file, including CSV
  fixtures and JSON samples.
- Credentials, tokens, API keys, webhook URLs with secrets in the path, or the
  `.env` file they live in. Only `.env.example` is ever committed.
- Client names, project code names, internal process notes, sales scripts or
  anything that identifies a specific engagement.
- Copies of third-party templates, gallery workflows or tutorial code. Implement
  the pattern yourself and cite the source under **Prior art**.

## Adding an n8n workflow

1. Create `n8n/<name>/` with `README.md`, `workflow.json`, and `sample/`.
2. Put every setting in a single Code node named `config` at the head of the
   graph. Nothing reads `$env`. See [docs/CONFIG-NODE.md](docs/CONFIG-NODE.md).
3. Give the workflow a `preview` switch in `config` that defaults to `true`, and
   put a guard node in front of every send, write, publish and call node.
4. If the workflow has more than about three Code nodes, add a `build/`
   directory: the node bodies as `.js` files, a `build.py` that compiles them
   into the JSON, a `validate.py` that checks the graph, and a `simulate.js`
   that runs the logic against `sample/` with no network.
5. Fixture addresses go under `.example`. Fixture phone numbers use `555-01xx`.

## Adding anything else

Match the conventions of the directory you are adding to, and give the template a
`README.md` that answers four questions in this order: what it does, what it
needs, how to run it in preview, and what it deliberately does not do.

## Before you open a pull request

```bash
python tools/check-fixtures.py     # no real domains, addresses or phone numbers
python tools/validate-workflows.py # every workflow.json parses and has a config node
```

Both run in CI on every push. A pull request that adds a routable domain to a
fixture will fail the first one.

## Writing style

Documentation follows [docs/SANITIZATION.md](docs/SANITIZATION.md). The short
version: no em dashes, no marketing vocabulary, no unsourced claims, and every
sentence says what something does, who it is for, or what changes after using it.
