# Warn before SSL certificates expire with crt.sh and Gmail

**Who's it for**
Agencies and small IT teams looking after 5 to 100 client domains, where one forgotten renewal means a browser warning on a client site. It needs no agent on the servers and no paid monitoring.

**How it works**
1. Every day at 07:30 it queries the public crt.sh certificate log for each domain in `DOMAINS`, or uses sample certificates until `USE_CRTSH` is true.
2. Precertificate duplicates are merged by serial. Each domain gets the newest certificate whose names cover it, exactly or through a wildcard, so a certificate that was already renewed is ignored.
3. A warning is due when days left drop into a tier in `WARN_DAYS` (30, 14 and 7 by default) and that tier was not sent for that certificate. A domain with no unexpired certificate on record is flagged too.
4. Each owner gets one email listing their domains, days left and issuer.

**How to set up**
1. Run it once as imported. It checks sample certificates and stops at `STOP: preview - nothing sent`.
2. Fill `DOMAINS` with each hostname and the owner who should hear about it, then set `USE_CRTSH = true`. crt.sh needs no account.
3. Connect Gmail to `Email the owner`.
4. Put your address in `TEST_EMAIL` to get every warning yourself, then set `TEST_RUN = false`.

**Requirements**
- A Gmail account
- Domains with publicly logged certificates (every public CA logs them)

**How to customize**
- `WARN_DAYS` sets the tiers; each fires once per certificate.
- `IGNORE_ISSUERS` skips certificates from issuers you do not deploy, such as a CDN that renews for you.
- crt.sh shows what was issued, not what a server presents, so pair this with a renewal process that deploys the new certificate.
