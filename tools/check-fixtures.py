#!/usr/bin/env python3
"""Fail if a fixture could reach a real person.

Every contact address in this repository has to sit under a domain that cannot
resolve and cannot receive mail, and every phone number has to sit in a range
reserved for fiction. This is what keeps a clean import from emailing a stranger
when someone forgets to leave preview mode on.

Rules enforced:
  1. Email addresses use a `.example`, `.test`, `.invalid` or `.localhost` domain,
     or one of the allowed literals (example.com and friends, RFC 2606).
  2. Hostnames are either a known vendor API, a reserved TLD, or an allowed
     literal. Anything else is a domain someone could register.
  3. Phone numbers with a North American shape use the 555-01xx range, unless
     they are a number the vendor publishes for everyone to test against
     (VENDOR_PHONES) or a constant that only looks like one (NOT_PHONE).

Exit code 0 if clean, 1 if not.
"""

import os
import re
import sys

RESERVED_TLDS = (".example", ".test", ".invalid", ".localhost")

# Reserved second-level names from RFC 2606 and RFC 6761.
ALLOWED_LITERAL = {
    "example.com", "example.org", "example.net", "example.co.uk",
    "n8n.example.com", "localhost",
    # Apollo returns this literal string in place of a locked address.
    "domain.com",
}

# Third-party services a template calls. These are API endpoints, not contacts.
VENDOR_HOSTS = {
    "api.anthropic.com", "api.apollo.io", "apollo.io", "app.apollo.io",
    "api.github.com", "github.com", "raw.githubusercontent.com", "ghcr.io",
    "api.instantly.ai", "api.linkedin.com", "linkedin.com", "www.linkedin.com",
    "api.millionverifier.com", "api.neverbounce.com", "api.zerobounce.net",
    "api.retellai.com", "api.rocketreach.co", "api.twilio.com",
    "rest99.bullhornstaffing.com", "server.smartlead.ai",
    "services.leadconnectorhq.com", "docs.google.com", "www.googleapis.com",
    "sheets.googleapis.com", "iam.gserviceaccount.com", "hooks.slack.com",
    "discord.com", "api.openai.com", "openrouter.ai", "api.hcti.io", "hcti.io",
    "htmlcsstoimage.com", "cal.com", "wa.me", "www.w3.org", "w3.org",
    "json-schema.org", "schema.org", "facebook.github.io", "n8n.io",
    "docs.n8n.io", "supabase.co", "xxxxxxxx.supabase.co", "airflow.apache.org",
    "docs.dagster.io", "docs.prefect.io", "docs.temporal.io", "kestra.io",
    "windmill.dev", "developer.salesforce.com", "login.salesforce.com",
    "test.salesforce.com", "api.hubapi.com", "support.google.com",
    # XML namespaces in Salesforce metadata, and CI/registry hosts.
    "soap.sforce.com", "schemas.microsoft.com", "maven.apache.org",
    "registry.gitlab.com", "docs.github.com", "developer.mozilla.org",
    "json-schema.org", "www.apache.org", "opensource.org",
    "localhost", "127.0.0.1",
    # Boards, stores, carriers and model hosts the newer templates call.
    "trello.com", "api.trello.com", "twilio.com", "events-schemas.twilio.com",
    "api.shipstation.com", "ssapi.shipstation.com",
    "airtable.com", "api.airtable.com",
    "app.notion.com", "api.notion.com",
    "console.apify.com", "api.apify.com",
    "api.coresignal.com", "api.pipedrive.com", "pipedrive.com",
    "api.mailchimp.com", "api.elevenlabs.io", "api.heygen.com",
    "browserless.io", "chrome.browserless.io",
}

# Numbers that match the North American shape without being phone numbers:
# a PRNG modulus, a bit mask, a port range. Kept as an explicit list so a real
# number can never be waved through by loosening the pattern.
NOT_PHONE = {
    "2147483648",  # 2**31, the modulus in the deterministic demo generators
    "2147483647",
}

# Numbers a vendor publishes for everyone to test against. They belong to the
# vendor, not to a person, so the 555-01xx rule does not apply.
VENDOR_PHONES = {
    "+14155238886",  # Twilio's shared WhatsApp sandbox number
}

# Free-mail and disposable-mail providers appear in classification lists, never
# as a contact address. They are allowed as bare hostnames but not in an address.
PROVIDER_HOSTS = {
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
    "icloud.com", "live.com", "msn.com", "protonmail.com", "proton.me",
    "10minutemail.com", "guerrillamail.com", "mailinator.com",
    "sharklasers.com", "tempmail.com", "trashmail.com", "yopmail.com",
    "getnada.com", "temp-mail.org",
}

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})")
# Three guards keep this from firing on ordinary code, which shares its shape
# with a hostname:
#   * `me`, `to`, `cc`, `tv` and `in` are left out of the TLD list. As TLDs they
#     collide with property access (`$json.to`, `call.to`, `item.in`).
#   * A match preceded by `$` or `.` is skipped: that is a property chain.
#   * A match followed by `(` is skipped: that is a method call, so
#     `logger.info(...)` and `context.log.info(...)` do not read as `.info` hosts.
# A false positive on every source file would make the check useless, and an
# unrunnable check protects nothing.
HOST = re.compile(
    r"(?<![$.\w])((?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+"
    r"(?:com|org|net|io|ai|gov|edu|co|sg|uk|xyz|dev|app|us|biz|info"
    r"|ae|sa|qa|bh|om|de|fr|nl|au|ca))\b(?!\s*\()"
)
# A North American number, however it is punctuated. The boundaries exclude
# letters as well as digits, so the tail of a hex id or a slug is not read as a
# phone number.
PHONE = re.compile(r"(?<![0-9A-Za-z])(?:\+?1[-. ]?)?\(?([2-9][0-9]{2})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})(?![0-9A-Za-z])")

SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv"}
SKIP_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".zip", ".ico",
            ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".webm", ".lock"}
# The audit tool itself, and the notice explaining the rules, name the patterns.
SKIP_FILES = {"check-fixtures.py", "NOTICE", "SANITIZATION.md", "COMPLIANCE.md",
              "SAFETY.md", "SECURITY.md", "CONTRIBUTING.md"}


# RFC 2606 reserves these names and everything under them, so a subdomain of
# one is as unroutable as the name itself.
RESERVED_SUFFIXES = tuple(
    "." + d for d in ("example.com", "example.org", "example.net", "example.co.uk")
)


def reserved(host):
    h = host.lower().rstrip(".")
    return (h.endswith(RESERVED_TLDS) or h in ALLOWED_LITERAL
            or h.endswith(RESERVED_SUFFIXES))


def allowed_host(host):
    h = host.lower().rstrip(".")
    if reserved(h) or h in VENDOR_HOSTS or h in PROVIDER_HOSTS:
        return True
    return any(h == v or h.endswith("." + v) for v in VENDOR_HOSTS)


def is_test_file(rel):
    """A test that asserts 'gmail.com is a personal address' needs gmail.com.

    The rule exists so a fixture cannot reach a real person. A unit test that
    passes a free-mail or disposable domain to a classifier and checks the verdict
    is not a fixture: nothing sends to it, and replacing the domain with
    `.example` would delete the thing under test. The exemption is deliberately
    narrow: test files only, and only for the free-mail and disposable providers
    already listed above. Any other routable domain still fails, in a test or not.
    """
    name = os.path.basename(rel).lower()
    return name.startswith("test_") or name.endswith(("test.cls", "_test.py",
                                                      "test.py", ".test.ts",
                                                      ".spec.ts"))


def check(path, rel):
    problems = []
    try:
        text = open(path, "rb").read().decode("utf-8-sig")
    except (UnicodeDecodeError, OSError):
        return problems
    testish = is_test_file(rel)
    for n, line in enumerate(text.split("\n"), 1):
        for m in EMAIL.finditer(line):
            host = m.group(1).lower()
            if reserved(host):
                continue
            if testish and host in PROVIDER_HOSTS:
                continue
            problems.append((rel, n, "address at a routable domain: " + m.group(0)))
        for m in HOST.finditer(line):
            if not allowed_host(m.group(1)):
                problems.append((rel, n, "registerable hostname: " + m.group(1)))
        for m in PHONE.finditer(line):
            raw = m.group(0)
            if raw in NOT_PHONE or raw in VENDOR_PHONES:
                continue
            if m.group(2) != "555" or not m.group(3).startswith("01"):
                problems.append((rel, n, "phone outside the 555-01xx range: " + raw))
    return problems


def main(root="."):
    found = []
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in SKIP_DIRS]
        for f in fn:
            if f in SKIP_FILES or os.path.splitext(f)[1].lower() in SKIP_EXT:
                continue
            path = os.path.join(dp, f)
            found += check(path, os.path.relpath(path, root))
    if not found:
        print("check-fixtures: clean")
        return 0
    for rel, n, msg in found:
        print("%s:%d: %s" % (rel.replace("\\", "/"), n, msg))
    print("\ncheck-fixtures: %d problem(s)." % len(found))
    print("Fixture contacts must use a .example domain and a 555-01xx phone number.")
    print("If a hostname is a legitimate third-party API, add it to VENDOR_HOSTS.")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
