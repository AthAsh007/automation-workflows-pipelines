# Builds ../01-enrich-and-verify.json from js/*.js
# Run: python build.py
import io, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..')
CFG = "$('config').first().json"

JOB_URL = 'https://example.com/jobs/~022093767913249678699/'


def js(name):
    with io.open(os.path.join(HERE, 'js', name), encoding='utf-8') as f:
        return f.read().rstrip()


def code(nid, name, pos, file, **kw):
    n = {"parameters": {"jsCode": js(file)}, "id": nid, "name": name,
         "type": "n8n-nodes-base.code", "typeVersion": 2, "position": pos}
    n.update(kw)
    return n


def noop(nid, name, pos):
    return {"parameters": {}, "id": nid, "name": name,
            "type": "n8n-nodes-base.noOp", "typeVersion": 1, "position": pos}


def if_expr(nid, name, pos, left):
    return {"parameters": {"conditions": {"options": {"caseSensitive": True, "leftValue": "",
                "typeValidation": "loose", "version": 2},
            "conditions": [{"id": nid + "-c", "leftValue": left, "rightValue": "true",
                "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
            "combinator": "and"},
        "looseTypeValidation": True, "options": {}},
        "id": nid, "name": name, "type": "n8n-nodes-base.if",
        "typeVersion": 2.2, "position": pos}


def merge(nid, name, pos):
    # Rejoins the two halves of an IF into one run. Without this, a batch that splits (some
    # organisations need the AI classifier, some do not) reaches the aggregating nodes as two
    # separate executions, and the per-run dedupe, cap and counts are each computed on half
    # the data.
    return {"parameters": {"mode": "append", "numberInputs": 2},
            "id": nid, "name": name, "type": "n8n-nodes-base.merge",
            "typeVersion": 3, "position": pos}


def sticky(nid, pos, w, h, colour, content):
    return {"parameters": {"content": content, "height": h, "width": w, "color": colour},
            "id": nid, "name": "Sticky Note " + nid, "type": "n8n-nodes-base.stickyNote",
            "typeVersion": 1, "position": pos}


def sheet(nid, name, pos, tab, operation=None, matching=None, notes=None, always=False):
    params = {
        "documentId": {"__rl": True, "mode": "id", "value": "={{ %s.sheet_id }}" % CFG},
        "sheetName": {"__rl": True, "mode": "name", "value": "={{ %s.%s }}" % (CFG, tab)},
        "options": {}}
    if operation:
        params["operation"] = operation
        params["columns"] = {"mappingMode": "autoMapInputData", "value": {},
                             "matchingColumns": matching or [], "schema": []}
        # RAW, not USER_ENTERED. Let Sheets convert "2026-08-31 09:14" into a real date and it
        # reads back locale-formatted, which the "already enriched recently" check cannot parse
        # - so every row looks new forever and the same Apollo credits are spent every morning.
        params["options"] = {"cellFormat": "RAW"}
    n = {"parameters": params, "id": nid, "name": name,
         "type": "n8n-nodes-base.googleSheets", "typeVersion": 4.5, "position": pos}
    if always:
        # A tab with nothing but a header row returns zero items, and n8n then skips every
        # node downstream - the run goes green and stops here, which reads as a broken
        # workflow rather than an empty sheet. One empty item keeps the run alive so
        # "STOP: nothing to enrich" gets to say what happened.
        n["alwaysOutputData"] = True
    if notes:
        n["notes"] = notes
    return n


def http(nid, name, pos, method, url, headers=None, query=None, body=None, timeout=30000,
         notes=None):
    params = {"method": method, "url": url, "options": {"timeout": timeout}}
    if headers:
        params["sendHeaders"] = True
        params["headerParameters"] = {"parameters": [
            {"name": k, "value": v} for k, v in headers]}
    if query:
        params["sendQuery"] = True
        params["queryParameters"] = {"parameters": [
            {"name": k, "value": v} for k, v in query]}
    if body is not None:
        params["sendBody"] = True
        params["specifyBody"] = "json"
        params["jsonBody"] = body
    n = {"parameters": params, "id": nid, "name": name,
         "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": pos,
         # A provider that 402s on credits or times out must not end the run. The parse node
         # after it treats a missing answer as "unknown", which is held back, never sent.
         "onError": "continueRegularOutput", "retryOnFail": True, "maxTries": 2,
         "waitBetweenTries": 2000}
    if notes:
        n["notes"] = notes
    return n


def main(*t):
    return {"main": [[{"node": x, "type": "main", "index": 0} for x in t]]}


def to_input(node, index):
    return {"main": [[{"node": node, "type": "main", "index": index}]]}


def branch(yes, no):
    return {"main": [[{"node": x, "type": "main", "index": 0} for x in yes],
                     [{"node": x, "type": "main", "index": 0} for x in no]]}


def save(name, nodes, connections, tags):
    wf = {"name": name, "nodes": nodes, "connections": connections,
          "settings": {"executionOrder": "v1"}, "pinData": {},
          "meta": {"templateCredsSetupCompleted": False}, "tags": tags}
    path = os.path.join(OUT, name.split(' ')[0] + '.json')
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
        f.write('\n')
    return path, len(nodes)


# =====================================================================  THE WORKFLOW
w = []

w.append({"parameters": {}, "id": "manual", "name": "Run it now",
          "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-1500, 180]})

w.append({"parameters": {"rule": {"interval": [{"field": "cronExpression",
              "expression": "0 7 * * 1-5"}]}},
          "id": "sched", "name": "Every weekday, 07:00",
          "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2,
          "position": [-1500, 380]})

w.append(code("cfg", "config", [-1280, 280], "config.js"))

w.append(sheet("read-raw", "[cred] Sheets - read the raw list", [-1060, 280], "orgs_tab",
               always=True,
               notes="alwaysOutputData is on. Without it, a tab holding only a header row "
                     "ends the run here with a green tick and no explanation."))
w.append(code("batch", "pick this run's batch", [-840, 280], "pick-this-runs-batch.js"))
w.append(if_expr("has-work", "anything to enrich?", [-620, 280], "={{ $json._has_work }}"))
w.append(code("stop-empty", "STOP: nothing to enrich", [-400, 460],
              "stop-nothing-to-enrich.js"))

w.append(code("normalise", "normalise the organisation", [-400, 180],
              "normalise-the-organisation.js"))

# --- optional AI classifier, on the unclassified ones only
w.append(if_expr("need-ai", "AI classification needed?", [-180, 180], "={{ $json._needs_ai }}"))
w.append(http("ai", "AI - classify the organisation", [40, 60], "POST",
              "={{ %s.ai_url }}" % CFG,
              headers=[("x-api-key", "={{ %s.ai_api_key }}" % CFG),
                       ("anthropic-version", "2023-06-01"),
                       ("content-type", "application/json")],
              body=("={{ JSON.stringify({ model: %s.ai_model, max_tokens: 512,"
                    " output_config: { effort: 'low' }, system: $json._ai_system,"
                    " messages: [{ role: 'user', content: $json._ai_user }] }) }}") % CFG,
              notes="Anthropic Messages API. The prompt is built in 'normalise the "
                    "organisation' so it is readable without opening this body."))
w.append(code("ai-apply", "apply the AI classification", [260, 60],
              "apply-the-ai-classification.js"))
w.append(code("stop-no-ai", "STOP: keyword rules only", [40, 300],
              "stop-keyword-rules-only.js"))
w.append(merge("merge-orgs", "one list of organisations", [480, 180]))

# --- Apollo people search
w.append(if_expr("apollo-on", "Apollo configured?", [700, 180],
                 "={{ %s.apollo_enabled }}" % CFG))
w.append(http("apollo", "Apollo - find decision makers", [920, 60], "POST",
              "={{ %s.apollo_url }}" % CFG,
              headers=[("x-api-key", "={{ %s.apollo_api_key }}" % CFG),
                       ("Content-Type", "application/json"),
                       ("Cache-Control", "no-cache")],
              body="={{ JSON.stringify($json._apollo_body) }}",
              notes="Search body is built in 'normalise the organisation'. Swap this node for "
                    "a Clay webhook and nothing downstream changes."))
w.append(code("apollo-read", "read Apollo's people", [1140, 60], "read-apollos-people.js"))
w.append(code("stop-no-apollo", "STOP: Apollo not configured", [920, 300],
              "stop-apollo-not-configured.js"))
w.append(merge("merge-contacts", "one list of contacts", [1360, 180]))

w.append(code("score", "score against the ICP", [1580, 180], "score-against-the-icp.js"))

# --- verification, the bounce-rate KPI
w.append(if_expr("verify-on", "verification possible?", [1800, 180],
                 "={{ $json._verifiable }}"))
w.append(http("verify", "Verifier - check the address", [2020, 60], "GET",
              "={{ %s.verifier_url }}" % CFG,
              query=[("api", "={{ %s.verifier_api_key }}" % CFG),
                     ("email", "={{ $json.email }}"),
                     ("timeout", "10")],
              timeout=20000,
              notes="MillionVerifier v3. NeverBounce / ZeroBounce / Bouncer all return a "
                    "status string; map yours in ACCEPT_STATUSES and RISKY_STATUSES."))
w.append(code("verify-apply", "apply the verification", [2240, 60],
              "apply-the-verification.js"))
w.append(code("stop-unverified", "STOP: unverified - held back", [2020, 300],
              "stop-unverified.js"))
w.append(merge("merge-verdicts", "one list of verdicts", [2460, 180]))

w.append(code("decide", "decide who is safe to email", [2680, 180],
              "decide-who-is-safe-to-email.js"))

# --- write back: organisations first, then contacts
w.append(code("org-rows", "rows for the organisations tab", [2900, 180],
              "rows-for-the-organisations-tab.js"))
w.append(sheet("write-orgs", "[cred] Sheets - update the organisations", [3120, 180],
               "orgs_tab", "appendOrUpdate", ["Org id"],
               notes="Matches on 'Org id'. Rename that heading and this stops finding rows - "
                     "change ORG_COLUMNS.org_id in config AND the match field here."))
# Both of these read the flag off the Code node that computed it, not off $json. The Google
# Sheets node between them returns the columns it wrote, not the item it was handed, so an
# underscore-prefixed run flag does not survive the trip.
w.append(if_expr("any-contacts", "any contacts to write?", [3340, 180],
                 "={{ $('rows for the organisations tab').first().json._contacts_to_write }}"))
w.append(code("stop-no-contacts", "STOP: no contacts found", [3560, 400],
              "stop-no-contacts-found.js"))
w.append(code("contact-rows", "rows for the contacts tab", [3560, 100],
              "rows-for-the-contacts-tab.js"))
w.append(sheet("write-contacts", "[cred] Sheets - write the contacts", [3780, 100],
               "contacts_tab", "appendOrUpdate", ["Contact id"],
               notes="Every contact is written here, held ones included, with the reason. "
                     "This is the database the client keeps."))

# --- the campaign push
w.append(if_expr("pushing", "pushing to the campaign?", [4000, 100],
                 "={{ $('rows for the organisations tab').first().json._any_safe }}"))
w.append(code("payload", "payload for the campaign", [4220, 20],
              "payload-for-the-campaign.js"))
w.append(http("instantly", "Instantly - add to the campaign", [4440, 20], "POST",
              "={{ %s.instantly_url }}" % CFG,
              headers=[("Authorization", "={{ 'Bearer ' + %s.instantly_api_key }}" % CFG),
                       ("Content-Type", "application/json")],
              body="={{ JSON.stringify($json._body) }}",
              notes="Instantly v2 POST /leads. For Smartlead, change INSTANTLY_URL and the "
                    "body in 'payload for the campaign'."))
w.append(code("pushed", "record what was pushed", [4660, 20], "record-what-was-pushed.js"))
w.append(sheet("mark-pushed", "[cred] Sheets - mark them pushed", [4880, 20],
               "contacts_tab", "appendOrUpdate", ["Contact id"],
               notes="Only what the campaign actually accepted. A rejected lead is left off "
                     "the sending list so somebody picks it up again."))
w.append(code("stop-not-pushed", "STOP: not pushed", [4220, 220], "stop-not-pushed.js"))

# --- the run summary
w.append(code("summary", "build the run summary", [5100, 160], "build-the-run-summary.js"))
w.append(if_expr("alert-on", "alert configured?", [5320, 160],
                 "={{ %s.alert_enabled }}" % CFG))
w.append(http("alert", "Post the run summary", [5540, 80], "POST",
              "={{ %s.alert_webhook_url }}" % CFG,
              headers=[("Content-Type", "application/json")],
              body="={{ JSON.stringify($json._alert_body) }}",
              timeout=15000,
              notes="Slack incoming webhook shape. Any endpoint that accepts JSON works."))
w.append(noop("no-alert", "STOP: no alert webhook", [5540, 280]))
w.append(noop("end", "End", [5760, 160]))

# --- the canvas documents itself
w.append(sticky("a", [-1560, -280], 620, 400, 4,
    "## Evergreen partnership engine — stage 2 of 6: enrich and verify\n\n"
    "**The job:** " + JOB_URL + "\n\n"
    "Evergreen Mentorship, no-cost Medicaid-backed telehealth mental health across Midstate.\n"
    "This workflow is the data half of the brief: take a raw list of Midstate organisations,\n"
    "find the person who can actually make a referral, prove the address is deliverable,\n"
    "score them, and hand only the safe ones to the sending engine.\n\n"
    "**The other five stages** — domains and warming, the CRM pipeline, the email\n"
    "sequences, the caller queue, the reporting — are in the README. This one is built\n"
    "first because every KPI in the brief depends on it: you cannot hold a bounce rate\n"
    "under 2% downstream of a list nobody verified.\n\n"
    "Everything you edit is in the **config** node. No environment variables, so it runs\n"
    "on n8n Cloud unchanged."))

w.append(sticky("b", [-180, 500], 560, 280, 5,
    "## Every optional step degrades, none of them fail\n\n"
    "A blank key in `config` means *skip this step*, never *fail this run*:\n\n"
    "- **no Apollo key** -> uses whatever contact details the raw list already has\n"
    "- **no AI key** -> keyword rules only, which place most organisations anyway\n"
    "- **no verifier key** -> nothing is emailed, everything is written to the sheet\n"
    "- **no Instantly key** -> the sending list is produced and reviewed, not pushed\n\n"
    "Which is why this whole pipeline can be demonstrated on a screen-share before the\n"
    "client has handed over a single credential."))

w.append(sticky("c", [1960, 500], 560, 300, 3,
    "## This is the under-2% bounce rate\n\n"
    "Not the copy, not the domains — this node and the gate after it.\n\n"
    "**It fails closed.** A verifier that times out, runs out of credits, or returns\n"
    "something unrecognised produces `unknown`, and `unknown` is held back. Every other\n"
    "mistake in cold outreach is recoverable; a burnt sending domain is not.\n\n"
    "`ACCEPT_STATUSES` is what reaches the campaign. Catch-all and unknown are held by\n"
    "default — they are the addresses that pass a verifier and still bounce.\n\n"
    "`HOLD_UNVERIFIED = true` is the setting that makes the KPI true. Leave it."))

w.append(sticky("d", [4180, 480], 600, 300, 6,
    "## Nothing is pushed until you say so\n\n"
    "`TEST_RUN = true` with a blank `TEST_CAMPAIGN_ID` (how it ships) runs the whole\n"
    "pipeline and writes both sheet tabs, but pushes nothing to a campaign. Open\n"
    "**STOP: not pushed** to read the whole sending list first: name, title, score,\n"
    "verifier verdict, and for everyone held, the reason in plain words.\n\n"
    "Put a campaign id in `TEST_CAMPAIGN_ID` and leads really are pushed, to that\n"
    "campaign. `TEST_RUN = false` goes live.\n\n"
    "`DEMO_VERIFIER = true` forces preview whichever way those are set — a fabricated\n"
    "verdict can never reach a real campaign."))

c = {
    "Run it now": main("config"),
    "Every weekday, 07:00": main("config"),
    "config": main("[cred] Sheets - read the raw list"),
    "[cred] Sheets - read the raw list": main("pick this run's batch"),
    "pick this run's batch": main("anything to enrich?"),
    "anything to enrich?": branch(["normalise the organisation"], ["STOP: nothing to enrich"]),
    "STOP: nothing to enrich": main("End"),

    "normalise the organisation": main("AI classification needed?"),
    "AI classification needed?": branch(["AI - classify the organisation"],
                                        ["STOP: keyword rules only"]),
    "AI - classify the organisation": main("apply the AI classification"),
    "apply the AI classification": main("one list of organisations"),
    "STOP: keyword rules only": to_input("one list of organisations", 1),
    "one list of organisations": main("Apollo configured?"),

    "Apollo configured?": branch(["Apollo - find decision makers"],
                                 ["STOP: Apollo not configured"]),
    "Apollo - find decision makers": main("read Apollo's people"),
    "read Apollo's people": main("one list of contacts"),
    "STOP: Apollo not configured": to_input("one list of contacts", 1),
    "one list of contacts": main("score against the ICP"),

    "score against the ICP": main("verification possible?"),
    "verification possible?": branch(["Verifier - check the address"],
                                     ["STOP: unverified - held back"]),
    "Verifier - check the address": main("apply the verification"),
    "apply the verification": main("one list of verdicts"),
    "STOP: unverified - held back": to_input("one list of verdicts", 1),
    "one list of verdicts": main("decide who is safe to email"),

    "decide who is safe to email": main("rows for the organisations tab"),
    "rows for the organisations tab": main("[cred] Sheets - update the organisations"),
    "[cred] Sheets - update the organisations": main("any contacts to write?"),
    "any contacts to write?": branch(["rows for the contacts tab"], ["STOP: no contacts found"]),
    "STOP: no contacts found": main("build the run summary"),
    "rows for the contacts tab": main("[cred] Sheets - write the contacts"),
    "[cred] Sheets - write the contacts": main("pushing to the campaign?"),

    "pushing to the campaign?": branch(["payload for the campaign"], ["STOP: not pushed"]),
    "payload for the campaign": main("Instantly - add to the campaign"),
    "Instantly - add to the campaign": main("record what was pushed"),
    "record what was pushed": main("[cred] Sheets - mark them pushed"),
    "[cred] Sheets - mark them pushed": main("build the run summary"),
    "STOP: not pushed": main("build the run summary"),

    "build the run summary": main("alert configured?"),
    "alert configured?": branch(["Post the run summary"], ["STOP: no alert webhook"]),
    "Post the run summary": main("End"),
    "STOP: no alert webhook": main("End"),
}

path, n = save("01-enrich-and-verify", w, c, ["evergreen", "outreach", "enrichment"])
print('wrote %s (%d nodes)' % (os.path.basename(path), n))

# =====================================================================  THE SHEET
# Generated from the config node's column names, so the tabs and the workflow can never
# disagree about a heading.
import csv, subprocess

SHEET_DIR = os.path.join(OUT, 'sheet')
os.makedirs(SHEET_DIR, exist_ok=True)

meta = json.loads(subprocess.run(
    ['node', '-e', 'const c=new Function(require("fs").readFileSync("js/config.js","utf8"))()[0].json;'
                   'process.stdout.write(JSON.stringify({orgs:c.org_columns,contacts:c.contact_columns,'
                   'cats:c.category_rules.map(r=>r.category),ready:c.ready_statuses}))'],
    cwd=HERE, capture_output=True, text=True, check=True).stdout)

ORG_ORDER = ['org_id', 'name', 'category', 'website', 'county', 'city', 'state', 'phone',
             'contact', 'contact_title', 'contact_email', 'source', 'status', 'enriched_at',
             'contacts', 'notes']
CONTACT_ORDER = ['contact_id', 'org_id', 'org_name', 'category', 'county', 'full_name',
                 'first_name', 'title', 'email', 'email_status', 'verified_at', 'phone',
                 'linkedin', 'score', 'tier', 'sending_list', 'hold_reason', 'campaign',
                 'pushed_at', 'updated_at']


def write_csv(name, rows):
    with io.open(os.path.join(SHEET_DIR, name), 'w', encoding='utf-8-sig', newline='') as f:
        csv.writer(f, lineterminator='\r\n').writerows(rows)
    return name


write_csv('Organisations.csv', [[meta['orgs'][k] for k in ORG_ORDER]])
write_csv('Contacts.csv', [[meta['contacts'][k] for k in CONTACT_ORDER]])

statuses = [s for s in meta['ready'] if s] + ['Enriched', 'No contact found', 'Do not contact']
lists = [['Category', 'Status', 'Sending list', 'Tier']]
extras = [['Other'], ['Yes', 'No'], ['A', 'B', 'C', 'X', '-']]
cols = [meta['cats'] + extras[0], statuses, extras[1], extras[2]]
for i in range(max(len(x) for x in cols)):
    lists.append([col[i] if i < len(col) else '' for col in cols])
write_csv('Lists.csv', lists)

print('wrote sheet/Organisations.csv (%d columns), sheet/Contacts.csv (%d columns), '
      'sheet/Lists.csv' % (len(ORG_ORDER), len(CONTACT_ORDER)))
