# Security

## Reporting a vulnerability

Open a GitHub security advisory on this repository, or email the address on the
owner's GitHub profile. Please do not open a public issue for anything that
exposes credentials or user data.

Expect an acknowledgement within a week. There is no bounty.

## What counts as a vulnerability here

This repository holds templates, not a running service, so the relevant classes
are narrower than usual:

- A committed credential, token or webhook URL that carries a secret.
- A fixture that contains a real person's contact details, a routable domain, or
  a dialable phone number.
- A template whose guard nodes can be bypassed, so that importing it and running
  it once contacts a real person before the operator has configured anything.
- A prompt template that will forward user-supplied text into a tool call without
  a boundary, or that treats retrieved content as instructions.

## What the templates assume

**Credentials never live in the workflow.** n8n templates hold no keys. They read
credentials from the n8n credential store by name, and everything else from a
`config` node whose values are non-secret settings. `.env.example` files list the
variable names and never the values.

**Preview is the default.** Every template ships with `preview: true`. In that
state, guard nodes stop the branch before any send, write, publish or call. An
operator has to change one literal to make a run capable of reaching anyone.

**Fixtures cannot reach anyone.** Sample contacts use `.example` domains
(reserved by RFC 2606, no DNS, no mail) and `555-01xx` phone numbers (reserved
for fictional use). This is deliberate: it means a misconfigured first run fails
closed instead of emailing a stranger.

**Model output is data, not instructions.** Prompt pipelines validate model output
against a schema before it reaches a tool call, and treat retrieved documents and
inbound messages as untrusted text. See `prompts/README.md`.

## If you find a secret in the history

Report it privately first. Rotate the credential immediately; assume it is
compromised the moment it reaches a public repository, whether or not the commit
is later removed.
