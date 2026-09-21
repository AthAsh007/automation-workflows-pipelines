# Builds ../01-capture-and-confirm.json and ../02-progress-and-ship.json from js/*.js,
# then regenerates the sheet CSVs and the sample board rows from the config node so
# neither can drift from what the workflows actually read.
# Run: python build.py
import io, json, os, subprocess

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
                       "value": "={{ %s.board_sheet_id }}" % CFG},
        "sheetName": {"__rl": True, "mode": "name",
                      "value": "={{ %s.board_tab }}" % CFG},
        "options": {}}
    if operation:
        params["operation"] = operation
        params["columns"] = {"mappingMode": "autoMapInputData", "value": {},
                             "matchingColumns": matching or [], "schema": []}
        # RAW, not USER_ENTERED. Sheets turning "2026-09-09 08:05" into a real date makes
        # it read back locale-formatted, which the board classifier cannot parse.
        params["options"] = {"cellFormat": "RAW"}
    return {"parameters": params, "id": nid, "name": name,
            "type": "n8n-nodes-base.googleSheets", "typeVersion": 4.5, "position": pos}


def gmail(nid, name, pos, to, subject, html, text, on_error=True):
    node = {"parameters": {
                "sendTo": to,
                "subject": subject,
                "emailType": "html",
                "message": html,
                "options": {"appendAttribution": False,
                            "replyTo": "={{ %s.reply_to }}" % CFG,
                            "senderName": "={{ %s.from_name }}" % CFG}},
            "id": nid, "name": name, "type": "n8n-nodes-base.gmail",
            "typeVersion": 2.1, "position": pos,
            "notes": "Plain-text alternative is on the item as " + text}
    if on_error:
        node["onError"] = "continueRegularOutput"
    return node


def shipstation(nid, name, pos):
    # ShipStation fetch, via the HTTP Request node with the ShipStation credential type.
    # The endpoint is the one integration point to confirm on the live account — see the
    # folder README. Blank/absent credentials mean this node only runs once SHIPSTATION_READY
    # is true AND a credential has been attached.
    return {"parameters": {
                "method": "GET",
                "url": ("={{ %s.shipstation_base + '/v2/orders?orderNumber=' + "
                        "encodeURIComponent($json['Order no.']) }}" % CFG),
                "authentication": "predefinedCredentialType",
                "nodeCredentialType": "shipStationApi",
                "options": {"timeout": 30000},
                "sendQuery": True,
                "queryParameters": {"parameters": []},
                "sendHeaders": True,
                "headerParameters": {"parameters": []}},
            "id": nid, "name": name, "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2, "position": pos, "credentials": {},
            "notes": "ShipStation v2: list orders by the store order number, then the reply "
                     "mapper digs the tracking out of the response."}


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

w1.append({"parameters": {"httpMethod": "POST", "path": "order-in",
        "responseMode": "responseNode", "options": {}},
    "id": "hook", "name": "An order arrives", "type": "n8n-nodes-base.webhook",
    "typeVersion": 2, "position": [-1240, 300], "webhookId": "order-in"})

w1.append(code("cfg1", "config", [-1020, 300], "config.js"))
w1.append(code("read-order", "read the order", [-800, 300], "read-the-order.js"))
w1.append(if_expr("usable", "a usable order?", [-580, 300], "={{ $json._ok }}"))
w1.append(code("stop-unusable", "STOP: not a usable order", [-360, 480],
               "stop-not-a-usable-order.js"))

w1.append(if_flag("have-board1", "board connected?", [-580, 140], "board_ready"))
w1.append(sheet("board-read1", "[cred] Sheets - read the board", [-340, 60]))
w1.append(code("demo-board1", "use the demo board", [-340, 220], "demo-board.js"))
w1.append(code("seen-before", "seen this order before?", [-100, 140],
               "seen-this-order-before.js"))
w1.append(if_expr("dup", "already logged?", [140, 140], "={{ $json._known }}"))
w1.append(code("stop-dup", "STOP: duplicate delivery", [360, 300], "stop-duplicate.js"))
w1.append(code("plan", "plan the build", [360, 60], "plan-the-build.js"))
w1.append(if_expr("ruled", "every product known?", [600, 60], "={{ $json._gate_pass }}"))
w1.append(code("stop-unruled", "STOP: needs a product rule", [820, 220],
               "stop-needs-a-product-rule.js"))
w1.append(code("confirm-mail", "compose the confirmation", [840, -20],
               "compose-the-confirmation.js"))

w1.append(if_flag("write-gate", "board ready to write?", [1080, -20], "board_ready"))
w1.append(code("stop-demo1", "STOP: demo - nothing written or sent", [1300, 180],
               "stop-demo-capture.js"))
w1.append(code("row-w1", "row for the board", [1300, -140], "row-for-the-board.js"))
w1.append(sheet("board-append", "[cred] Sheets - log the order (row first)", [1520, -140],
                "append"))
w1.append(if_flag("sending1", "sending the confirmation?", [1740, -140], "send_enabled"))
w1.append(code("stop-prev1", "STOP: preview - row written, email not sent", [1960, 60],
               "stop-preview-capture.js"))

w1.append(gmail("mail-confirm", "[cred] Gmail - send the confirmation", [1960, -260],
    to="={{ %s.test_send ? %s.test_email : $('compose the confirmation').first().json.customer_email }}" % (CFG, CFG),
    subject=("={{ %s.test_send ? ('[TEST -> ' + $('compose the confirmation').first().json.customer_email + '] ' +"
             " $('compose the confirmation').first().json.customer_subject)"
             " : $('compose the confirmation').first().json.customer_subject }}") % CFG,
    html="={{ $('compose the confirmation').first().json.customer_html }}",
    text="customer_text"))

w1.append(code("mark-confirmed", "row: mark confirmed", [2180, -260],
               "row-mark-confirmed.js"))
w1.append(sheet("board-confirm", "[cred] Sheets - mark confirmed", [2400, -260],
                "appendOrUpdate", ["Order key"]))

w1.append({"parameters": {"respondWith": "json",
        "responseBody": "={{ JSON.stringify({ ok: true, order: $('read the order').first().json.order_key }) }}",
        "options": {}},
    "id": "respond", "name": "Reply to the store", "position": [2640, 60],
    "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1})

w1.append(sticky("w1a", [-1280, -120], 460, 300, 4,
    "## 1 of 2 — when an order arrives\n\n"
    "A store webhook posts here (Shopify, Etsy or Square — the parser\n"
    "detects the source and reads the same facts out of each shape). In order:\n\n"
    "1. the order is read and checked (Square custom orders wait for the\n"
    "   deposit to land)\n"
    "2. it is matched against the board — the same store order is never\n"
    "   written twice\n"
    "3. every line item must have a rule in PRODUCT_RULES before a shipping\n"
    "   window can be promised\n"
    "4. **the row is written first**, then the confirmation email goes out\n"
    "   quoting the honest window\n\n"
    "Everything you edit lives in the **config** node."))

w1.append(sticky("w1b", [1040, 300], 460, 260, 3,
    "## Nothing is sent until you say so\n\n"
    "`TEST_RUN = true` with a blank `TEST_EMAIL` (how it ships) writes the row\n"
    "but sends no email. Open **STOP: preview...** to read exactly what the\n"
    "customer would get.\n\n"
    "With no sheet configured at all (BOARD_READY = false, how it ships) the\n"
    "run stays in memory: **STOP: demo...** shows the row and the email."))

c1 = {
    "An order arrives": main("config"),
    "config": main("read the order"),
    "read the order": main("a usable order?"),
    "a usable order?": branch(["board connected?"], ["STOP: not a usable order"]),
    "STOP: not a usable order": main("Reply to the store"),
    "board connected?": branch(["[cred] Sheets - read the board"], ["use the demo board"]),
    "[cred] Sheets - read the board": main("seen this order before?"),
    "use the demo board": main("seen this order before?"),
    "seen this order before?": main("already logged?"),
    "already logged?": branch(["plan the build"], ["STOP: duplicate delivery"]),
    "STOP: duplicate delivery": main("Reply to the store"),
    "plan the build": main("every product known?"),
    "every product known?": branch(["compose the confirmation"],
                                   ["STOP: needs a product rule"]),
    "STOP: needs a product rule": main("Reply to the store"),
    "compose the confirmation": main("board ready to write?"),
    "board ready to write?": branch(["row for the board"],
                                    ["STOP: demo - nothing written or sent"]),
    "STOP: demo - nothing written or sent": main("Reply to the store"),
    "row for the board": main("[cred] Sheets - log the order (row first)"),
    "[cred] Sheets - log the order (row first)": main("sending the confirmation?"),
    "sending the confirmation?": branch(["[cred] Gmail - send the confirmation"],
                                        ["STOP: preview - row written, email not sent"]),
    "STOP: preview - row written, email not sent": main("Reply to the store"),
    "[cred] Gmail - send the confirmation": main("row: mark confirmed"),
    "row: mark confirmed": main("[cred] Sheets - mark confirmed"),
    "[cred] Sheets - mark confirmed": main("Reply to the store"),
}

# =====================================================================  WORKFLOW 2
w2 = []

w2.append({"parameters": {}, "id": "manual2", "name": "Run it now",
    "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-1240, 160]})

w2.append({"parameters": {"rule": {"interval": [{"field": "cronExpression",
        "expression": "30 8,16 * * 1-5"}]}},
    "id": "sched2", "name": "Weekdays 08:30 and 16:30",
    "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2, "position": [-1240, 380]})

w2.append(code("cfg2", "config", [-1020, 260], "config.js"))
w2.append(if_flag("have-board2", "board connected?", [-800, 260], "board_ready"))
w2.append(sheet("board-read2", "[cred] Sheets - read the board", [-580, 120]))
w2.append(code("demo-board2", "use the demo board", [-580, 320], "demo-board.js"))
w2.append(code("read-board", "read the board", [-340, 220], "read-the-board.js"))

# --- the shipping branch
w2.append(if_expr("to-ship", "anything shipped but not emailed?", [-100, 100],
                  "={{ $json._has_to_ship }}"))
w2.append(code("stop-empty1", "STOP: nothing to ship today", [140, 260],
               "stop-nothing-to-do.js"))
w2.append(code("shippers", "split the shippers", [140, 20], "split-the-shippers.js"))
w2.append(if_expr("pasted", "tracking on the row?", [400, 20],
                  "={{ $json._tracking_pasted }}"))
w2.append(code("board-tracking", "tracking from the board", [660, -80],
               "tracking-from-the-board.js"))
w2.append(if_flag("ss-ready", "ShipStation ready?", [660, 120], "shipstation_ready"))
w2.append(shipstation("ss-fetch", "[cred] ShipStation - fetch the tracking", [920, 40]))
w2.append(code("ss-reply", "read the tracking reply", [1180, 40],
               "read-the-tracking-reply.js"))
w2.append(code("no-tracking", "no tracking available", [920, 200],
               "no-tracking-available.js"))

w2.append(if_expr("tracked", "tracking found?", [1420, -20],
                  "={{ $json._tracking_found }}"))
w2.append(code("stop-notrack", "STOP: shipped - no tracking", [1680, 160],
               "stop-no-tracking.js"))
w2.append(code("ship-mail", "compose the shipping email", [1680, -100],
               "compose-the-shipping-email.js"))
w2.append(if_flag("sending2", "sending it?", [1940, -100], "send_enabled"))
w2.append(code("stop-prev2", "STOP: preview - shipping email not sent", [2160, 100],
               "stop-preview-ship.js"))

w2.append(gmail("mail-ship", "[cred] Gmail - send the shipping email", [2160, -240],
    to="={{ %s.test_send ? %s.test_email : $('compose the shipping email').first().json.customer_email }}" % (CFG, CFG),
    subject=("={{ %s.test_send ? ('[TEST -> ' + $('compose the shipping email').first().json.customer_email + '] ' +"
             " $('compose the shipping email').first().json.customer_subject)"
             " : $('compose the shipping email').first().json.customer_subject }}") % CFG,
    html="={{ $('compose the shipping email').first().json.customer_html }}",
    text="customer_text"))

w2.append(code("mark-shipped", "row: mark shipped", [2380, -240], "row-mark-shipped.js"))
w2.append(sheet("board-ship", "[cred] Sheets - record the shipment", [2600, -240],
                "appendOrUpdate", ["Order key"]))

# --- the never-shipped-unconfirmed branch
w2.append(if_expr("unconfirmed", "shipped before confirmation?", [-100, 360],
                  "={{ $json._has_unconfirmed }}"))
w2.append(code("stop-unconfirmed", "STOP: never shipped unconfirmed", [160, 480],
               "hold-the-unconfirmed.js"))
w2.append(code("stop-empty2", "STOP: nothing unconfirmed", [160, 320],
               "stop-nothing-to-do.js"))

w2.append(noop("end2", "End", [2820, 160]))

w2.append(sticky("w2a", [-1280, -140], 460, 300, 4,
    "## 2 of 2 — every weekday morning and afternoon\n\n"
    "Reads the whole Orders tab once and does three things:\n\n"
    "**Ships.** Any row the office has flipped to **Shipped** that has not\n"
    "yet had its shipping email goes out — but only if the confirmation\n"
    "was recorded and a tracking number exists (pasted on the row, or\n"
    "pulled from ShipStation). Never a ship notice without a number,\n"
    "and never a shipped order that was never confirmed.\n\n"
    "**Records.** Once the email is away the row is marked, so the next\n"
    "run leaves it alone."))

w2.append(sticky("w2b", [1420, 260], 460, 240, 3,
    "## The sheet is the contract\n\n"
    "The office keeps working in the sheet. Flipping the **Stage** cell to\n"
    "Shipped is the trigger — nothing else needs to happen for the shipping\n"
    "email to fire. Rows only move when the workflow has proof: a\n"
    "confirmation timestamp on the row, then a tracking number."))

c2 = {
    "Run it now": main("config"),
    "Weekdays 08:30 and 16:30": main("config"),
    "config": main("board connected?"),
    "board connected?": branch(["[cred] Sheets - read the board"], ["use the demo board"]),
    "[cred] Sheets - read the board": main("read the board"),
    "use the demo board": main("read the board"),
    "read the board": main("anything shipped but not emailed?",
                           "shipped before confirmation?"),
    "anything shipped but not emailed?": branch(["split the shippers"],
                                                ["STOP: nothing to ship today"]),
    "STOP: nothing to ship today": main("End"),
    "shipped before confirmation?": branch(["STOP: never shipped unconfirmed"],
                                           ["STOP: nothing unconfirmed"]),
    "STOP: never shipped unconfirmed": main("End"),
    "STOP: nothing unconfirmed": main("End"),
    "split the shippers": main("tracking on the row?"),
    "tracking on the row?": branch(["tracking from the board"], ["ShipStation ready?"]),
    "tracking from the board": main("tracking found?"),
    "ShipStation ready?": branch(["[cred] ShipStation - fetch the tracking"],
                                 ["no tracking available"]),
    "[cred] ShipStation - fetch the tracking": main("read the tracking reply"),
    "read the tracking reply": main("tracking found?"),
    "no tracking available": main("tracking found?"),
    "tracking found?": branch(["compose the shipping email"],
                              ["STOP: shipped - no tracking"]),
    "STOP: shipped - no tracking": main("End"),
    "compose the shipping email": main("sending it?"),
    "sending it?": branch(["[cred] Gmail - send the shipping email"],
                          ["STOP: preview - shipping email not sent"]),
    "STOP: preview - shipping email not sent": main("End"),
    "[cred] Gmail - send the shipping email": main("row: mark shipped"),
    "row: mark shipped": main("[cred] Sheets - record the shipment"),
    "[cred] Sheets - record the shipment": main("End"),
}

p1, n1 = save("01-capture-and-confirm", w1, c1, ["orders", "ecommerce"])
p2, n2 = save("02-progress-and-ship", w2, c2, ["orders", "ecommerce"])
print('wrote %s (%d nodes)' % (os.path.basename(p1), n1))
print('wrote %s (%d nodes)' % (os.path.basename(p2), n2))

# =====================================================================  THE SHEET
# Generated from the config node so the tab and the workflow can never disagree about a
# heading, and the sample board fixture cannot drift from the demo rows.
import csv

SHEET_DIR = os.path.join(OUT, 'sheet')
os.makedirs(SHEET_DIR, exist_ok=True)

cfg_json = subprocess.run(
    ['node', '-e', 'const c=new Function(require("fs").readFileSync("js/config.js","utf8"))()[0].json;'
                   'process.stdout.write(JSON.stringify({columns:c.columns,stages:c.stages,demo_orders:c.demo_orders}))'],
    cwd=HERE, capture_output=True, text=True, check=True).stdout
meta = json.loads(cfg_json)

ORDER = ['order_key', 'source', 'order_id', 'placed', 'customer', 'email', 'items',
         'spec', 'window_start', 'window_end', 'stage', 'confirmation_sent', 'carrier',
         'tracking', 'ship_date', 'ship_email_sent', 'notes']
headings = [meta['columns'][k] for k in ORDER]


def write_csv(name, rows):
    path = os.path.join(SHEET_DIR, name)
    with io.open(path, 'w', encoding='utf-8-sig', newline='') as f:
        csv.writer(f, lineterminator='\r\n').writerows(rows)
    return name


write_csv('Orders.csv', [headings])

lists = [['Stage']]
for i, s in enumerate(meta['stages']):
    lists.append([s])
write_csv('Lists.csv', lists)

# sample/board-rows.json — the demo board, heading-keyed, so simulate.js and a human can
# read exactly what the in-n8n demo path produces.
SAMPLE_DIR = os.path.join(OUT, 'sample')
os.makedirs(SAMPLE_DIR, exist_ok=True)
board = []
for o in meta['demo_orders']:
    row = {}
    for k in ORDER:
        row[headings[ORDER.index(k)]] = '' if o.get(k) is None else str(o[k])
    board.append(row)
with io.open(os.path.join(SAMPLE_DIR, 'board-rows.json'), 'w', encoding='utf-8',
             newline='\n') as f:
    json.dump(board, f, indent=2, ensure_ascii=False)
    f.write('\n')

print('wrote sheet/Orders.csv (%d columns), sheet/Lists.csv, sample/board-rows.json (%d rows)'
      % (len(headings), len(board)))
