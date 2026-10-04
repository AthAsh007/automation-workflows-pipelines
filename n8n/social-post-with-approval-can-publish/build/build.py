# Builds ../01-draft-and-approve.json and ../02-publish-on-approval.json from js/*.js
# Run: python build.py
#
# The Code nodes live in js/ as real JavaScript so they can be linted, parsed and simulated
# without going through n8n. Nothing is hand-edited in the JSON.
import io, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..')
CFG = "$('config').first().json"


def js(name):
    with io.open(os.path.join(HERE, 'js', name), encoding='utf-8') as f:
        return f.read().rstrip()


# ---------------------------------------------------------------------- node constructors
def code(nid, name, pos, file, **kw):
    n = {"parameters": {"jsCode": js(file)}, "id": nid, "name": name,
         "type": "n8n-nodes-base.code", "typeVersion": 2, "position": pos}
    n.update(kw)
    return n


def code_all(nid, name, pos, file, **kw):
    # Run Once for All Items. The default is once per item, which would run a state machine
    # that reads the whole log once for every row in it.
    n = code(nid, name, pos, file, **kw)
    n["parameters"]["mode"] = "runOnceForAllItems"
    return n


def if_expr(nid, name, pos, left, notes=None):
    n = {"parameters": {"conditions": {"options": {"caseSensitive": True, "leftValue": "",
                "typeValidation": "loose", "version": 2},
            "conditions": [{"id": nid + "-c", "leftValue": left, "rightValue": "true",
                "operator": {"type": "boolean", "operation": "true", "singleValue": True}}],
            "combinator": "and"},
        "looseTypeValidation": True, "options": {}},
        "id": nid, "name": name, "type": "n8n-nodes-base.if",
        "typeVersion": 2.2, "position": pos}
    if notes:
        n["notes"] = notes
    return n


def switch(nid, name, pos, expr, outputs, notes=None):
    # outputs is a list of (value, label). A value that matches nothing goes to the fallback
    # output, which is always wired — never to nothing.
    rules = [{"conditions": {"options": {"caseSensitive": True, "leftValue": "",
                    "typeValidation": "loose", "version": 2},
                "conditions": [{"id": "%s-r%d" % (nid, i), "leftValue": expr,
                    "rightValue": value,
                    "operator": {"type": "string", "operation": "equals"}}],
                "combinator": "and"},
              "renameOutput": True, "outputKey": label}
             for i, (value, label) in enumerate(outputs)]
    n = {"parameters": {"rules": {"values": rules},
                        "options": {"fallbackOutput": "extra", "renameFallbackOutput": "other"}},
         "id": nid, "name": name, "type": "n8n-nodes-base.switch",
         "typeVersion": 3.2, "position": pos}
    if notes:
        n["notes"] = notes
    return n


def merge(nid, name, pos, inputs=2):
    return {"parameters": {"mode": "append", "numberInputs": inputs},
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
        # RAW, not USER_ENTERED. Let Sheets turn "2026-09-02" into a real date and it reads
        # back locale-formatted, which the "is there a row for today" check cannot match —
        # so every day looks new and the job drafts twice.
        params["options"] = {"cellFormat": "RAW"}
    n = {"parameters": params, "id": nid, "name": name,
         "type": "n8n-nodes-base.googleSheets", "typeVersion": 4.5, "position": pos}
    if always:
        # A log tab holding only a header row returns zero items, and n8n then skips every
        # node downstream — the run goes green and stops, which reads as a broken workflow
        # rather than an empty log. One empty item keeps the run alive.
        n["alwaysOutputData"] = True
    if notes:
        n["notes"] = notes
    return n


def http(nid, name, pos, method, url, headers=None, query=None, body=None, timeout=30000,
         notes=None, binary_out=False, binary_in=None, full_response=False, on_error=None,
         retry=True):
    params = {"method": method, "url": url, "options": {"timeout": timeout}}
    if headers:
        params["sendHeaders"] = True
        params["headerParameters"] = {"parameters": [
            {"name": k, "value": v} for k, v in headers]}
    if query:
        params["sendQuery"] = True
        params["queryParameters"] = {"parameters": [
            {"name": k, "value": v} for k, v in query]}
    if binary_in:
        params["sendBody"] = True
        params["contentType"] = "binaryData"
        params["inputDataFieldName"] = binary_in
    elif body is not None:
        params["sendBody"] = True
        params["specifyBody"] = "json"
        params["jsonBody"] = body
    if binary_out:
        params["options"]["response"] = {"response": {"responseFormat": "file",
                                                      "outputPropertyName": "data"}}
    if full_response:
        params["options"].setdefault("response", {}).setdefault("response", {})
        params["options"]["response"]["response"]["fullResponse"] = True
        params["options"]["response"]["response"]["neverError"] = True
    n = {"parameters": params, "id": nid, "name": name,
         "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": pos}
    if on_error:
        n["onError"] = on_error
    if retry:
        n["retryOnFail"] = True
        n["maxTries"] = 2
        n["waitBetweenTries"] = 2000
    if notes:
        n["notes"] = notes
    return n


def main(*t):
    return {"main": [[{"node": x, "type": "main", "index": 0} for x in t]]}


def branch(yes, no):
    return {"main": [[{"node": x, "type": "main", "index": 0} for x in yes],
                     [{"node": x, "type": "main", "index": 0} for x in no]]}


def outputs(*groups):
    return {"main": [[{"node": x, "type": "main", "index": 0} for x in g] for g in groups]}


def to_input(node, index):
    return {"main": [[{"node": node, "type": "main", "index": index}]]}


def save(filename, name, nodes, connections, tags):
    wf = {"name": name, "nodes": nodes, "connections": connections,
          "settings": {"executionOrder": "v1"}, "pinData": {},
          "meta": {"templateCredsSetupCompleted": False}, "tags": tags}
    path = os.path.join(OUT, filename)
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
        f.write('\n')
    return path, len(nodes)


TAGS = [{"name": "acme"}, {"name": "linkedin"}]

# ======================================================================================
#  WORKFLOW 01 — draft, render, deliver for approval
# ======================================================================================
w = []

w.append({"parameters": {}, "id": "manual1", "name": "Run it now",
          "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-1560, 460]})

w.append({"parameters": {"rule": {"interval": [{"field": "cronExpression",
              "expression": "0 8 * * 1-5"}]}},
          "id": "sched1", "name": "Every weekday, 08:00",
          "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2,
          "position": [-1560, 260],
          "notes": "08:00 Mon-Fri. The workflow's own timezone setting governs this; "
                   "TIMEZONE in config governs which calendar day the log is keyed on. "
                   "Set both to the same zone."})

w.append(code("cfg1", "config", [-1340, 360], "config.js"))

w.append(sheet("read-log1", "[cred] Sheets - read the log", [-1120, 360], "log_tab",
               always=True,
               notes="alwaysOutputData is on. Without it a log holding only a header row "
                     "ends the run here with a green tick and no explanation."))
w.append(code_all("state", "resolve todays state", [-900, 360], "resolve-todays-state.js"))

w.append(if_expr("draftable", "draft today?", [-680, 360], "={{ $json._draftable }}",
                 notes="The four-state machine in §7 of the Hermes setup doc. The LOG "
                       "decides, never the presence of a rendered file."))
w.append(code("stop-silent", "STOP: silent", [-460, 560], "stop-silent.js"))

w.append(sheet("read-bank", "[cred] Sheets - read the bank", [-460, 260], "bank_tab",
               always=True,
               notes="Skipped entirely when SHEET_ID is blank - the demo bank in config is "
                     "used instead, so the whole pipeline runs with no Google account."))
w.append(code_all("pick", "pick todays post", [-240, 260], "pick-todays-post.js"))

w.append(if_expr("has-post", "anything to post?", [-20, 260], "={{ $json._has_post }}"))
w.append(code("stop-bank", "STOP: bank exhausted", [200, 460], "stop-bank-exhausted.js"))

# --- the caption: from the bank, or written by the model
w.append(if_expr("need-caption", "caption needed?", [200, 160],
                 "={{ $json._needs_caption && %s.llm_enabled }}" % CFG,
                 notes="A row that already carries a caption goes straight through. The "
                       "model is only ever asked for a caption that does not exist yet - it "
                       "never rewrites copy a person approved."))
w.append(http("llm", "[cred] LLM - write the caption", [420, 60], "POST",
              "={{ %s.llm_base_url }}/v1/chat/completions" % CFG,
              headers=[("Authorization", "=Bearer {{ %s.llm_api_key }}" % CFG),
                       ("Content-Type", "application/json")],
              body=("={{ JSON.stringify({ model: %s.llm_model, stream: false,"
                    " max_tokens: 1200, temperature: 0.7,"
                    " messages: [{ role: 'system', content: $json._llm_system },"
                    " { role: 'user', content: $json._llm_user }] }) }}") % CFG,
              timeout=120000, on_error="continueRegularOutput",
              notes="OpenAI-compatible. stream:false matters - the gateway streams by "
                    "default and n8n cannot read a streamed body. A failure here is not "
                    "fatal: the next node treats a missing caption as a hold, not a crash."))
w.append(merge("merge-caption", "one caption", [640, 160]))
w.append(code("apply-caption", "apply the caption", [860, 160], "apply-the-caption.js"))

w.append(if_expr("caption-ok", "caption ok?", [1080, 160], "={{ $json._caption_ok }}"))
w.append(code("stop-caption", "STOP: caption held", [1300, 360], "stop-no-caption.js"))

# --- the image
w.append(code("build-html", "build the HTML template", [1300, 60],
              "build-the-html-template.js"))
w.append(code("validate", "validate the layout", [1520, 60], "validate-the-layout.js"))
w.append(if_expr("layout-ok", "layout ok?", [1740, 60], "={{ $json._layout_ok }}"))
w.append(code("stop-layout", "STOP: layout failed", [1960, 260], "stop-layout-failed.js"))

w.append(if_expr("render-on", "renderer configured?", [1960, -40],
                 "={{ %s.render_enabled }}" % CFG))
w.append(code("stop-render-cfg", "STOP: renderer not configured", [2180, 160],
              "stop-renderer-not-configured.js"))

w.append(code("render-req", "build the render request", [2180, -140],
              "build-the-render-request.js"))
w.append(switch("which-render", "which renderer?", [2400, -140], "={{ $json._provider }}",
                [("browserless", "browserless"), ("hcti", "hcti")],
                notes="Adding a provider is a branch here plus a block in 'build the render "
                      "request'. Never add one that renders from a URL - the template is not "
                      "hosted anywhere, and hosting it to satisfy a renderer publishes an "
                      "unapproved draft."))

w.append(http("render-bl", "[cred] Browserless - HTML to PNG", [2620, -240], "POST",
              "={{ $json._render_url }}",
              headers=[("Content-Type", "application/json")],
              body="={{ JSON.stringify($json._render_body) }}",
              timeout=120000, binary_out=True, on_error="continueRegularOutput",
              notes="Returns the PNG bytes directly. Self-host it beside n8n - the "
                    "docker-compose service block is in the README."))
w.append(http("render-hcti", "[cred] HCTI - HTML to image", [2620, -40], "POST",
              "={{ $json._render_url }}",
              headers=[("Authorization", "={{ $json._render_auth }}"),
                       ("Content-Type", "application/json")],
              body="={{ JSON.stringify($json._render_body) }}",
              timeout=120000, on_error="continueRegularOutput",
              notes="Returns JSON { url }. The next node downloads it."))
w.append(http("render-dl", "download the rendered image", [2840, -40], "GET",
              "={{ $json.url }}", timeout=60000, binary_out=True,
              on_error="continueRegularOutput"))

w.append(merge("merge-png", "one image", [3060, -140]))
w.append(code("check-png", "check the PNG", [3280, -140], "check-the-png.js",
              alwaysOutputData=True))
w.append(if_expr("png-ok", "image usable?", [3500, -140], "={{ $json._png_ok }}",
                 notes="Checks the PNG signature and the IHDR dimensions in the bytes, not "
                       "the HTTP status. A renderer that answers 200 with a JSON error, or "
                       "with a blank canvas, is a failure that looks like success."))
w.append(code("stop-no-image", "STOP: no image", [3720, 60], "stop-no-image.js"))

# --- deliver
w.append(code("approval-msg", "build the approval message", [3720, -240],
              "build-the-approval-message.js"))
w.append(if_expr("msg-ok", "message fits?", [3940, -240], "={{ $json._message_ok }}"))
w.append(code("stop-too-long", "STOP: message too long", [4160, -40],
              "stop-message-too-long.js"))

w.append(if_expr("deliver-on", "deliver it?", [4160, -340],
                 "={{ %s.deliver_enabled }}" % CFG,
                 notes="False in PREVIEW, which is how this ships. Everything above has "
                       "already run, so the rendered PNG is in this execution to look at."))
w.append(code("stop-preview", "STOP: preview - not delivered", [4380, -140],
              "stop-preview-not-delivered.js"))

w.append({"parameters": {
    "resource": "message", "operation": "send",
    "guildId": {"__rl": True, "mode": "id", "value": ""},
    "channelId": {"__rl": True, "mode": "id",
                  "value": "={{ %s.channel_id }}" % CFG},
    "content": "={{ $json._message }}",
    "options": {}},
    "id": "discord-send", "name": "[cred] Discord - deliver the draft",
    "type": "n8n-nodes-base.discord", "typeVersion": 2, "position": [4380, -440],
    "notes": "The draft and nothing else goes here. No slot number, no run id, no reasoning "
             "about why this post was chosen - the reviewer is looking at the post, not at "
             "the workflow. ATTACH THE PNG: set the node's 'Files' option to the binary "
             "property `data`. A draft that arrives without its image means the bot is "
             "missing Attach Files, and the reviewer is approving something they cannot see."})

w.append(code("log-row", "row for the log", [4600, -440], "row-for-the-log.js",
              notes="Written AFTER the delivery succeeds, never before. A row saying a draft "
                    "is awaiting approval when none was delivered silences tomorrow too, and "
                    "nothing ever clears it."))
w.append(sheet("write-log1", "[cred] Sheets - append the log row", [4820, -440], "log_tab",
               "append", ["Date"]))

w.append(merge("merge-end1", "one outcome", [5040, -140], inputs=2))
w.append(code("summary1", "build the run summary", [5260, -140],
              "build-the-run-summary.js"))
w.append(if_expr("report1", "report configured?", [5480, -140],
                 "={{ %s.report_enabled }}" % CFG))
w.append(http("slack1", "[cred] Slack - post the summary", [5700, -240], "POST",
              "={{ %s.report_webhook_url }}" % CFG,
              body="={{ JSON.stringify($json._slack_body) }}",
              on_error="continueRegularOutput",
              notes="Never carries the caption. A draft that reaches a second audience "
                    "before it is approved has left the approval gate behind."))
w.append({"parameters": {}, "id": "done1", "name": "done",
          "type": "n8n-nodes-base.noOp", "typeVersion": 1, "position": [5700, -40]})

w.append(sticky("s1", [-1580, -60], 460, 280, 4, """## 1 of 2 — draft and approve

Every weekday at 08:00 this picks the next post from the bank, writes or reads its caption,
renders the image, and puts the draft in Discord for a human to approve.

**It never publishes.** Publishing is `02-publish-on-approval.json`, and it only happens
after somebody replies `post`.

**Ships in PREVIEW.** Nothing leaves the building until you set `TEST_CHANNEL_ID`, and
nothing reaches LinkedIn until `TEST_RUN = false` in workflow 02. Two separate acts."""))

w.append(sticky("s2", [1940, -420], 420, 250, 3, """### The image

There is no browser in n8n, so this is one call out to a renderer.

`browserless` self-hosted next to n8n is the shipped answer — the compose service block is
in the README.

**No fallback to an image model.** This canvas is a logo, a headline and small body copy,
which is exactly what an image model cannot be trusted with. A failed render is a failure."""))

w.append(sticky("s3", [4340, -720], 440, 240, 6, """### The approval gate

Anyone who can send a message in this channel can publish to the company page. Use a private
channel made for this and nothing else.

Set the Discord node's **Files** option to the binary property `data` so the PNG is attached.
A draft with no image is one the reviewer cannot actually review."""))

connections1 = {
    "Run it now": main("config"),
    "Every weekday, 08:00": main("config"),
    "config": main("[cred] Sheets - read the log"),
    "[cred] Sheets - read the log": main("resolve todays state"),
    "resolve todays state": main("draft today?"),
    "draft today?": branch(["[cred] Sheets - read the bank"], ["STOP: silent"]),
    "STOP: silent": to_input("one outcome", 1),
    "[cred] Sheets - read the bank": main("pick todays post"),
    "pick todays post": main("anything to post?"),
    "anything to post?": branch(["caption needed?"], ["STOP: bank exhausted"]),
    "STOP: bank exhausted": to_input("one outcome", 1),
    "caption needed?": branch(["[cred] LLM - write the caption"], ["one caption"]),
    "[cred] LLM - write the caption": to_input("one caption", 1),
    "one caption": main("apply the caption"),
    "apply the caption": main("caption ok?"),
    "caption ok?": branch(["build the HTML template"], ["STOP: caption held"]),
    "STOP: caption held": to_input("one outcome", 1),
    "build the HTML template": main("validate the layout"),
    "validate the layout": main("layout ok?"),
    "layout ok?": branch(["renderer configured?"], ["STOP: layout failed"]),
    "STOP: layout failed": to_input("one outcome", 1),
    "renderer configured?": branch(["build the render request"],
                                   ["STOP: renderer not configured"]),
    "STOP: renderer not configured": to_input("one outcome", 1),
    "build the render request": main("which renderer?"),
    "which renderer?": outputs(["[cred] Browserless - HTML to PNG"],
                               ["[cred] HCTI - HTML to image"],
                               ["STOP: renderer not configured"]),
    "[cred] Browserless - HTML to PNG": main("one image"),
    "[cred] HCTI - HTML to image": main("download the rendered image"),
    "download the rendered image": to_input("one image", 1),
    "one image": main("check the PNG"),
    "check the PNG": main("image usable?"),
    "image usable?": branch(["build the approval message"], ["STOP: no image"]),
    "STOP: no image": to_input("one outcome", 1),
    "build the approval message": main("message fits?"),
    "message fits?": branch(["deliver it?"], ["STOP: message too long"]),
    "STOP: message too long": to_input("one outcome", 1),
    "deliver it?": branch(["[cred] Discord - deliver the draft"],
                          ["STOP: preview - not delivered"]),
    "STOP: preview - not delivered": to_input("one outcome", 1),
    "[cred] Discord - deliver the draft": main("row for the log"),
    "row for the log": main("[cred] Sheets - append the log row"),
    "[cred] Sheets - append the log row": main("one outcome"),
    "one outcome": main("build the run summary"),
    "build the run summary": main("report configured?"),
    "report configured?": branch(["[cred] Slack - post the summary"], ["done"]),
}

p1, n1 = save('01-draft-and-approve.json', '01 draft and approve', w, connections1, TAGS)

# ======================================================================================
#  WORKFLOW 02 — read the approval, publish
# ======================================================================================
v = []

v.append({"parameters": {}, "id": "manual2", "name": "Run it now",
          "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-1560, 360]})
v.append({"parameters": {"rule": {"interval": [{"field": "minutes",
              "minutesInterval": 5}]}},
          "id": "sched2", "name": "Every 5 minutes",
          "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2,
          "position": [-1560, 160],
          "notes": "Polling, not a watcher process. Most executions end at 'STOP: nothing "
                   "awaiting' - that is the design. The alternative is a long-lived listener "
                   "somebody has to keep alive across reboots, which is the open question "
                   "the Hermes version never closed."})

v.append(code("cfg2", "config", [-1340, 260], "config.js"))
v.append(sheet("read-log2", "[cred] Sheets - read the log", [-1120, 260], "log_tab",
               always=True))
v.append(code_all("pending", "find the pending draft", [-900, 260],
                  "find-the-pending-draft.js"))

v.append(if_expr("has-pending", "anything awaiting?", [-680, 260],
                 "={{ $json._has_pending }}"))
v.append(code("stop-idle", "STOP: nothing awaiting", [-460, 460],
              "stop-nothing-awaiting.js"))

v.append({"parameters": {
    "resource": "message", "operation": "getAll",
    "guildId": {"__rl": True, "mode": "id", "value": ""},
    "channelId": {"__rl": True, "mode": "id", "value": "={{ $json._channel_id }}"},
    "returnAll": False, "limit": 50, "options": {}},
    "id": "discord-read", "name": "[cred] Discord - read the channel",
    "type": "n8n-nodes-base.discord", "typeVersion": 2, "position": [-460, 160],
    "alwaysOutputData": True,
    "notes": "Newest 50. The draft message is the anchor and everything before it is "
             "ignored, so 50 is ample for a channel used only for approvals - and if the "
             "draft has scrolled out of that window the next node waits rather than guessing."})

v.append(code_all("read-reply", "read the approval reply", [-240, 160],
                  "read-the-approval-reply.js",
                  notes="THE GATE. Only messages after the draft, never the bot's own, never "
                        "another bot's, whole-message match only, first decision wins. "
                        "Substring matching here would make 'do not post' an approval."))

v.append(switch("decision", "what did they say?", [-20, 160], "={{ $json._decision }}",
                [("post", "post"), ("cancel", "cancel")]))

# --- cancel
v.append(code("cancel-row", "row for the cancelled outcome", [200, 360],
              "row-for-the-outcome.js"))
# --- wait
v.append(code("stop-wait", "STOP: still awaiting approval", [200, 560],
              "stop-still-awaiting.js"))

# --- post
v.append(code_all("approved", "the approved draft", [200, 60], "the-approved-draft.js",
                  notes="Publishes the caption from the DISCORD MESSAGE, not from the bank - "
                        "the message is what the human read. The fingerprint written at draft "
                        "time then proves it has not been edited since."))
v.append(if_expr("intact", "still the approved draft?", [420, 60],
                 "={{ $json._publishable }}"))
v.append(code("stop-changed", "STOP: the approved draft changed", [640, 260],
              "stop-draft-changed.js"))

v.append(if_expr("publish-on", "publish it?", [640, -40], "={{ %s.live_publish }}" % CFG,
                 notes="False unless TEST_RUN is false AND a token is set. The approval stays "
                       "open either way, so setting the token and running again publishes the "
                       "same approved draft - it never has to be approved twice."))
v.append(code("stop-not-pub", "STOP: not published", [860, 160], "stop-not-published.js"))

v.append(http("li-init", "[cred] LinkedIn - register the upload", [860, -140], "POST",
              "https://api.linkedin.com/rest/images?action=initializeUpload",
              headers=[("Authorization", "=Bearer {{ %s.linkedin_token }}" % CFG),
                       ("LinkedIn-Version", "={{ %s.linkedin_version }}" % CFG),
                       ("X-Restli-Protocol-Version", "2.0.0"),
                       ("Content-Type", "application/json")],
              body=("={{ JSON.stringify({ initializeUploadRequest:"
                    " { owner: %s.linkedin_org_urn } }) }}") % CFG,
              notes="Step 1 of 3. Nothing is public until step 3."))
v.append(http("li-fetch", "download the approved image", [1080, -140], "GET",
              "={{ $('the approved draft').first().json._image_url }}",
              binary_out=True,
              notes="The image the reviewer actually saw, off the approved message. Fetched "
                    "fresh rather than kept from yesterday, so there is no expiring CDN link."))
v.append(http("li-upload", "[cred] LinkedIn - upload the image", [1300, -140], "PUT",
              "={{ $('[cred] LinkedIn - register the upload').first().json.value.uploadUrl }}",
              headers=[("Authorization", "=Bearer {{ %s.linkedin_token }}" % CFG)],
              binary_in="data", timeout=120000,
              notes="Step 2 of 3. Raw bytes, not multipart. Still not public."))
v.append(http("li-post", "[cred] LinkedIn - publish the post", [1520, -140], "POST",
              "https://api.linkedin.com/rest/posts",
              headers=[("Authorization", "=Bearer {{ %s.linkedin_token }}" % CFG),
                       ("LinkedIn-Version", "={{ %s.linkedin_version }}" % CFG),
                       ("X-Restli-Protocol-Version", "2.0.0"),
                       ("Content-Type", "application/json")],
              body=("={{ JSON.stringify({"
                    " author: %s.linkedin_org_urn,"
                    " commentary: $('the approved draft').first().json._caption_escaped,"
                    " visibility: 'PUBLIC',"
                    " distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [],"
                    " thirdPartyDistributionChannels: [] },"
                    " content: { media: { id: $('[cred] LinkedIn - register the upload')"
                    ".first().json.value.image } },"
                    " lifecycleState: 'PUBLISHED',"
                    " isReshareDisabledByAuthor: false }) }}") % CFG,
              full_response=True, retry=False, on_error="continueRegularOutput",
              notes="STEP 3 OF 3 - THE IRREVERSIBLE ONE. retryOnFail is deliberately OFF. A "
                    "publish that times out may well have succeeded, and a retry double-posts. "
                    "neverError is on so the next node can read the status rather than the "
                    "run dying inside an HTTP node."))
v.append(code("publish-result", "read the publish result", [1740, -140],
              "read-the-publish-result.js"))

v.append(if_expr("posted", "did it publish?", [1960, -140], "={{ $json._posted }}"))
v.append(code("stop-failed", "STOP: publish failed", [2180, 60], "stop-publish-failed.js"))

v.append(code("bank-row", "mark the bank row posted", [2180, -240],
              "mark-the-bank-row-posted.js"))
v.append(sheet("write-bank", "[cred] Sheets - mark the bank row", [2400, -240], "bank_tab",
               "appendOrUpdate", ["Slug"],
               notes="Matches on 'Slug'. Rename that heading and this silently appends a new "
                     "row instead of updating - change BANK_COLUMNS.slug in config AND the "
                     "match field here."))
v.append(code("posted-row", "row for the published outcome", [2620, -240],
              "row-for-the-outcome.js"))

v.append(merge("merge-rows", "one log row", [2840, 60], inputs=2))
v.append(sheet("write-log2", "[cred] Sheets - append the log row", [3060, 60], "log_tab",
               "append", ["Date"]))

v.append(merge("merge-end2", "one outcome", [3280, 260], inputs=2))
v.append(code("summary2", "build the run summary", [3500, 260],
              "build-the-run-summary.js"))
v.append(if_expr("report2", "report configured?", [3720, 260],
                 "={{ %s.report_enabled }}" % CFG))
v.append(http("slack2", "[cred] Slack - post the summary", [3940, 160], "POST",
              "={{ %s.report_webhook_url }}" % CFG,
              body="={{ JSON.stringify($json._slack_body) }}",
              on_error="continueRegularOutput"))
v.append({"parameters": {}, "id": "done2", "name": "done",
          "type": "n8n-nodes-base.noOp", "typeVersion": 1, "position": [3940, 360]})

v.append(sticky("t1", [-1580, -180], 460, 300, 4, """## 2 of 2 — publish on approval

Polls the approval channel every five minutes. When a human replies `post` to the draft
message, this publishes it to the company page.

**Most runs do nothing**, and end at `STOP: nothing awaiting`. That is correct.

The gate is `read the approval reply`. Read that node before changing anything here — every
rule in it is a refusal, and each one is there because the looser version has an obvious
way to publish something nobody approved."""))

v.append(sticky("t2", [820, -420], 460, 240, 2, """### The irreversible step

Three calls: register the upload, PUT the bytes, publish.

**`publish the post` has retryOnFail OFF, on purpose.** A publish that times out may have
succeeded. Retrying it double-posts, and that cannot be undone from here.

An UNKNOWN outcome means look at the page with your own eyes before running this again."""))

connections2 = {
    "Run it now": main("config"),
    "Every 5 minutes": main("config"),
    "config": main("[cred] Sheets - read the log"),
    "[cred] Sheets - read the log": main("find the pending draft"),
    "find the pending draft": main("anything awaiting?"),
    "anything awaiting?": branch(["[cred] Discord - read the channel"],
                                 ["STOP: nothing awaiting"]),
    "STOP: nothing awaiting": to_input("one outcome", 1),
    "[cred] Discord - read the channel": main("read the approval reply"),
    "read the approval reply": main("what did they say?"),
    "what did they say?": outputs(["the approved draft"],
                                  ["row for the cancelled outcome"],
                                  ["STOP: still awaiting approval"]),
    "STOP: still awaiting approval": to_input("one outcome", 1),
    "row for the cancelled outcome": to_input("one log row", 1),
    "the approved draft": main("still the approved draft?"),
    "still the approved draft?": branch(["publish it?"],
                                        ["STOP: the approved draft changed"]),
    "STOP: the approved draft changed": to_input("one outcome", 1),
    "publish it?": branch(["[cred] LinkedIn - register the upload"],
                          ["STOP: not published"]),
    "STOP: not published": to_input("one outcome", 1),
    "[cred] LinkedIn - register the upload": main("download the approved image"),
    "download the approved image": main("[cred] LinkedIn - upload the image"),
    "[cred] LinkedIn - upload the image": main("[cred] LinkedIn - publish the post"),
    "[cred] LinkedIn - publish the post": main("read the publish result"),
    "read the publish result": main("did it publish?"),
    "did it publish?": branch(["mark the bank row posted"], ["STOP: publish failed"]),
    "STOP: publish failed": to_input("one outcome", 1),
    "mark the bank row posted": main("[cred] Sheets - mark the bank row"),
    "[cred] Sheets - mark the bank row": main("row for the published outcome"),
    "row for the published outcome": main("one log row"),
    "one log row": main("[cred] Sheets - append the log row"),
    "[cred] Sheets - append the log row": main("one outcome"),
    "one outcome": main("build the run summary"),
    "build the run summary": main("report configured?"),
    "report configured?": branch(["[cred] Slack - post the summary"], ["done"]),
}

p2, n2 = save('02-publish-on-approval.json', '02 publish on approval', v, connections2, TAGS)

print('%s  %d nodes' % (os.path.basename(p1), n1))
print('%s  %d nodes' % (os.path.basename(p2), n2))
