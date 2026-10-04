# Builds ../01-intake-and-routing.json and ../02-follow-up-sequence.json from js/*.js.
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


GH_HEADERS = [
    {"name": "Authorization", "value": "={{ 'Bearer ' + $('config').first().json.ghl_api_key }}"},
    {"name": "Version", "value": "={{ $('config').first().json.ghl_api_version }}"},
    {"name": "Accept", "value": "application/json"}]


def http_post(nid, name, pos, url, body, note):
    # onError continueErrorOutput, NOT continueRegularOutput: a refused call must land on a
    # named STOP node with the response on it, never be swallowed.
    headers = list(GH_HEADERS)
    headers.insert(2, {"name": "Content-Type", "value": "application/json"})
    return {"parameters": {
                "method": "POST", "url": url,
                "sendHeaders": True, "headerParameters": {"parameters": headers},
                "sendBody": True, "specifyBody": "json", "jsonBody": body,
                "options": {"timeout": 20000}},
            "id": nid, "name": name, "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2, "position": pos, "onError": "continueErrorOutput",
            "notes": note}


def http_get_opportunities(nid, name, pos):
    return {"parameters": {
                "method": "GET",
                "url": "={{ $('config').first().json.ghl_api_base + '/opportunities/search' }}",
                "sendQuery": True,
                "queryParameters": {"parameters": [
                    {"name": "location_id",
                     "value": "={{ $('config').first().json.ghl_location_id }}"},
                    {"name": "limit",
                     "value": "={{ $('config').first().json.pipeline_page_limit }}"}]},
                "sendHeaders": True, "headerParameters": {"parameters": list(GH_HEADERS)},
                "options": {"timeout": 30000}},
            "id": nid, "name": name, "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2, "position": pos, "onError": "continueErrorOutput",
            "notes": "Opportunities search, one page of PIPELINE_PAGE_LIMIT. The key comes from "
                     "the config node; a blank key means this node never executes, and the demo "
                     "pipeline stands in. Anything past the first page is reported, not dropped."}


def main(*t):
    return {"main": [[{"node": x, "type": "main", "index": 0} for x in t]]}


def branch(yes, no):
    return {"main": [[{"node": x, "type": "main", "index": 0} for x in yes],
                     [{"node": x, "type": "main", "index": 0} for x in no]]}


def save(name, nodes, connections, tags):
    wf = {"name": name, "nodes": nodes, "connections": connections,
          "settings": {"executionOrder": "v1"}, "pinData": {},
          "meta": {"templateCredsSetupCompleted": False}, "tags": tags}
    path = os.path.join(OUT, name + '.json')
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
        f.write('\n')
    return path, len(nodes)


# =====================================================================  WORKFLOW 1
w1 = []

# The webhook acknowledges at once and the run continues — an intake endpoint should not hold
# a form POST open while it talks to a CRM.
w1.append({"parameters": {"httpMethod": "POST", "path": "ghl-lead",
        "responseMode": "onReceived", "options": {}},
    "id": "hook", "name": "A lead arrives", "type": "n8n-nodes-base.webhook",
    "typeVersion": 2, "position": [-1240, 220], "webhookId": "ghl-lead"})

w1.append({"parameters": {}, "id": "demo", "name": "Run the demo lead",
    "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-1240, 460]})

w1.append(code("demo-lead", "load a demo lead", [-1020, 460], "load-a-demo-lead.js"))
w1.append(code("cfg1", "config", [-800, 300], "config.js"))
w1.append(code("read", "read the lead", [-580, 300], "read-the-lead.js"))
w1.append(if_expr("usable", "a usable lead?", [-360, 300], "={{ $json._ok }}"))
w1.append(code("stop-unusable", "STOP: not a usable lead", [-140, 480], "stop-not-usable.js"))

w1.append(code("route", "route the lead", [-140, 160], "route-the-lead.js"))
w1.append(code("payload", "build the GoHighLevel payload", [80, 160], "build-the-ghl-payload.js"))
w1.append(if_flag("connected", "GoHighLevel connected?", [300, 160], "ghl_enabled"))
w1.append(code("stop-nocfg", "STOP: GoHighLevel not configured - payload shown", [520, 340],
              "stop-not-configured.js"))

w1.append(http_post("ghl-write", "[cred] GoHighLevel - create the contact", [520, 40],
    url="={{ $json._ghl.contact.url }}",
    body="={{ JSON.stringify($json._ghl.contact.body) }}",
    note="Contact upsert. The key comes from the config node; a blank key means this node "
         "never executes."))
w1.append(code("stop-filed", "STOP: filed in GoHighLevel", [760, -80], "stop-filed.js"))
w1.append(code("stop-rejected", "STOP: GoHighLevel rejected the write", [760, 200],
              "stop-rejected.js"))

w1.append(noop("end1", "End", [1040, 300]))

w1.append(sticky("w1a", [-1280, -180], 480, 340, 4,
    "## 1 of 2 — a lead in, filed and routed\n\n"
    "Two ways in, one path through:\n\n"
    "* a form, an email forward or a phone note posts to **A lead arrives**\n"
    "* or press **Run the demo lead** for three invented leads, one per source\n\n"
    "It then:\n\n"
    "1. reads the lead whatever shape it arrived in\n"
    "2. rejects a bot or anything with no way to reach the person\n"
    "3. routes it to an owner, a pipeline stage and a set of tags\n"
    "4. builds the exact GoHighLevel request\n"
    "5. writes it — or, with no credential, shows you the request\n\n"
    "Everything you edit is in the **config** node."))

w1.append(sticky("w1b", [860, 420], 460, 260, 3,
    "## Nothing is written until you say so\n\n"
    "`DRY_RUN = true` (how it ships) builds the payload and stops in\n"
    "**STOP: GoHighLevel not configured**, where you can read the exact\n"
    "body that would have been sent.\n\n"
    "Fill in `GHL_LOCATION_ID` and `GHL_API_KEY` and set `DRY_RUN = false`\n"
    "to write for real.\n\n"
    "A refused write lands on **STOP: GoHighLevel rejected the write**\n"
    "with the response on it — visible, not silent."))

w1.append(sticky("start1", [-1300, -1040], 560, 560, 1,
    "## Intake & routing — start here\n\n"
    "The first of two workflows. Import it alongside **02-follow-up-sequence** — both\n"
    "share the same **config** node.\n\n"
    "**Run it before you configure anything.** Press **Execute Workflow** on the\n"
    "**Run the demo lead** trigger: three invented leads, one per source, through the\n"
    "whole thing. No credential, no GoHighLevel account, nothing leaving the building.\n"
    "Open **STOP: GoHighLevel not configured - payload shown** to read the exact\n"
    "contact body it would have sent.\n\n"
    "**Setup, in order**\n"
    "1. **config** — `GHL_LOCATION_ID`, `GHL_PIPELINE_ID`, the `STAGES` ids, the\n"
    "   `OWNERS` user ids and the `CUSTOM_FIELDS` ids, from your own account.\n"
    "2. `GHL_API_KEY` — a Private Integration token with `contacts.write` and\n"
    "   `opportunities.write`.\n"
    "3. Point the form, the email forward and the phone note at the **production**\n"
    "   webhook URL (`/webhook/ghl-lead`).\n"
    "4. `DRY_RUN = false` — only then may a run write to a client's CRM."))

c1 = {
    "A lead arrives": main("config"),
    "Run the demo lead": main("load a demo lead"),
    "load a demo lead": main("config"),
    "config": main("read the lead"),
    "read the lead": main("a usable lead?"),
    "a usable lead?": branch(["route the lead"], ["STOP: not a usable lead"]),
    "STOP: not a usable lead": main("End"),
    "route the lead": main("build the GoHighLevel payload"),
    "build the GoHighLevel payload": main("GoHighLevel connected?"),
    "GoHighLevel connected?": branch(["[cred] GoHighLevel - create the contact"],
                                     ["STOP: GoHighLevel not configured - payload shown"]),
    "STOP: GoHighLevel not configured - payload shown": main("End"),
    "[cred] GoHighLevel - create the contact": branch(["STOP: filed in GoHighLevel"],
                                                      ["STOP: GoHighLevel rejected the write"]),
    "STOP: filed in GoHighLevel": main("End"),
    "STOP: GoHighLevel rejected the write": main("End"),
}

p1, n1 = save("01-intake-and-routing", w1, c1, ["ghl", "lead-intake"])

# =====================================================================  WORKFLOW 2
w2 = []

w2.append({"parameters": {}, "id": "seq-now", "name": "Run the sequence now",
    "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-1240, 160]})

w2.append({"parameters": {"rule": {"interval": [{"field": "cronExpression",
        "expression": "0 8 * * 1-5"}]}},
    "id": "seq-sched", "name": "Every weekday morning, 08:00",
    "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2, "position": [-1240, 380]})

w2.append(code("cfg2", "config", [-1020, 260], "config.js"))
w2.append(if_flag("connected2", "GoHighLevel connected?", [-800, 260], "ghl_enabled"))
w2.append(http_get_opportunities("ghl-read", "[cred] GoHighLevel - read the pipeline",
                                 [-560, 100]))
w2.append(code("demo-pipe", "use the demo pipeline", [-560, 420], "use-the-demo-pipeline.js"))
w2.append(code("stop-noread", "STOP: could not read the pipeline", [-320, 620],
               "stop-could-not-read.js"))
w2.append(code("readpipe", "read the pipeline", [-320, 260], "read-the-pipeline.js"))
w2.append(code("plan", "plan the sequence", [-100, 260], "plan-the-sequence.js"))
w2.append(if_expr("due", "anything due?", [120, 260], "={{ $json._has_due }}"))
w2.append(code("stop-nodue", "STOP: nothing due today", [340, 460], "stop-nothing-due.js"))

w2.append(code("compose", "compose the next touch", [340, 140], "compose-the-next-touch.js"))
w2.append(if_flag("sending", "sending the touches?", [560, 140], "ghl_enabled"))
w2.append(code("stop-prev2", "STOP: preview - touches not sent", [780, 340],
               "stop-preview-sequence.js"))

w2.append(http_post("ghl-send", "[cred] GoHighLevel - send the touch", [780, 40],
    url="={{ $json._ghl.url }}",
    body="={{ JSON.stringify($json._ghl.body) }}",
    note="GoHighLevel conversations: post the touch to the contact. The key comes from the "
         "config node; a blank key means this node never executes."))
w2.append(code("stop-sent", "STOP: touches sent", [1020, -60], "stop-touches-sent.js"))
w2.append(code("stop-sendrej", "STOP: GoHighLevel rejected the touch", [1020, 200],
               "stop-touch-rejected.js"))

w2.append(noop("end2", "End", [1280, 260]))

w2.append(sticky("start2", [-1300, -1040], 560, 600, 1,
    "## Follow-up sequence — start here\n\n"
    "The second of two workflows. Import it alongside **01-intake-and-routing** — both\n"
    "share the same **config** node, and 01 is what writes the contacts this one reads.\n\n"
    "**Run it before you configure anything.** Press **Execute Workflow**: six\n"
    "invented leads from the built-in demo pipeline, and every decision in one run —\n"
    "two due, one waiting, three stopped. Open **STOP: preview - touches not sent** to\n"
    "read the exact message each due lead would receive. No credential, nothing sent.\n\n"
    "**Setup, in order**\n"
    "1. **config** — the same ids as workflow 01: location, pipeline, `STAGES`,\n"
    "   `OWNERS`, `CUSTOM_FIELDS`.\n"
    "2. `GHL_API_KEY` — this one also needs `conversations.write` to send a touch.\n"
    "3. `SEQ_TOUCHES_FIELD_ID`, `SEQ_LAST_TOUCH_FIELD_ID`, `SEQ_LAST_REPLY_FIELD_ID`\n"
    "   — where the counter and the two dates live on the contact.\n"
    "4. `SEQUENCE`, `MAX_TOUCHES`, `OPEN_STAGES` — the ladder and its stops. Leave\n"
    "   `MAX_TOUCHES` at 3 until the replies say otherwise.\n"
    "5. Something must write `touches_sent` back after each touch, or the ladder\n"
    "   never advances.\n"
    "6. `DRY_RUN = false` — only then may a touch reach a real person."))

w2.append(sticky("w2a", [-1280, -150], 480, 380, 4,
    "## 2 of 2 — the follow-up sequence\n\n"
    "Every weekday morning, or by hand. It reads the pipeline from\n"
    "**GoHighLevel** — or from the built-in demo pipeline when no key is\n"
    "set — then decides, for each lead, one of three things:\n\n"
    "**Due.** Quiet for long enough for the next touch — so the touch is\n"
    "composed and sent.\n\n"
    "**Waiting.** Not quiet long enough yet. Nothing happens.\n\n"
    "**Stopped.** They replied, or the stage left the open list, or the\n"
    "sequence is finished. It says which, on the node.\n\n"
    "One touch per lead per run, `MAX_TOUCHES` in total — the counter is\n"
    "`touches_sent` on the contact."))

w2.append(sticky("w2b", [1080, 440], 480, 300, 3,
    "## The stops are the point\n\n"
    "A follow-up sequence is only as good as the rule that ends it. A lead\n"
    "is dropped the moment it stops being a lead: a reply moves it to a\n"
    "person, a stage move takes it out of the open list, and the counter\n"
    "caps the nudging so nobody is chased forever.\n\n"
    "With GoHighLevel unconfigured, **STOP: preview** prints the exact\n"
    "message each lead would receive. A read that fails does NOT fall back\n"
    "to the demo leads — a fabricated lead is never sequenced against a\n"
    "real account."))

c2 = {
    "Run the sequence now": main("config"),
    "Every weekday morning, 08:00": main("config"),
    "config": main("GoHighLevel connected?"),
    "GoHighLevel connected?": branch(["[cred] GoHighLevel - read the pipeline"],
                                     ["use the demo pipeline"]),
    "[cred] GoHighLevel - read the pipeline": branch(["read the pipeline"],
                                                     ["STOP: could not read the pipeline"]),
    "STOP: could not read the pipeline": main("End"),
    "use the demo pipeline": main("read the pipeline"),
    "read the pipeline": main("plan the sequence"),
    "plan the sequence": main("anything due?"),
    "anything due?": branch(["compose the next touch"], ["STOP: nothing due today"]),
    "STOP: nothing due today": main("End"),
    "compose the next touch": main("sending the touches?"),
    "sending the touches?": branch(["[cred] GoHighLevel - send the touch"],
                                   ["STOP: preview - touches not sent"]),
    "STOP: preview - touches not sent": main("End"),
    "[cred] GoHighLevel - send the touch": branch(["STOP: touches sent"],
                                                  ["STOP: GoHighLevel rejected the touch"]),
    "STOP: touches sent": main("End"),
    "STOP: GoHighLevel rejected the touch": main("End"),
}

p2, n2 = save("02-follow-up-sequence", w2, c2, ["ghl", "follow-up"])

print('wrote %s (%d nodes)' % (os.path.basename(p1), n1))
print('wrote %s (%d nodes)' % (os.path.basename(p2), n2))
