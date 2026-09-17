# Builds ../01-trello-card-to-sms.json from js/*.js.
# Run: python build.py
import io, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..')
CFG = "$('config').first().json"

def js(name):
    with io.open(os.path.join(HERE, 'js', name), encoding='utf-8') as f:
        return f.read().rstrip()

def code(nid, name, pos, file):
    return {"parameters": {"jsCode": js(file)}, "id": nid, "name": name,
            "type": "n8n-nodes-base.code", "typeVersion": 2, "position": pos}

def noop(nid, name, pos):
    return {"parameters": {}, "id": nid, "name": name,
            "type": "n8n-nodes-base.noOp", "typeVersion": 1, "position": pos}

def if_flag(nid, name, pos, flag):
    return {"parameters": {"conditions": {"options": {"caseSensitive": True, "leftValue": "",
                "typeValidation": "loose", "version": 2},
                "conditions": [{"id": nid + "-c", "leftValue": "={{ %s.%s }}" % (CFG, flag),
                    "rightValue": "true",
                    "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
                "combinator": "and"},
            "looseTypeValidation": True, "options": {}},
        "id": nid, "name": name, "type": "n8n-nodes-base.if", "typeVersion": 2.2, "position": pos}

def if_expr(nid, name, pos, left):
    return {"parameters": {"conditions": {"options": {"caseSensitive": True, "leftValue": "",
                "typeValidation": "loose", "version": 2},
                "conditions": [{"id": nid + "-c", "leftValue": left,
                    "rightValue": "true",
                    "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
                "combinator": "and"},
            "looseTypeValidation": True, "options": {}},
        "id": nid, "name": name, "type": "n8n-nodes-base.if", "typeVersion": 2.2, "position": pos}

def sticky(nid, pos, w, h, colour, content):
    return {"parameters": {"content": content, "height": h, "width": w, "color": colour},
            "id": nid, "name": "Sticky Note " + nid, "type": "n8n-nodes-base.stickyNote",
            "typeVersion": 1, "position": pos}

def main(*t):
    return {"main": [[{"node": x, "type": "main", "index": 0} for x in t]]}

def branch(yes, no):
    return {"main": [[{"node": x, "type": "main", "index": 0} for x in yes],
                     [{"node": x, "type": "main", "index": 0} for x in no]]}

# -------------------------------------------------------- workflow

w = []

# Trello incoming webhook: POST to /webhook/trello-card
w.append({"parameters": {"httpMethod": "POST", "path": "trello-card",
        "responseMode": "onReceived", "options": {}},
    "id": "trello-webhook", "name": "When a card arrives", "type": "n8n-nodes-base.webhook",
    "typeVersion": 2, "position": [-1240, 360], "webhookId": "trello-card"})

w.append({"parameters": {}, "id": "demo-trigger", "name": "Run the demo",
    "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-1240, 600]})

w.append(code("demo-card", "load a demo card", [-1020, 600], "load-a-demo-card.js"))
w.append(code("cfg", "config", [-800, 420], "config.js"))
w.append(code("read", "read the card", [-580, 420], "read-the-card.js"))
w.append(if_expr("has-phone", "has a phone number?", [-360, 420], "={{ $json.phone }}"))
w.append(code("stop-nophone", "STOP: no phone number", [-140, 600], "stop-no-phone.js"))
w.append(code("build", "build the SMS", [80, 300], "build-the-sms.js"))
w.append(if_flag("twilio-ok", "SMS configured?", [300, 300], "twilio_enabled"))
w.append(code("stop-preview", "STOP: preview — SMS not sent", [520, 480], "stop-preview.js"))

# Twilio send — [cred] marks nodes needing a credential set in n8n.
w.append({"parameters": {
        "method": "POST",
        "url": "={{ 'https://api.twilio.com/2010-04-01/Accounts/' + $('config').first().json.twilio_account_sid + '/Messages.json' }}",
        "sendHeaders": True, "headerParameters": {"parameters": [
            {"name": "Authorization",
             "value": "={{ 'Basic ' + Buffer.from($('config').first().json.twilio_account_sid + ':' + $('config').first().json.twilio_auth_token).toString('base64') }}"},
            {"name": "Content-Type", "value": "application/x-www-form-urlencoded"}]},
        "sendBody": True, "specifyBody": "json",
        "jsonBody": "={\n  \"To\": \"{{ $json._sms_to }}\",\n  \"From\": \"{{ $('config').first().json.twilio_from_number }}\",\n  \"Body\": \"{{ $json._sms_body }}\"\n}",
        "options": {"timeout": 20000}},
    "id": "twilio-send", "name": "[cred] Twilio - send SMS", "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2, "position": [520, 200], "onError": "continueErrorOutput"})

w.append(code("stop-sent", "STOP: SMS sent", [760, -80], "stop-sent.js"))
w.append(code("stop-rejected", "STOP: SMS rejected", [760, 200], "stop-rejected.js"))
w.append(noop("end", "End", [1040, 300]))

# sticky notes
w.append(sticky("start", [-1300, -1040], 520, 480, 1,
    "## Trello card to SMS — start here\n\n"
    "One workflow. When a card appears on the watched Trello list, the workflow:\n\n"
    "1. reads the card — name, company, phone, budget, timeline — from any field or label\n"
    "2. routes cards without a phone number to STOP: no phone number\n"
    "3. builds the SMS from the template in `config`\n"
    "4. sends it through Twilio — or, with no credential, shows you the exact message\n\n"
    "Everything you edit is in the **config** node.\n\n"
    "**Run it before you configure anything.** Press **Execute Workflow** on the\n"
    "**Run the demo** trigger: two invented cards — one routable, one not — through the\n"
    "whole thing. No Trello account, no Twilio key, nothing leaving the building.\n\n"
    "**Setup, in order**\n"
    "1. **config** — `TRELLO_KEY`, `TRELLO_TOKEN`, `TRELLO_BOARD_ID`, `TRELLO_LIST_ID` from your Trello account, and `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` from Twilio.\n"
    "2. Point your Trello webhook at `/webhook/trello-card` on your n8n instance.\n"
    "3. `DRY_RUN = false` — only then may a run send a real SMS."))

w.append(sticky("preview", [820, 560], 460, 260, 3,
    "## Nothing is sent until you say so\n\n"
    "`DRY_RUN = true` (how it ships) builds the SMS and stops in\n"
    "**STOP: preview — SMS not sent**, where you can read the exact\n"
    "body and the number it would go to.\n\n"
    "Fill in the Twilio credentials and set `DRY_RUN = false`\n"
    "to send for real.\n\n"
    "A refused send lands on **STOP: SMS rejected**\n"
    "with the response on it — visible, not silent."))

connections = {
    "When a card arrives": main("config"),
    "Run the demo": main("load a demo card"),
    "load a demo card": main("config"),
    "config": main("read the card"),
    "read the card": main("has a phone number?"),
    "has a phone number?": branch(["build the SMS"], ["STOP: no phone number"]),
    "STOP: no phone number": main("End"),
    "build the SMS": main("SMS configured?"),
    "SMS configured?": branch(["[cred] Twilio - send SMS"], ["STOP: preview — SMS not sent"]),
    "STOP: preview — SMS not sent": main("End"),
    "[cred] Twilio - send SMS": branch(["STOP: SMS sent"], ["STOP: SMS rejected"]),
    "STOP: SMS sent": main("End"),
    "STOP: SMS rejected": main("End"),
}

wf = {"name": "Trello card to SMS", "nodes": w, "connections": connections,
      "settings": {"executionOrder": "v1"}, "pinData": {},
      "meta": {"templateCredsSetupCompleted": False},
      "tags": ["trello", "sms"]}

path = os.path.join(OUT, "01-trello-card-to-sms.json")
with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)
    f.write('\n')

print('wrote %s (%d nodes)' % (os.path.basename(path), len(w)))
