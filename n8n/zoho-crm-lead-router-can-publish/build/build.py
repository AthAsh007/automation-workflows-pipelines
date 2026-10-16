# Builds ../01-lead-routing.json and ../02-stage-sweep.json from js/*.js.
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


# A Zoho access token lives one hour, so every run exchanges the refresh token for a fresh
# one rather than carrying a pasted token that expires mid-week. Query parameters, not a
# body: that is what Zoho's token endpoint accepts.
def zoho_token(nid, name, pos):
    return {"parameters": {
                "method": "POST",
                "url": "={{ %s.zoho_accounts_base + '/oauth/v2/token' }}" % CFG,
                "sendQuery": True,
                "queryParameters": {"parameters": [
                    {"name": "refresh_token", "value": "={{ %s.zoho_refresh_token }}" % CFG},
                    {"name": "client_id", "value": "={{ %s.zoho_client_id }}" % CFG},
                    {"name": "client_secret", "value": "={{ %s.zoho_client_secret }}" % CFG},
                    {"name": "grant_type", "value": "refresh_token"}]},
                "options": {"timeout": 20000}},
            "id": nid, "name": name, "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2, "position": pos, "onError": "continueErrorOutput",
            "executeOnce": True,
            "notes": "Exchanges the refresh token for an access token valid for one hour. "
                     "The three OAuth values come from the config node; all blank means this "
                     "node never executes. Zoho answers a FAILED refresh with HTTP 200 and an "
                     "'error' key, so the next node checks the body, not the status code."}


def zoho_post(nid, name, pos, url, body, token, note):
    # onError continueErrorOutput, NOT continueRegularOutput: a refused call must land on a
    # named STOP node with the response on it, never be swallowed.
    return {"parameters": {
                "method": "POST", "url": url,
                "sendHeaders": True, "headerParameters": {"parameters": [
                    {"name": "Authorization", "value": token},
                    {"name": "Content-Type", "value": "application/json"},
                    {"name": "Accept", "value": "application/json"}]},
                "sendBody": True, "specifyBody": "json", "jsonBody": body,
                "options": {"timeout": 30000}},
            "id": nid, "name": name, "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2, "position": pos, "onError": "continueErrorOutput",
            "notes": note}


def notify(nid, name, pos, note):
    return {"parameters": {
                "method": "POST", "url": "={{ $json._notify.url }}",
                "sendHeaders": True, "headerParameters": {"parameters": [
                    {"name": "Content-Type", "value": "application/json"}]},
                "sendBody": True, "specifyBody": "json",
                "jsonBody": "={{ JSON.stringify($json._notify.body) }}",
                "options": {"timeout": 15000}},
            "id": nid, "name": name, "type": "n8n-nodes-base.httpRequest",
            "typeVersion": 4.2, "position": pos, "onError": "continueErrorOutput",
            "notes": note}


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


TOKEN_W1 = "={{ 'Zoho-oauthtoken ' + $json._access_token }}"
TOKEN_W2 = "={{ 'Zoho-oauthtoken ' + $('read the access token').first().json._access_token }}"

# =====================================================================  WORKFLOW 1
w1 = []

# The webhook acknowledges at once and the run continues — an intake endpoint should not hold
# a form POST open while it talks to a CRM.
w1.append({"parameters": {"httpMethod": "POST", "path": "zoho-lead",
        "responseMode": "onReceived", "options": {}},
    "id": "hook", "name": "A lead arrives", "type": "n8n-nodes-base.webhook",
    "typeVersion": 2, "position": [-1500, 240], "webhookId": "zoho-lead"})

w1.append({"parameters": {}, "id": "demo", "name": "Run the demo lead",
    "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-1500, 480]})

w1.append(code("demo-lead", "load a demo lead", [-1280, 480], "load-a-demo-lead.js"))
w1.append(code("cfg1", "config", [-1060, 320], "config.js"))
w1.append(code("read", "read the lead", [-840, 320], "read-the-lead.js"))
w1.append(if_expr("usable", "a usable lead?", [-620, 320], "={{ $json._ok }}"))
w1.append(code("stop-unusable", "STOP: not a usable lead", [-400, 520], "stop-not-usable.js"))

w1.append(code("route", "route the lead", [-400, 180], "route-the-lead.js"))
w1.append(code("payload", "build the Zoho payload", [-180, 60], "build-the-zoho-payload.js"))
w1.append(if_flag("connected", "Zoho connected?", [40, 60], "zoho_enabled"))
w1.append(code("stop-nocfg", "STOP: Zoho not configured - payload shown", [260, 240],
               "stop-not-configured.js"))

w1.append(zoho_token("tok1", "[cred] Zoho - get an access token", [260, -80]))
w1.append(code("tokread1", "read the access token", [480, -80], "read-the-token-w1.js"))
w1.append(if_expr("authed1", "authenticated?", [700, -80], "={{ $json._authed }}"))
w1.append(code("stop-noauth1", "STOP: could not authenticate with Zoho", [920, 80],
               "stop-no-auth.js"))

w1.append(zoho_post("lead-write", "[cred] Zoho CRM - create the lead", [920, -220],
    url="={{ $json._zoho.url }}",
    body="={{ JSON.stringify($json._zoho.body) }}",
    token=TOKEN_W1,
    note="POST /crm/v8/Leads. The body was assembled in 'build the Zoho payload' so it can "
         "be read on the preview STOP node without a credential. `trigger` decides whether "
         "Zoho's own workflow rules fire — see ZOHO_TRIGGERS in config."))
w1.append(code("stop-filed", "STOP: filed in Zoho CRM", [1160, -340], "stop-filed.js"))
w1.append(code("stop-rejected", "STOP: Zoho rejected the write", [1160, -120],
               "stop-rejected.js"))

# The notification is composed from the ROUTING decision, not the Zoho response, so the team
# is told who owns a lead even on a run where the write later fails.
w1.append(code("notify-compose", "compose the lead notification", [-180, 380],
               "compose-the-lead-notification.js"))
w1.append(if_expr("notifying", "notifying?", [40, 380], "={{ $json._send }}"))
w1.append(code("stop-nonotify", "STOP: notification not sent", [260, 560],
               "stop-notify-preview.js"))
w1.append(notify("notify1", "[cred] Notify - post the message", [260, 400],
                 note="Any endpoint that accepts a JSON POST. Blank NOTIFY_WEBHOOK_URL means "
                      "this node never executes and the run still completes."))
w1.append(code("stop-notified", "STOP: team notified", [480, 300], "stop-notified.js"))
w1.append(code("stop-notifyrej", "STOP: notification rejected", [480, 520],
               "stop-notify-rejected.js"))

w1.append(noop("end1", "End", [1440, 180]))

w1.append(sticky("start1", [-1560, -1060], 580, 620, 1,
    "## Lead routing — start here\n\n"
    "The first of two workflows. Import it alongside **02-stage-sweep** — both share the\n"
    "same **config** node.\n\n"
    "**Run it before you configure anything.** Press **Execute Workflow** on the\n"
    "**Run the demo lead** trigger: three invented leads, one per source, through the\n"
    "whole thing. No credential, no Zoho account, nothing leaving the building. Open\n"
    "**STOP: Zoho not configured - payload shown** to read the exact `/crm/v8/Leads`\n"
    "body it would have sent.\n\n"
    "**Setup, in order**\n"
    "1. **config** — `ZOHO_API_BASE` and `ZOHO_ACCOUNTS_BASE` for YOUR data centre.\n"
    "   Getting the region wrong is the usual cause of INVALID_TOKEN on a good token.\n"
    "2. Register a Self Client at api-console.zoho.com, authorise it once, and put the\n"
    "   **refresh** token in `ZOHO_REFRESH_TOKEN` with the client id and secret. Never\n"
    "   paste an access token: it expires in an hour.\n"
    "3. `OWNERS` user ids, `LEAD_LAYOUT_ID` and the `CUSTOM_FIELDS` API names.\n"
    "4. `ROUTING_RULES` — the table that decides everything. Check every `status`\n"
    "   against your own Lead Status picklist before going live.\n"
    "5. Leave `ZOHO_TRIGGERS` empty while Deluge still routes, or leads get routed twice.\n"
    "6. Point the form, the email forward and the phone note at the **production**\n"
    "   webhook URL (`/webhook/zoho-lead`).\n"
    "7. `DRY_RUN = false` — only then may a run write to a real CRM."))

w1.append(sticky("w1a", [-1540, -380], 500, 340, 4,
    "## 1 of 2 — a lead in, routed and filed\n\n"
    "Two ways in, one path through:\n\n"
    "* a form, an email forward or a phone note posts to **A lead arrives**\n"
    "* or press **Run the demo lead** for three invented leads, one per source\n\n"
    "It then:\n\n"
    "1. reads the lead whatever shape it arrived in\n"
    "2. rejects a bot, or anything with no way to reach the person\n"
    "3. routes it by the rule table to an owner, a status and tags\n"
    "4. builds the exact Zoho request\n"
    "5. writes it — or, with no credential, shows you the request\n"
    "6. tells the team who owns it\n\n"
    "Everything you edit is in the **config** node."))

w1.append(sticky("w1b", [1240, 140], 480, 300, 3,
    "## Two writes, two visible failures\n\n"
    "The token exchange and the lead write each have their own named\n"
    "STOP on failure, because they fail for different reasons and the\n"
    "fix is different.\n\n"
    "**Auth failed** — usually the wrong data centre, or a revoked\n"
    "refresh token. Read `_hint` on the node.\n\n"
    "**Write rejected** — usually a `status` in ROUTING_RULES that is\n"
    "not in the org's Lead Status picklist, or a layout with a\n"
    "mandatory field this payload does not send.\n\n"
    "Neither one fails the run silently."))

c1 = {
    "A lead arrives": main("config"),
    "Run the demo lead": main("load a demo lead"),
    "load a demo lead": main("config"),
    "config": main("read the lead"),
    "read the lead": main("a usable lead?"),
    "a usable lead?": branch(["route the lead"], ["STOP: not a usable lead"]),
    "STOP: not a usable lead": main("End"),
    "route the lead": main("build the Zoho payload", "compose the lead notification"),

    "build the Zoho payload": main("Zoho connected?"),
    "Zoho connected?": branch(["[cred] Zoho - get an access token"],
                              ["STOP: Zoho not configured - payload shown"]),
    "STOP: Zoho not configured - payload shown": main("End"),
    "[cred] Zoho - get an access token": branch(["read the access token"],
                                                ["STOP: could not authenticate with Zoho"]),
    "read the access token": main("authenticated?"),
    "authenticated?": branch(["[cred] Zoho CRM - create the lead"],
                             ["STOP: could not authenticate with Zoho"]),
    "STOP: could not authenticate with Zoho": main("End"),
    "[cred] Zoho CRM - create the lead": branch(["STOP: filed in Zoho CRM"],
                                                ["STOP: Zoho rejected the write"]),
    "STOP: filed in Zoho CRM": main("End"),
    "STOP: Zoho rejected the write": main("End"),

    "compose the lead notification": main("notifying?"),
    "notifying?": branch(["[cred] Notify - post the message"],
                         ["STOP: notification not sent"]),
    "STOP: notification not sent": main("End"),
    "[cred] Notify - post the message": branch(["STOP: team notified"],
                                               ["STOP: notification rejected"]),
    "STOP: team notified": main("End"),
    "STOP: notification rejected": main("End"),
}

p1, n1 = save("01-lead-routing", w1, c1, ["zoho", "lead-intake"])

# =====================================================================  WORKFLOW 2
w2 = []

w2.append({"parameters": {}, "id": "sweep-now", "name": "Run the sweep now",
    "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-1500, 180]})

w2.append({"parameters": {"rule": {"interval": [{"field": "cronExpression",
        "expression": "0 7 * * 1-5"}]}},
    "id": "sweep-sched", "name": "Every weekday morning, 07:00",
    "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2, "position": [-1500, 400]})

w2.append(code("cfg2", "config", [-1280, 280], "config.js"))
w2.append(if_flag("connected2", "Zoho connected?", [-1060, 280], "zoho_enabled"))

w2.append(zoho_token("tok2", "[cred] Zoho - get an access token", [-840, 120]))
w2.append(code("tokread2", "read the access token", [-620, 120], "read-the-token-w2.js"))
w2.append(if_expr("authed2", "authenticated?", [-400, 120], "={{ $json._authed }}"))
w2.append(code("stop-noauth2", "STOP: could not authenticate with Zoho", [-180, -60],
               "stop-no-auth.js"))
w2.append(code("query", "build the deal query", [-180, 120], "build-the-deal-query.js"))

w2.append(zoho_post("deals-read", "[cred] Zoho CRM - read the open deals", [40, 120],
    url="={{ %s.zoho_api_base + '/crm/' + %s.zoho_api_version + '/coql' }}" % (CFG, CFG),
    body="={{ JSON.stringify({ select_query: $json.select_query }) }}",
    token=TOKEN_W2,
    note="COQL read of every deal in an OPEN_STAGES stage. Needs the ZohoCRM.coql.READ "
         "scope as well as deals.READ. `more_records` in the response is reported by "
         "'read the pipeline', never ignored."))
w2.append(code("stop-noread", "STOP: could not read the pipeline", [260, -60],
               "stop-could-not-read.js"))

w2.append(code("demo-pipe", "use the demo pipeline", [-840, 460], "use-the-demo-pipeline.js"))
w2.append(code("readpipe", "read the pipeline", [280, 280], "read-the-pipeline.js"))
w2.append(code("checkall", "check every deal", [500, 280], "check-every-deal.js"))

w2.append(if_expr("work", "anything to create?", [720, 160], "={{ $json._has_work }}"))
w2.append(code("stop-compliant", "STOP: every open deal has a next action", [940, 0],
               "stop-all-compliant.js"))
w2.append(code("compose", "compose the next action", [940, 180],
               "compose-the-next-action.js"))
w2.append(if_flag("creating", "creating the tasks?", [1160, 180], "zoho_enabled"))
w2.append(code("stop-prevtask", "STOP: preview - tasks not created", [1380, 340],
               "stop-preview-tasks.js"))

w2.append(zoho_post("task-write", "[cred] Zoho CRM - create the tasks", [1380, 100],
    url="={{ $json._zoho.url }}",
    body="={{ JSON.stringify($json._zoho.body) }}",
    token=TOKEN_W2,
    note="POST /crm/v8/Tasks, the whole batch in one call. Each task carries What_Id AND "
         "$se_module - sending the deal id without the module name creates a task attached "
         "to nothing."))
w2.append(code("stop-tasks", "STOP: tasks created", [1600, -20], "stop-tasks-created.js"))
w2.append(code("stop-taskrej", "STOP: Zoho rejected the tasks", [1600, 200],
               "stop-task-rejected.js"))

w2.append(code("digest", "compose the digest", [720, 520], "compose-the-digest.js"))
w2.append(if_expr("posting", "posting the digest?", [940, 520], "={{ $json._send }}"))
w2.append(code("stop-nodigest", "STOP: digest not sent", [1160, 700],
               "stop-notify-preview.js"))
w2.append(notify("notify2", "[cred] Notify - post the digest", [1160, 520],
                 note="Any endpoint that accepts a JSON POST. Blank NOTIFY_WEBHOOK_URL means "
                      "this node never executes and the sweep still completes."))
w2.append(code("stop-digested", "STOP: digest posted", [1380, 620], "stop-notified.js"))
w2.append(code("stop-digestrej", "STOP: digest rejected", [1380, 840],
               "stop-notify-rejected.js"))

w2.append(noop("end2", "End", [1840, 300]))

w2.append(sticky("start2", [-1560, -1060], 580, 620, 1,
    "## Stage sweep — start here\n\n"
    "The second of two workflows. Import it alongside **01-lead-routing** — both share\n"
    "the same **config** node.\n\n"
    "**Run it before you configure anything.** Press **Execute Workflow**: six invented\n"
    "deals from the built-in demo pipeline, and every verdict in one run — two needing a\n"
    "next action, one escalated, one stalled, one already fine, one in a closed stage the\n"
    "sweep leaves alone. Open **STOP: preview - tasks not created** to read the exact\n"
    "`/crm/v8/Tasks` body, and **compose the digest** for the summary.\n\n"
    "**Setup, in order**\n"
    "1. **config** — same values as workflow 01. It is the same node.\n"
    "2. `OPEN_STAGES` — check every name against your own Deal Stage picklist. A stage\n"
    "   that does not exist does not error; it silently matches nothing.\n"
    "3. `STAGE_ACTIONS` — the task each stage calls for, when it is due, and how long a\n"
    "   deal may sit there before it is called stalled.\n"
    "4. The Zoho app needs `ZohoCRM.coql.READ` on top of deals.READ and tasks.CREATE.\n"
    "5. `NOTIFY_WEBHOOK_URL` if you want the digest posted somewhere.\n"
    "6. `DRY_RUN = false` — only then may the sweep create tasks in a real CRM."))

w2.append(sticky("w2a", [-1540, -380], 500, 360, 4,
    "## 2 of 2 — the stage sweep\n\n"
    "Every weekday at 07:00, or by hand. It reads every open deal from\n"
    "**Zoho** — or the built-in demo pipeline when no credential is set —\n"
    "and asks one question of each:\n\n"
    "**NO OPEN DEAL SHOULD SIT IN A STAGE WITHOUT THE NEXT ACTION THAT\n"
    "STAGE CALLS FOR.**\n\n"
    "**Create.** Open, no next step recorded — the stage's task is made.\n\n"
    "**Escalate.** Has a next step, already overdue. Reported, and\n"
    "deliberately NOT given a second task.\n\n"
    "**Ok.** Has a next step, not overdue. Nothing happens.\n\n"
    "**Skip.** Not an open stage. Left alone.\n\n"
    "Stalled is separate: a deal can be compliant and still untouched\n"
    "for a month. It is reported, never actioned."))

w2.append(sticky("w2b", [1700, 380], 500, 340, 3,
    "## Why this runs beside Zoho's own rules\n\n"
    "A Zoho workflow rule fires on a stage **change**. The deal that\n"
    "worries you is the one that never changed — nothing fired for it,\n"
    "so nothing caught it.\n\n"
    "This asks every open deal on a schedule, which is the only way to\n"
    "notice something that did **not** happen.\n\n"
    "And an overdue deal is escalated rather than stacked with a second\n"
    "task. Piling tasks on a deal nobody is working is how a pipeline\n"
    "stops being trusted — and once nobody trusts it, \"nothing falls\n"
    "through the cracks\" is over.\n\n"
    "A read that FAILS does not fall back to the demo deals."))

c2 = {
    "Run the sweep now": main("config"),
    "Every weekday morning, 07:00": main("config"),
    "config": main("Zoho connected?"),
    "Zoho connected?": branch(["[cred] Zoho - get an access token"], ["use the demo pipeline"]),

    "[cred] Zoho - get an access token": branch(["read the access token"],
                                                ["STOP: could not authenticate with Zoho"]),
    "read the access token": main("authenticated?"),
    "authenticated?": branch(["build the deal query"],
                             ["STOP: could not authenticate with Zoho"]),
    "STOP: could not authenticate with Zoho": main("End"),
    "build the deal query": main("[cred] Zoho CRM - read the open deals"),
    "[cred] Zoho CRM - read the open deals": branch(["read the pipeline"],
                                                    ["STOP: could not read the pipeline"]),
    "STOP: could not read the pipeline": main("End"),

    "use the demo pipeline": main("read the pipeline"),
    "read the pipeline": main("check every deal"),
    "check every deal": main("anything to create?", "compose the digest"),

    "anything to create?": branch(["compose the next action"],
                                  ["STOP: every open deal has a next action"]),
    "STOP: every open deal has a next action": main("End"),
    "compose the next action": main("creating the tasks?"),
    "creating the tasks?": branch(["[cred] Zoho CRM - create the tasks"],
                                  ["STOP: preview - tasks not created"]),
    "STOP: preview - tasks not created": main("End"),
    "[cred] Zoho CRM - create the tasks": branch(["STOP: tasks created"],
                                                 ["STOP: Zoho rejected the tasks"]),
    "STOP: tasks created": main("End"),
    "STOP: Zoho rejected the tasks": main("End"),

    "compose the digest": main("posting the digest?"),
    "posting the digest?": branch(["[cred] Notify - post the digest"],
                                  ["STOP: digest not sent"]),
    "STOP: digest not sent": main("End"),
    "[cred] Notify - post the digest": branch(["STOP: digest posted"],
                                              ["STOP: digest rejected"]),
    "STOP: digest posted": main("End"),
    "STOP: digest rejected": main("End"),
}

p2, n2 = save("02-stage-sweep", w2, c2, ["zoho", "pipeline-hygiene"])

print('wrote %s (%d nodes)' % (os.path.basename(p1), n1))
print('wrote %s (%d nodes)' % (os.path.basename(p2), n2))
