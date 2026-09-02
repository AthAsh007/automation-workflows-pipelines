# Builds ../workflow.json from js/*.js. Run: python build.py
import io, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'workflow.json')

def js(name):
    with io.open(os.path.join(HERE, 'js', name), encoding='utf-8') as f:
        return f.read().rstrip()

CFG = "$('config').first().json"

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

def if_bool(nid, name, pos, flag):
    return if_expr(nid, name, pos, "={{ %s.%s }}" % (CFG, flag))

def sticky(nid, pos, w, h, colour, content):
    return {"parameters": {"content": content, "height": h, "width": w, "color": colour},
            "id": nid, "name": "Sticky Note " + nid, "type": "n8n-nodes-base.stickyNote",
            "typeVersion": 1, "position": pos}

def sheet_rl(field, expr):
    return {"__rl": True, "mode": "id" if field == "documentId" else "name",
            "value": "={{ %s.%s }}" % (CFG, expr)}

nodes = []

nodes.append({"parameters": {}, "id": "trigger-manual", "name": "When clicking Test workflow",
    "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-1180, 180]})

nodes.append({"parameters": {"rule": {"interval": [{"field": "cronExpression",
        "expression": "0 9 * * 1-5"}]}},
    "id": "trigger-schedule", "name": "Weekdays 09:00",
    "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2, "position": [-1180, 380]})

nodes.append(code("cfg", "config", [-960, 280], "config.js"))

nodes.append({"parameters": {
        "documentId": sheet_rl("documentId", "lead_sheet_id"),
        "sheetName": sheet_rl("sheetName", "lead_sheet_tab"),
        "options": {}},
    "id": "sheets-read", "name": "[cred] Sheets - read lead tracker",
    "type": "n8n-nodes-base.googleSheets", "typeVersion": 4.5,
    "position": [-740, 280], "executeOnce": True})

nodes.append(code("pick-rows", "pick sendable rows", [-520, 280], "pick-sendable-rows.js"))

nodes.append(if_expr("any-to-send", "anything to send?", [-300, 280],
                     "={{ $json._nothing_to_send !== true }}"))
nodes.append(noop("stop-nothing", "STOP: nothing to send", [-80, 420]))

nodes.append(if_bool("gh-configured", "GitHub configured?", [-80, 180], "github_enabled"))
nodes.append(noop("stop-no-gh", "STOP: GitHub not configured", [140, 320]))

nodes.append({"parameters": {"batchSize": 1, "options": {"reset": False}},
    "id": "loop", "name": "Loop over leads",
    "type": "n8n-nodes-base.splitInBatches", "typeVersion": 3, "position": [160, 40]})

gh_auth_headers = [
    {"name": "Authorization", "value": "={{ %s.github_auth }}" % CFG},
    {"name": "X-GitHub-Api-Version", "value": "2022-11-28"},
    {"name": "User-Agent", "value": "acme-n8n-outreach"},
]

nodes.append({"parameters": {
        "url": ("={{ 'https://api.github.com/repos/' + %s.github_owner + '/' + %s.github_repo"
                " + '/contents/' + %s.github_path + '/' + encodeURIComponent($json.domain)"
                " + '?ref=' + encodeURIComponent(%s.github_branch) }}") % (CFG, CFG, CFG, CFG),
        "sendHeaders": True,
        "headerParameters": {"parameters":
            [{"name": "Accept", "value": "application/vnd.github+json"}] + gh_auth_headers},
        "options": {"timeout": 20000}},
    "id": "gh-list", "name": "[cred] GitHub - list deliverable files",
    "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
    "position": [400, 160], "onError": "continueRegularOutput"})

nodes.append(code("pick-files", "pick deliverable files", [620, 160], "pick-deliverable-files.js"))

nodes.append(if_expr("has-deliverables", "deliverables found?", [840, 160],
                     "={{ $json._has_deliverables || $json._has_custom_body }}"))

raw_headers = [{"name": "Accept", "value": "application/vnd.github.raw"}] + gh_auth_headers
text_opts = {"response": {"response": {"responseFormat": "text", "outputPropertyName": "data"}},
             "timeout": 20000}

nodes.append({"parameters": {"url": "={{ $json.notes_url }}", "sendHeaders": True,
        "headerParameters": {"parameters": raw_headers}, "options": text_opts},
    "id": "gh-notes", "name": "[cred] GitHub - get pitch notes",
    "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
    "position": [1060, 60], "onError": "continueRegularOutput"})

nodes.append({"parameters": {
        "url": "={{ $('pick deliverable files').first().json.seo_url }}", "sendHeaders": True,
        "headerParameters": {"parameters": raw_headers}, "options": text_opts},
    "id": "gh-seo", "name": "[cred] GitHub - get seo geo tip",
    "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
    "position": [1280, 60], "onError": "continueRegularOutput"})

nodes.append(code("build-email", "build email content", [1500, 60], "build-email-content.js"))
nodes.append(code("stop-nodeliv", "STOP: no deliverables in repo", [1060, 320],
                  "stop-no-deliverables.js"))

NL = "String.fromCharCode(10)"
user_msg = (
    "'Business: ' + $json.business + " + NL +
    " + 'Domain: ' + $json.domain + " + NL +
    " + 'Sector: ' + $json.type + " + NL +
    " + 'Our note on their current site: ' + $json._parsed.diagnosis + " + NL +
    " + 'Our pitch angle: ' + $json._parsed.pitch_angle + " + NL +
    " + 'Current subject: ' + $json.subject + " + NL +
    " + 'Current intro: ' + $json.intro"
)
system_msg = (
    "You rewrite the subject line and opening paragraph of an outreach email from a web "
    "design studio to a business whose site the studio has already redesigned on spec. "
    "Keep every fact exactly as given. Invent nothing. No links, no emoji, no exclamation "
    "marks, no superlatives. Subject under 70 characters and lower-key than a marketing "
    "headline. Intro is two or three plain sentences. Return JSON only."
)
schema = ("{ type: 'json_schema', json_schema: { name: 'email_opening', strict: true, schema: "
          "{ type: 'object', additionalProperties: false, required: ['subject','intro'], "
          "properties: { subject: { type: 'string' }, intro: { type: 'string' } } } } }")

llm_body = ("={{ JSON.stringify({ model: %s.llm_model, stream: false, max_tokens: 2000, "
            "temperature: 0.4, response_format: %s, messages: ["
            "{ role: 'system', content: '%s' }, "
            "{ role: 'user', content: %s } ] }) }}") % (CFG, schema, system_msg, user_msg)

nodes.append(if_expr("llm-configured", "AI polish configured?", [1720, 60],
                     "={{ %s.llm_enabled && $json._copy_source === 'built' }}" % CFG))

nodes.append({"parameters": {"method": "POST",
        "url": "={{ %s.llm_base_url }}/v1/chat/completions" % CFG,
        "sendHeaders": True,
        "headerParameters": {"parameters": [
            {"name": "Authorization", "value": "=Bearer {{ %s.llm_api_key }}" % CFG},
            {"name": "Content-Type", "value": "application/json"}]},
        "sendBody": True, "specifyBody": "json", "jsonBody": llm_body,
        "options": {"timeout": 60000}},
    "id": "llm-polish", "name": "[cred] LLM - polish subject and intro",
    "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
    "position": [1940, -60], "onError": "continueRegularOutput"})

nodes.append(code("apply-polish", "apply polish", [2160, -60], "apply-polish.js"))

nodes.append(if_expr("any-attachments", "any attachments?", [2340, 60],
                     "={{ ($json._attachments || []).length > 0 }}"))

nodes.append(code("split-attachments", "split attachments", [2560, -40], "split-attachments.js"))

nodes.append({"parameters": {"url": "={{ $json.url }}", "sendHeaders": True,
        "headerParameters": {"parameters": raw_headers},
        "options": {"response": {"response": {"responseFormat": "file",
                                              "outputPropertyName": "data"}},
                    "timeout": 60000}},
    "id": "gh-download", "name": "[cred] GitHub - download deliverable",
    "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
    "position": [2780, -40], "onError": "continueRegularOutput"})

# NO executeOnce here: it would hand this node only the first downloaded file, which
# is exactly how you end up emailing one attachment out of four.
nodes.append(code("collect-attachments", "collect attachments", [3000, -40],
                  "collect-attachments.js"))

nodes.append(code("stop-no-attach", "STOP: no attachments", [2560, 180],
                  "stop-no-attachments.js"))

nodes.append(if_bool("send-gate", "send this one?", [3220, 60], "send_enabled"))
nodes.append(code("stop-preview", "STOP: preview - not sent", [3440, -80], "stop-preview.js"))

nodes.append({"parameters": {
        "fromEmail": "={{ %s.from_header }}" % CFG,
        "toEmail": "={{ %s.test_send ? %s.test_email : $json.email }}" % (CFG, CFG),
        "subject": ("={{ %s.test_send ? ('[TEST -> ' + $json.email + '] ' + $json.subject)"
                    " : $json.subject }}") % CFG,
        "emailFormat": "both",
        "text": "={{ $json.text }}",
        "html": "={{ $json.html }}",
        "options": {"appendAttribution": False,
                    "attachments": "={{ $json._attachment_props }}",
                    "replyTo": "={{ %s.reply_to }}" % CFG,
                    "bccEmail": "={{ %s.test_send ? '' : %s.bcc_email }}" % (CFG, CFG)}},
    "id": "smtp-send", "name": "[cred] SMTP - send deliverables",
    "type": "n8n-nodes-base.emailSend", "typeVersion": 2.1, "position": [3440, 200]})

nodes.append(code("mark-sent", "mark sent", [3660, 200], "mark-sent.js"))

nodes.append(code("prep-update", "prepare sheet update", [3880, 280], "prepare-sheet-update.js"))
nodes.append(if_bool("write-back", "write back?", [4100, 280], "live_send"))
nodes.append(noop("stop-nowrite", "STOP: not live - no write", [4320, 420]))

nodes.append({"parameters": {
        "operation": "appendOrUpdate",
        "documentId": sheet_rl("documentId", "lead_sheet_id"),
        "sheetName": sheet_rl("sheetName", "lead_sheet_tab"),
        "columns": {"mappingMode": "autoMapInputData", "value": {},
                    "matchingColumns": ["#"], "schema": []},
        "options": {}},
    "id": "sheets-update", "name": "[cred] Sheets - update lead row",
    "type": "n8n-nodes-base.googleSheets", "typeVersion": 4.5, "position": [4320, 180]})

nodes.append(code("record-outcome", "record outcome", [4540, 280], "record-outcome.js"))

nodes.append(code("summary", "build run summary", [400, -140], "build-run-summary.js"))
nodes.append(if_bool("report-configured", "Report configured?", [620, -140], "report_enabled"))

nodes.append({"parameters": {"method": "POST",
        "url": "={{ %s.report_webhook_url }}" % CFG,
        "sendHeaders": True,
        "headerParameters": {"parameters": [{"name": "Content-Type", "value": "application/json"}]},
        "sendBody": True, "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ text: $json.text, content: $json.text }) }}",
        "options": {"timeout": 15000}},
    "id": "report-post", "name": "[cred] Post the run report",
    "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
    "position": [840, -220], "onError": "continueRegularOutput"})

nodes.append(noop("end", "End", [1060, -140]))

nodes.append(sticky("s1", [-1200, -180], 440, 400, 4,
    "## Start here\n\n"
    "**Everything you edit lives in the `config` node.** There are no environment\n"
    "variables in this workflow, so it runs on n8n Cloud unchanged.\n\n"
    "1. Open `config`. Fill in the sheet id, the GitHub token, and the from / reply-to\n"
    "   addresses.\n"
    "2. Attach credentials to the `[cred]` nodes: Google Sheets OAuth2 (read + update)\n"
    "   and SMTP.\n"
    "3. Run once with `DRY_RUN = true` and read **build run summary**.\n"
    "4. Only then set `DRY_RUN = false`.\n\n"
    "The config-node rule is written up in `GUIDELINES.md`."))

nodes.append(sticky("s2", [380, 380], 440, 280, 7,
    "## Deliverables come from GitHub\n\n"
    "Looks up `client-deliverables/<domain>` on the configured branch, where `<domain>`\n"
    "is derived from the sheet's **Website / Link** column.\n\n"
    "The email is built from two files in that folder:\n\n"
    "- `facelift-cro-and-pitch-notes.txt` - the design directions, the CRO diagnosis and\n"
    "  the pitch angle\n"
    "- `seo-geo-tip.txt` - the SEO and GEO findings\n\n"
    "No folder on that branch means no send; the row is flagged for the dev instead."))

nodes.append(sticky("s3", [3180, 380], 440, 320, 3,
    "## One switch: `TEST_RUN`\n\n"
    "Both live in `config`. `TEST_EMAIL` decides how far a test run goes.\n\n"
    "**`TEST_RUN = true`, `TEST_EMAIL` blank** (shipped) - PREVIEW. Nothing is sent\n"
    "and nothing is written. Every lead stops at **STOP: preview - not sent**\n"
    "carrying the finished `subject`, `html` and `text`. Open one and read it.\n\n"
    "**`TEST_RUN = true`, `TEST_EMAIL = you@...`** - TEST. The emails really send,\n"
    "but every one lands in your inbox instead of the lead's, subject-prefixed\n"
    "`[TEST -> the.real@address]`. BCC suppressed, sheet untouched, and only\n"
    "`TEST_BATCH` leads are mailed - 1 by default.\n\n"
    "**`TEST_RUN = false`** - LIVE. Real recipients, and the row is written back.\n\n"
    "Filling in `TEST_EMAIL` can only redirect a send, never cause one."))

nodes.append(sticky("s4", [3860, 500], 460, 300, 5,
    "## Write-back\n\n"
    "Matched on the **`#`** column. Rename that header and you must change it in two\n"
    "places: `config.COLUMNS.row_id` **and** this node's *Column to match on*.\n\n"
    "A sent row becomes **Task Progress = Completed**, **Contact Status = Contacted**.\n\n"
    "`Contact Status` is a dropdown, so `STATUS_AFTER_SEND` in `config` has to match one\n"
    "of its options exactly - same spelling and capitalisation, no stray space - or the\n"
    "sheet's data validation flags it, or refuses it outright.\n\n"
    "Columns this workflow is not deliberately changing are written back with the value\n"
    "that was read, so a partial mapping can never blank a cell."))

def main(*targets):
    return {"main": [[{"node": t, "type": "main", "index": 0} for t in targets]]}

def branch(true_targets, false_targets):
    return {"main": [
        [{"node": t, "type": "main", "index": 0} for t in true_targets],
        [{"node": t, "type": "main", "index": 0} for t in false_targets]]}

connections = {
    "When clicking Test workflow": main("config"),
    "Weekdays 09:00": main("config"),
    "config": main("[cred] Sheets - read lead tracker"),
    "[cred] Sheets - read lead tracker": main("pick sendable rows"),
    "pick sendable rows": main("anything to send?"),
    "anything to send?": branch(["GitHub configured?"], ["STOP: nothing to send"]),
    "GitHub configured?": branch(["Loop over leads"], ["STOP: GitHub not configured"]),
    "Loop over leads": branch(["build run summary"],
                              ["[cred] GitHub - list deliverable files"]),
    "[cred] GitHub - list deliverable files": main("pick deliverable files"),
    "pick deliverable files": main("deliverables found?"),
    "deliverables found?": branch(["[cred] GitHub - get pitch notes"],
                                  ["STOP: no deliverables in repo"]),
    "[cred] GitHub - get pitch notes": main("[cred] GitHub - get seo geo tip"),
    "[cred] GitHub - get seo geo tip": main("build email content"),
    "build email content": main("AI polish configured?"),
    "AI polish configured?": branch(["[cred] LLM - polish subject and intro"],
                                    ["any attachments?"]),
    "[cred] LLM - polish subject and intro": main("apply polish"),
    "apply polish": main("any attachments?"),
    "any attachments?": branch(["split attachments"], ["STOP: no attachments"]),
    "split attachments": main("[cred] GitHub - download deliverable"),
    "[cred] GitHub - download deliverable": main("collect attachments"),
    "collect attachments": main("send this one?"),
    "STOP: no attachments": main("send this one?"),
    "send this one?": branch(["[cred] SMTP - send deliverables"], ["STOP: preview - not sent"]),
    "STOP: preview - not sent": main("prepare sheet update"),
    "[cred] SMTP - send deliverables": main("mark sent"),
    "mark sent": main("prepare sheet update"),
    "STOP: no deliverables in repo": main("prepare sheet update"),
    "prepare sheet update": main("write back?"),
    "write back?": branch(["[cred] Sheets - update lead row"], ["STOP: not live - no write"]),
    "[cred] Sheets - update lead row": main("record outcome"),
    "STOP: not live - no write": main("record outcome"),
    "record outcome": main("Loop over leads"),
    "build run summary": main("Report configured?"),
    "Report configured?": branch(["[cred] Post the run report"], ["End"]),
    "[cred] Post the run report": main("End"),
}

workflow = {
    "name": "Acme - redesign deliverables outreach",
    "nodes": nodes,
    "connections": connections,
    "settings": {"executionOrder": "v1"},
    "pinData": {},
    "meta": {"templateCredsSetupCompleted": False},
    "tags": ["acme", "outreach"],
}

with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(workflow, f, indent=2, ensure_ascii=False)
    f.write('\n')

print('wrote', os.path.normpath(OUT), '-', len(nodes), 'nodes')
