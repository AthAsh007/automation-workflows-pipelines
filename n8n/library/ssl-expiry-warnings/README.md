# Warn before SSL certificates expire with crt.sh and Gmail

Looks up every domain on crt.sh each morning, takes the newest unexpired certificate that covers it (wildcards included, replaced certificates ignored), and emails each owner once per 30, 14 and 7-day tier.

Import `ssl-expiry-warnings-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Agencies and small IT teams looking after 5 to 100 client domains, where one forgotten renewal means a browser warning on a client site. It needs no agent on the servers and no paid monitoring.

## How it works

1. Every day at 07:30 it queries the public crt.sh certificate log for each domain in `DOMAINS`, or uses sample certificates until `USE_CRTSH` is true.
2. Precertificate duplicates are merged by serial. Each domain gets the newest certificate whose names cover it, exactly or through a wildcard, so a certificate that was already renewed is ignored.
3. A warning is due when days left drop into a tier in `WARN_DAYS` (30, 14 and 7 by default) and that tier was not sent for that certificate. A domain with no unexpired certificate on record is flagged too.
4. Each owner gets one email listing their domains, days left and issuer.

## Sections on the canvas

1. **Start and settings.** Runs every day at 07:30. Domains, owners and tiers live in `config`; `List domains` makes one item per hostname so each gets its own crt.sh query.
2. **Read the certificate log.** crt.sh is public, so no credential is needed, but it can be slow: the lookup allows 45 seconds and retries. `Load sample certificates` returns crt.sh rows so the matching runs offline.
3. **Match and group.** Rows are merged by serial before matching, because crt.sh lists a precertificate and a certificate for each issue. Taking the newest covering certificate is what silences a domain that was already renewed.
4. **Email and remember.** A test send goes to `TEST_EMAIL` and records nothing. A live send stores the tier per serial, so each tier fires once and a renewed certificate starts again at 30 days.

## Setup

1. Run it once as imported. It checks sample certificates and stops at `STOP: preview - nothing sent`.
2. Fill `DOMAINS` with each hostname and the owner who should hear about it, then set `USE_CRTSH = true`. crt.sh needs no account.
3. Connect Gmail to `Email the owner`.
4. Put your address in `TEST_EMAIL` to get every warning yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_CRTSH` | `false` | true queries https://crt.sh for every domain below |
| `DOMAINS` | `[{"domain":"northwind.example","owner":"` | hostnames to watch and who gets the warning |
| `WARN_DAYS` | `[30,14,7]` | warning tiers in days left |
| `IGNORE_ISSUERS` | `[]` | issuer name fragments to skip, e.g. a CDN that renews for you |
| `SENDER_NAME` | `'Northwind ops bot'` | sign-off on every email |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Email the owner`

## Requirements

- A Gmail account
- Domains with publicly logged certificates (every public CA logs them)

## Customising

- `WARN_DAYS` sets the tiers; each fires once per certificate.
- `IGNORE_ISSUERS` skips certificates from issuers you do not deploy, such as a CDN that renews for you.
- crt.sh shows what was issued, not what a server presents, so pair this with a renewal process that deploys the new certificate.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample certificates, preview) | 10 | none | `STOP: preview - nothing sent` |
| live crt.sh lookup, one domain inside 7 days | 12 | `Email the owner` | `Remember warned tiers` |
