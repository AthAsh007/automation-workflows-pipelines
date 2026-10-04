# Builds ../01-capture-and-reply.json and ../02-chase-and-digest.json from js/*.js
# Run: python build.py
import io, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..')
CFG = "$('config').first().json"

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

def if_flag(nid, name, pos, flag):
    return if_expr(nid, name, pos, "={{ %s.%s }}" % (CFG, flag))

def sticky(nid, pos, w, h, colour, content):
    return {"parameters": {"content": content, "height": h, "width": w, "color": colour},
            "id": nid, "name": "Sticky Note " + nid, "type": "n8n-nodes-base.stickyNote",
            "typeVersion": 1, "position": pos}

def sheet(nid, name, pos, operation=None, matching=None):
    params = {
        "documentId": {"__rl": True, "mode": "id",
                       "value": "={{ %s.tracker_sheet_id }}" % CFG},
        "sheetName": {"__rl": True, "mode": "name",
                      "value": "={{ %s.tracker_tab }}" % CFG},
        "options": {}}
    if operation:
        params["operation"] = operation
        params["columns"] = {"mappingMode": "autoMapInputData", "value": {},
                             "matchingColumns": matching or [], "schema": []}
        # RAW, not USER_ENTERED. Let Sheets "helpfully" convert "2026-08-31 09:14" into a
        # real date and it reads back locale-formatted ("31/08/2026"), which the chaser
        # cannot parse - so nothing is ever chased and nothing says why.
        params["options"] = {"cellFormat": "RAW"}
    return {"parameters": params, "id": nid, "name": name,
            "type": "n8n-nodes-base.googleSheets", "typeVersion": 4.5, "position": pos}

def gmail(nid, name, pos, to, subject, html, text):
    return {"parameters": {
                "sendTo": to,
                "subject": subject,
                "emailType": "html",
                "message": html,
                "options": {"appendAttribution": False,
                            "replyTo": "={{ %s.reply_to }}" % CFG,
                            "senderName": "={{ %s.from_name }}" % CFG}},
            "id": nid, "name": name, "type": "n8n-nodes-base.gmail",
            "typeVersion": 2.1, "position": pos, "onError": "continueRegularOutput",
            "notes": "Plain-text alternative is on the item as " + text}

def main(*t):
    return {"main": [[{"node": x, "type": "main", "index": 0} for x in t]]}

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

# =====================================================================  WORKFLOW 1
w1 = []

w1.append({"parameters": {"httpMethod": "POST", "path": "cleaning-enquiry",
        "responseMode": "responseNode", "options": {}},
    "id": "hook", "name": "Enquiry arrives", "type": "n8n-nodes-base.webhook",
    "typeVersion": 2, "position": [-1080, 300], "webhookId": "cleaning-enquiry"})

w1.append(code("cfg1", "config", [-860, 300], "config.js"))
w1.append(code("read-form", "read the form fields", [-640, 300], "read-the-form-fields.js"))
w1.append(if_expr("real", "a real enquiry?", [-420, 300], "={{ $json._looks_real }}"))
w1.append(code("stop-spam", "STOP: spam or incomplete", [-200, 460], "stop-spam.js"))

w1.append(code("owner", "assign an owner", [-200, 220], "assign-an-owner.js"))
w1.append(code("reply", "write the first reply", [20, 220], "write-the-first-reply.js"))
w1.append(code("row", "row for the sheet", [240, 220], "row-for-the-sheet.js"))
w1.append(sheet("sheet-append", "[cred] Sheets - log the enquiry", [460, 220], "append"))

w1.append(if_flag("sending1", "sending?", [680, 220], "send_enabled"))
w1.append(code("stop-prev1", "STOP: preview - nothing sent", [900, 400],
               "stop-preview-capture.js"))

w1.append(gmail("mail-customer", "[cred] Gmail - reply to the customer", [900, 140],
    to="={{ %s.test_send ? %s.test_email : $('write the first reply').first().json.email }}" % (CFG, CFG),
    subject=("={{ %s.test_send ? ('[TEST -> ' + $('write the first reply').first().json.email + '] ' +"
             " $('write the first reply').first().json.customer_subject)"
             " : $('write the first reply').first().json.customer_subject }}") % CFG,
    html="={{ $('write the first reply').first().json.customer_html }}",
    text="customer_text"))

w1.append(if_expr("has-owner-mail", "owner has an email?", [1120, 140],
                  "={{ $('write the first reply').first().json._owner_has_email }}"))
w1.append(noop("stop-no-owner", "STOP: no owner email set", [1340, 300]))

w1.append(gmail("mail-owner", "[cred] Gmail - tell the owner", [1340, 60],
    to="={{ %s.test_send ? %s.test_email : $('write the first reply').first().json.owner_email }}" % (CFG, CFG),
    subject=("={{ %s.test_send ? ('[TEST] ' + $('write the first reply').first().json.owner_subject)"
             " : $('write the first reply').first().json.owner_subject }}") % CFG,
    html="={{ $('write the first reply').first().json.owner_html }}",
    text="owner_text"))

w1.append({"parameters": {"respondWith": "json",
        "responseBody": "={{ JSON.stringify({ ok: true, ref: $('read the form fields').first().json.ref }) }}",
        "options": {}},
    "id": "respond", "name": "Reply to the website", "position": [1560, 220],
    "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1})

w1.append(sticky("w1a", [-1120, -60], 460, 300, 4,
    "## 1 of 2 — when an enquiry arrives\n\n"
    "Your website form posts here. In order, this workflow:\n\n"
    "1. reads the form, whatever the plugin calls its fields\n"
    "2. throws out spam and anything with no usable email\n"
    "3. picks the owner from the postcode\n"
    "4. **writes the row to the sheet first**, so an enquiry can never be\n"
    "   lost to a mail failure\n"
    "5. emails the customer the three standard questions\n"
    "6. emails the owner the details\n\n"
    "Everything you edit is in the **config** node."))

w1.append(sticky("w1b", [640, 480], 440, 220, 3,
    "## Nothing is sent until you say so\n\n"
    "`TEST_RUN = true` with a blank `TEST_EMAIL` (how it ships) writes the sheet row\n"
    "but sends no email. Open **STOP: preview - nothing sent** to read exactly what\n"
    "the customer and the owner would have got.\n\n"
    "Put your own address in `TEST_EMAIL` and the emails really send, to you.\n"
    "`TEST_RUN = false` goes live."))

c1 = {
    "Enquiry arrives": main("config"),
    "config": main("read the form fields"),
    "read the form fields": main("a real enquiry?"),
    "a real enquiry?": branch(["assign an owner"], ["STOP: spam or incomplete"]),
    "STOP: spam or incomplete": main("Reply to the website"),
    "assign an owner": main("write the first reply"),
    "write the first reply": main("row for the sheet"),
    "row for the sheet": main("[cred] Sheets - log the enquiry"),
    "[cred] Sheets - log the enquiry": main("sending?"),
    "sending?": branch(["[cred] Gmail - reply to the customer"],
                       ["STOP: preview - nothing sent"]),
    "STOP: preview - nothing sent": main("Reply to the website"),
    "[cred] Gmail - reply to the customer": main("owner has an email?"),
    "owner has an email?": branch(["[cred] Gmail - tell the owner"],
                                  ["STOP: no owner email set"]),
    "[cred] Gmail - tell the owner": main("Reply to the website"),
    "STOP: no owner email set": main("Reply to the website"),
}

# =====================================================================  WORKFLOW 2
w2 = []

w2.append({"parameters": {}, "id": "manual2", "name": "Run it now",
    "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-1080, 180]})

w2.append({"parameters": {"rule": {"interval": [{"field": "cronExpression",
        "expression": "30 8 * * 1-5"}]}},
    "id": "sched2", "name": "Weekday mornings, 08:30",
    "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2, "position": [-1080, 380]})

w2.append(code("cfg2", "config", [-860, 280], "config.js"))
w2.append(sheet("sheet-read", "[cred] Sheets - read the tracker", [-640, 280]))
w2.append(code("quiet", "find what has gone quiet", [-420, 280],
               "find-what-has-gone-quiet.js"))

# --- chasing branch
w2.append(if_expr("has-stalled", "anything to chase?", [-200, 140],
                  "={{ $json._has_stalled }}"))
w2.append(code("stop-quiet", "STOP: nothing stalled", [20, 300], "stop-nothing-stalled.js"))
w2.append(code("split-owner", "split by owner", [20, 60], "split-by-owner.js"))
w2.append(code("nudge", "write the nudge", [240, 60], "write-the-nudge.js"))
w2.append(if_flag("sending2", "sending the nudges?", [460, 60], "send_enabled"))
w2.append(code("stop-prev2", "STOP: preview - nudges not sent", [680, 200],
               "stop-preview-chase.js"))

w2.append(gmail("mail-nudge", "[cred] Gmail - nudge the owner", [680, -20],
    to="={{ %s.test_send ? %s.test_email : $json.owner_email }}" % (CFG, CFG),
    subject=("={{ %s.test_send ? ('[TEST -> ' + $json.owner_email + '] ' + $json.nudge_subject)"
             " : $json.nudge_subject }}") % CFG,
    html="={{ $('write the nudge').first().json.nudge_html }}",
    text="nudge_text"))

w2.append(code("record-chase", "record the chase", [900, -20], "record-the-chase.js"))
w2.append(sheet("sheet-chase", "[cred] Sheets - record the chase", [1120, -20],
                "appendOrUpdate", ["Ref"]))

# --- digest branch
w2.append(code("digest", "build the morning digest", [-200, 440],
               "build-the-morning-digest.js"))
w2.append(if_expr("send-digest", "send the digest?", [20, 440],
                  "={{ $json._send_digest && %s.send_enabled }}" % CFG))
w2.append(code("stop-digest", "STOP: digest not sent", [240, 580], "stop-preview-chase.js"))

w2.append(gmail("mail-digest", "[cred] Gmail - send the digest", [240, 440],
    to="={{ %s.test_send ? %s.test_email : %s.digest_to }}" % (CFG, CFG, CFG),
    subject="={{ $('build the morning digest').first().json.digest_subject }}",
    html="={{ $('build the morning digest').first().json.digest_html }}",
    text="digest_text"))

w2.append(noop("end2", "End", [1340, 280]))

w2.append(sticky("w2a", [-1120, -180], 460, 300, 4,
    "## 2 of 2 — every weekday morning\n\n"
    "Reads the whole tracker once and does two things:\n\n"
    "**Chases.** Anything still open that has not been touched for\n"
    "`CHASE_AFTER_HOURS` (48 by default) gets its owner a nudge — one email per\n"
    "person listing all of theirs, not one per enquiry. It stops after\n"
    "`CHASE_MAX` reminders so nobody gets a daily drip.\n\n"
    "**A digest.** One email showing every open enquiry by stage, and what has\n"
    "gone quiet. That is the at-a-glance view.\n\n"
    "Moving a row to Won or Lost in the sheet takes it out of both."))

w2.append(sticky("w2b", [1080, 140], 420, 220, 5,
    "## The counter matters\n\n"
    "**Chases sent** is bumped on every row that gets nudged, matched on **Ref**.\n\n"
    "That column is what stops the same job being chased every morning forever.\n"
    "If you rename it, change `COLUMNS.chases_sent` in the config node **and**\n"
    "the *Column to match on* here."))

c2 = {
    "Run it now": main("config"),
    "Weekday mornings, 08:30": main("config"),
    "config": main("[cred] Sheets - read the tracker"),
    "[cred] Sheets - read the tracker": main("find what has gone quiet"),
    "find what has gone quiet": main("anything to chase?", "build the morning digest"),
    "anything to chase?": branch(["split by owner"], ["STOP: nothing stalled"]),
    "STOP: nothing stalled": main("End"),
    "split by owner": main("write the nudge"),
    "write the nudge": main("sending the nudges?"),
    "sending the nudges?": branch(["[cred] Gmail - nudge the owner"],
                                  ["STOP: preview - nudges not sent"]),
    "STOP: preview - nudges not sent": main("End"),
    "[cred] Gmail - nudge the owner": main("record the chase"),
    "record the chase": main("[cred] Sheets - record the chase"),
    "[cred] Sheets - record the chase": main("End"),
    "build the morning digest": main("send the digest?"),
    "send the digest?": branch(["[cred] Gmail - send the digest"], ["STOP: digest not sent"]),
    "[cred] Gmail - send the digest": main("End"),
    "STOP: digest not sent": main("End"),
}

p1, n1 = save("01-capture-and-reply", w1, c1, ["cleaning", "enquiries"])
p2, n2 = save("02-chase-and-digest", w2, c2, ["cleaning", "enquiries"])
print('wrote %s (%d nodes)' % (os.path.basename(p1), n1))
print('wrote %s (%d nodes)' % (os.path.basename(p2), n2))

# =====================================================================  THE SHEET
# Generated from the config node's COLUMNS so the tab and the workflow can never
# disagree about a heading.
import csv, subprocess

SHEET_DIR = os.path.join(OUT, 'sheet')
os.makedirs(SHEET_DIR, exist_ok=True)

cfg_json = subprocess.run(
    ['node', '-e', 'const c=new Function(require("fs").readFileSync("js/config.js","utf8"))()[0].json;'
                   'process.stdout.write(JSON.stringify({columns:c.columns,stages:c.open_stages,areas:c.areas}))'],
    cwd=HERE, capture_output=True, text=True, check=True).stdout
meta = json.loads(cfg_json)

ORDER = ['ref', 'received', 'stage', 'owner', 'owner_email', 'company', 'contact', 'email',
         'phone', 'postcode', 'area', 'premises', 'message', 'sqft', 'frequency', 'access',
         'last_touch', 'chases_sent', 'next_action', 'notes']
headings = [meta['columns'][k] for k in ORDER]

def write_csv(name, rows):
    path = os.path.join(SHEET_DIR, name)
    with io.open(path, 'w', encoding='utf-8-sig', newline='') as f:
        csv.writer(f, lineterminator='\r\n').writerows(rows)
    return name

write_csv('Enquiries.csv', [headings])

closed = ['Quoted', 'Won', 'Lost', 'Not for us']
stages = meta['stages'] + [s for s in closed if s not in meta['stages']]
owners = []
for a in meta['areas']:
    if a['owner'] not in owners:
        owners.append(a['owner'])
areas = [a['area'] for a in meta['areas']] + ['Unassigned']

lists = [['Stage', 'Area', 'Owner']]
for i in range(max(len(stages), len(areas), len(owners))):
    lists.append([stages[i] if i < len(stages) else '',
                  areas[i] if i < len(areas) else '',
                  owners[i] if i < len(owners) else ''])
write_csv('Lists.csv', lists)

area_rows = [['Postcode prefix', 'Area', 'Owner', 'Owner email']]
for a in meta['areas']:
    for pc in a['postcodes']:
        area_rows.append([pc, a['area'], a['owner'], a['email']])
area_rows.append(['(anything else)', 'Unassigned', 'Office', ''])
write_csv('Areas.csv', area_rows)

print('wrote sheet/Enquiries.csv (%d columns), sheet/Lists.csv, sheet/Areas.csv'
      % len(headings))
