# Builds ../01-activity-guard.json and ../02-recruitment-reporting.json from js/*.js
# Run: python build.py
#
# The two workflows share a config node, a Pipedrive read and the PHI check, all generated
# from the same source files. A stage renamed in js/config.js changes both workflows, which
# is the only way the guard and the report can be guaranteed to mean the same thing by
# "Referral Partner".
import io, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..')
CFG = "$('config').first().json"

JOB_URL = 'https://example.com/jobs/~022093811915701331307/'


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
    # Rejoins the two halves of an IF into one run. Without it the summary node sees only
    # the branch that happened to fire and reports half a run as a whole one.
    return {"parameters": {"mode": "append", "numberInputs": 2},
            "id": nid, "name": name, "type": "n8n-nodes-base.merge",
            "typeVersion": 3, "position": pos}


def sticky(nid, pos, w, h, colour, content):
    return {"parameters": {"content": content, "height": h, "width": w, "color": colour},
            "id": nid, "name": "Sticky Note " + nid, "type": "n8n-nodes-base.stickyNote",
            "typeVersion": 1, "position": pos}


def http(nid, name, pos, method, url, headers=None, query=None, body=None, timeout=30000,
         notes=None, always=False):
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
         # A Pipedrive call that rate-limits or times out must not end the run. 'read the
         # pipeline' turns a missing answer into a named failure and refuses to report an
         # empty pipeline as a fully covered one.
         "onError": "continueRegularOutput", "retryOnFail": True, "maxTries": 2,
         "waitBetweenTries": 2000}
    if always:
        n["alwaysOutputData"] = True
    if notes:
        n["notes"] = notes
    return n


def sheet_append(nid, name, pos, tab, notes=None):
    params = {
        "operation": "append",
        "documentId": {"__rl": True, "mode": "id", "value": "={{ %s.sheet_id }}" % CFG},
        "sheetName": {"__rl": True, "mode": "name", "value": "={{ %s.%s }}" % (CFG, tab)},
        "columns": {"mappingMode": "autoMapInputData", "value": {},
                    "matchingColumns": [], "schema": []},
        # RAW, not USER_ENTERED. Let Sheets reinterpret "not captured" or a date and the
        # next run reads back something it cannot compare against what it wrote.
        "options": {"cellFormat": "RAW"}}
    n = {"parameters": params, "id": nid, "name": name,
         "type": "n8n-nodes-base.googleSheets", "typeVersion": 4.5, "position": pos}
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
    path = os.path.join(OUT, name + '.json')
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
        f.write('\n')
    return path, len([n for n in nodes if n['type'] != 'n8n-nodes-base.stickyNote'])


# ===================================================================  SHARED FRONT HALF
# config -> three Pipedrive reads (or the demo pipeline) -> one normalised item -> the PHI
# check -> one item per open deal carrying its coverage verdict. Identical in both files.

ACTIVITIES_SINCE = ("={{ new Date(Date.now() - (%s.reengage_after_days + 90) * 86400000)"
                    ".toISOString().slice(0,10) }}" % CFG)


def front_half(schedule_id, schedule_name, cron):
    w = []
    w.append({"parameters": {}, "id": "manual", "name": "Run it now",
              "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1,
              "position": [-1720, 180]})
    w.append({"parameters": {"rule": {"interval": [{"field": "cronExpression",
                  "expression": cron}]}},
              "id": schedule_id, "name": schedule_name,
              "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2,
              "position": [-1720, 380]})

    w.append(code("cfg", "config", [-1500, 280], "config.js"))
    w.append(if_expr("pd-on", "Pipedrive configured?", [-1280, 280],
                     "={{ %s.pipedrive_enabled }}" % CFG))

    w.append(http("deals", "[cred] Pipedrive - open deals", [-1060, 140], "GET",
                  "={{ %s.base_url }}/deals" % CFG,
                  query=[("api_token", "={{ %s.api_token }}" % CFG),
                         ("status", "open"),
                         ("limit", "500")],
                  always=True,
                  notes="Pipedrive v1 GET /deals. Over 500 open deals: add a pagination "
                        "loop on 'start' — additional_data.pagination.more_items_in_"
                        "collection says when there is another page."))
    w.append(http("acts", "[cred] Pipedrive - activities", [-840, 140], "GET",
                  "={{ %s.base_url }}/activities" % CFG,
                  query=[("api_token", "={{ %s.api_token }}" % CFG),
                         ("user_id", "0"),
                         ("start_date", ACTIVITIES_SINCE),
                         ("limit", "500")],
                  always=True,
                  notes="user_id=0 means every user, not 'no user'. The lookback is derived "
                        "from REENGAGE_AFTER_DAYS so a partner cannot go quiet outside the "
                        "window the workflow can see."))
    w.append(http("fields", "[cred] Pipedrive - deal fields", [-620, 140], "GET",
                  "={{ %s.base_url }}/dealFields" % CFG,
                  query=[("api_token", "={{ %s.api_token }}" % CFG),
                         ("limit", "500")],
                  always=True,
                  notes="Field NAMES, which is what the PHI check reads. A custom field's "
                        "40-character key says nothing about what is in it."))
    w.append(code("read", "read the pipeline", [-400, 140], "read-the-pipeline.js"))
    w.append(code("demo", "STOP: demo pipeline", [-1060, 420], "stop-demo-pipeline.js"))
    w.append(merge("merge-pipe", "one pipeline", [-180, 280]))
    w.append(code("phi", "check the PHI boundary", [40, 280], "check-the-phi-boundary.js"))
    w.append(code("verdict", "check every deal for a next activity", [260, 280],
                  "check-every-deal-for-a-next-activity.js"))
    return w


FRONT_CONNECTIONS = {
    "Run it now": main("config"),
    "config": main("Pipedrive configured?"),
    "Pipedrive configured?": branch(["[cred] Pipedrive - open deals"],
                                    ["STOP: demo pipeline"]),
    "[cred] Pipedrive - open deals": main("[cred] Pipedrive - activities"),
    "[cred] Pipedrive - activities": main("[cred] Pipedrive - deal fields"),
    "[cred] Pipedrive - deal fields": main("read the pipeline"),
    "read the pipeline": main("one pipeline"),
    "STOP: demo pipeline": to_input("one pipeline", 1),
    "one pipeline": main("check the PHI boundary"),
    "check the PHI boundary": main("check every deal for a next activity"),
}

SHARED_STICKIES = [
    sticky("phi", [-60, 460], 600, 320, 3,
        "## The compliance requirement, enforced\n\n"
        "> *Do not create fields for identifiable patient medical information, diagnoses,\n"
        "> medications, screening responses, medical records or other patient PHI.*\n\n"
        "**check the PHI boundary** reads every deal field's *name* and does two different\n"
        "things with what it finds:\n\n"
        "- a CRM field that looks like patient data is **blocked and reported** — it is not\n"
        "  this workflow's doing, but nothing here will read it\n"
        "- this workflow being **configured** to read one is a hard stop. The run fails with\n"
        "  the field named, because a misconfiguration that quietly copies a diagnosis into a\n"
        "  dashboard is the exact failure the requirement exists to prevent\n\n"
        "Aggregate recruitment counts are in scope and pass through untouched. A number of\n"
        "patients is not a patient."),
    sticky("demo", [-1120, 620], 560, 260, 5,
        "## It runs before you have an account\n\n"
        "`API_TOKEN` blank and `DEMO_PIPELINE = true` (how it ships) builds a deterministic\n"
        "fake pipeline — eight stages, twenty-four deals, a realistic spread of covered,\n"
        "uncovered, parked, overdue and stalled — and runs the whole rule against it.\n\n"
        "The run is **forced into preview** while that is on. A fabricated deal cannot\n"
        "produce a real Pipedrive write, whatever `TEST_RUN` says.\n\n"
        "Put a real `COMPANY_DOMAIN` and `API_TOKEN` in `config` and the same nodes read the\n"
        "real account. Nothing downstream changes."),
]


# ===================================================================  01 ACTIVITY GUARD
w = front_half("sched", "Every weekday, 07:00", "0 7 * * 1-5")

w.append(if_expr("uncovered", "anything uncovered?", [480, 280], "={{ $json._has_gaps }}"))
w.append(code("clean", "STOP: every open deal is covered", [700, 480],
              "stop-every-deal-is-covered.js"))
w.append(code("decide", "decide the next activity", [700, 180],
              "decide-the-next-activity.js"))

w.append(if_expr("write-on", "creating this activity?", [920, 180], "={{ $json._create }}"))
w.append(http("create", "[cred] Pipedrive - create the next activity", [1140, 80], "POST",
              "={{ %s.base_url }}/activities?api_token={{ %s.api_token }}" % (CFG, CFG),
              headers=[("Content-Type", "application/json")],
              body="={{ JSON.stringify($json._body) }}",
              notes="Pipedrive v1 POST /activities. The body is built in 'decide the next "
                    "activity' so it is readable without opening this node."))
w.append(code("recorded", "record what was created", [1360, 80],
              "record-what-was-created.js"))
w.append(code("not-created", "STOP: not created", [1140, 320], "stop-not-created.js"))
w.append(merge("merge-done", "what happened", [1580, 180]))

w.append(code("summary", "build the run summary", [1800, 280], "build-the-run-summary.js"))

w.append(if_expr("alert-on", "alert configured?", [2020, 160],
                 "={{ %s.alert_enabled }}" % CFG))
w.append(http("alert", "Post the run summary", [2240, 60], "POST",
              "={{ %s.alert_webhook_url }}" % CFG,
              headers=[("Content-Type", "application/json")],
              body="={{ JSON.stringify($json._alert_body) }}", timeout=15000,
              notes="Slack incoming webhook shape. Any endpoint that accepts JSON works."))
w.append(noop("no-alert", "STOP: no alert webhook", [2240, 260]))

w.append(if_expr("esc-on", "escalations to send?", [2020, 460],
                 "={{ $json._has_escalations && %s.manager_enabled }}" % CFG))
w.append(code("escalation", "build the escalation", [2240, 420], "build-the-escalation.js"))
w.append(http("post-esc", "Post the management escalation", [2460, 420], "POST",
              "={{ %s.manager_url }}" % CFG,
              headers=[("Content-Type", "application/json")],
              body="={{ JSON.stringify($json._escalation_body) }}", timeout=15000,
              notes="MANAGER_WEBHOOK_URL if set, otherwise ALERT_WEBHOOK_URL. Managers and "
                    "reps get different messages on purpose."))
w.append(noop("no-esc", "STOP: nothing to escalate", [2240, 620]))
w.append(noop("end", "End", [2700, 280]))

w.append(sticky("a", [-1780, -320], 640, 420, 4,
    "## Pipedrive referral network — 1 of 2: the activity guard\n\n"
    "**The job:** " + JOB_URL + "\n\n"
    "Trialbridge, a clinical-trial patient recruitment company, building a physician\n"
    "referral network in Pipedrive.\n\n"
    "One line of their brief is the whole reason this workflow exists:\n\n"
    "> **NO OPEN OPPORTUNITY SHOULD EXIST WITHOUT A NEXT ACTIVITY.**\n\n"
    "Pipedrive's own automations fire on an *event* — a stage change, a deal created. They\n"
    "cannot answer *\"which deals have nothing scheduled right now\"*, because that is a\n"
    "question about absence, and nothing happens when nothing happens.\n\n"
    "This runs every weekday morning, asks that question of every open deal, and schedules\n"
    "the activity the deal's stage calls for. Workflow 02 is the report that proves it.\n\n"
    "Everything you edit is in the **config** node. No environment variables, so it runs on\n"
    "n8n Cloud unchanged."))

w.append(sticky("b", [460, 620], 620, 300, 6,
    "## The horizon is the whole rule\n\n"
    "A deal is covered when it has an activity that is **not done** and **due within\n"
    "`HORIZON_DAYS`**.\n\n"
    "Drop the second half and the rule is trivially satisfied by a task parked eleven\n"
    "months out. Coverage reads 100%, the pipeline rots, and the report is worse than\n"
    "useless because it is confidently wrong.\n\n"
    "With the horizon, a parked task reads as **uncovered** — which is the truth, and is\n"
    "what `STOP: not created` will show you in preview."))

w.append(sticky("c", [1100, 620], 640, 320, 6,
    "## Overdue is escalated, never stacked\n\n"
    "A deal whose next activity is already overdue does **not** get a second activity piled\n"
    "on top of the one the rep is already not doing. That is how a rep ends up with sixty\n"
    "open tasks and stops reading any of them, at which point the rule is enforced on paper\n"
    "and nowhere else.\n\n"
    "It goes to the manager instead, in a separate message from the rep-facing summary.\n\n"
    "`DAILY_CAP` is enforced in **decide the next activity**, worst-first: if the cap bites,\n"
    "it bites on the deals that have been quiet the shortest."))

w.append(sticky("d", [2200, -180], 600, 280, 3,
    "## Nothing is written until you say so\n\n"
    "`TEST_RUN = true` with a blank `TEST_OWNER_ID` (how it ships) runs the entire rule and\n"
    "writes nothing. Open **STOP: not created** to read every activity it would have\n"
    "created: the deal, the stage, the subject, the due date and the sentence explaining\n"
    "why.\n\n"
    "That list is the deliverable of a first run. Disagree with three of them, change the\n"
    "stage rules in `config`, run it again.\n\n"
    "`TEST_OWNER_ID` set -> activities are really created but all assigned to that one user.\n"
    "`TEST_RUN = false` goes live and assigns to each deal's own owner."))

for s in SHARED_STICKIES:
    w.append(s)

c = dict(FRONT_CONNECTIONS)
c["Every weekday, 07:00"] = main("config")
c.update({
    "check every deal for a next activity": main("anything uncovered?"),
    "anything uncovered?": branch(["decide the next activity"],
                                  ["STOP: every open deal is covered"]),
    "STOP: every open deal is covered": main("build the run summary"),
    "decide the next activity": main("creating this activity?"),
    "creating this activity?": branch(["[cred] Pipedrive - create the next activity"],
                                      ["STOP: not created"]),
    "[cred] Pipedrive - create the next activity": main("record what was created"),
    "record what was created": main("what happened"),
    "STOP: not created": to_input("what happened", 1),
    "what happened": main("build the run summary"),
    "build the run summary": main("alert configured?", "escalations to send?"),
    "alert configured?": branch(["Post the run summary"], ["STOP: no alert webhook"]),
    "Post the run summary": main("End"),
    "STOP: no alert webhook": main("End"),
    "escalations to send?": branch(["build the escalation"], ["STOP: nothing to escalate"]),
    "build the escalation": main("Post the management escalation"),
    "Post the management escalation": main("End"),
    "STOP: nothing to escalate": main("End"),
})

path, n = save("01-activity-guard", w, c, ["pipedrive", "crm", "activity-guard"])
print('wrote %s (%d nodes)' % (os.path.basename(path), n))


# ===============================================================  02 RECRUITMENT REPORTING
w = front_half("sched", "Every Monday, 08:00", "0 8 * * 1")

w.append(code("kpis", "compute the KPIs", [480, 280], "compute-the-kpis.js"))
w.append(if_expr("sheet-on", "writing the dashboard?", [700, 280],
                 "={{ %s.sheet_enabled }}" % CFG))

w.append(code("dash-rows", "rows for the dashboard", [920, 160], "rows-for-the-dashboard.js"))
w.append(sheet_append("w-dash", "[cred] Sheets - append the dashboard row", [1140, 160],
                      "dashboard_tab",
                      notes="One row per run. The tab's own history is the trend — there is "
                            "no 'previous value' column to keep in step."))
w.append(code("gap-rows", "rows for the gaps tab", [1360, 160], "rows-for-the-gaps-tab.js"))
w.append(sheet_append("w-gaps", "[cred] Sheets - write the gaps", [1580, 160], "gaps_tab",
                      notes="'Active deals without future activities' from their scope item "
                            "6. Written on every run, including clean ones — an empty tab "
                            "that was written today is a result; one that was never written "
                            "is a broken workflow."))
w.append(code("rep-rows", "rows for the by rep tab", [1800, 160],
              "rows-for-the-by-rep-tab.js"))
w.append(sheet_append("w-rep", "[cred] Sheets - write by rep", [2020, 160], "by_rep_tab"))
w.append(code("prac-rows", "rows for the by practice tab", [2240, 160],
              "rows-for-the-by-practice-tab.js"))
w.append(sheet_append("w-prac", "[cred] Sheets - write by practice", [2460, 160],
                      "by_practice_tab",
                      notes="Aggregate counts only. This tab is why the PHI check upstream "
                            "exists."))
w.append(code("no-sheet", "STOP: no sheet", [920, 440], "stop-no-sheet.js"))
w.append(merge("merge-report", "reported", [2680, 280]))

w.append(code("report", "build the management report", [2900, 280],
              "build-the-management-report.js"))
w.append(if_expr("rep-on", "report webhook configured?", [3120, 280],
                 "={{ %s.manager_enabled }}" % CFG))
w.append(http("post-report", "Post the management report", [3340, 180], "POST",
              "={{ %s.manager_url }}" % CFG,
              headers=[("Content-Type", "application/json")],
              body="={{ JSON.stringify($json._report_body) }}", timeout=15000,
              notes="MANAGER_WEBHOOK_URL if set, otherwise ALERT_WEBHOOK_URL."))
w.append(noop("no-report", "STOP: no report webhook", [3340, 380]))
w.append(noop("end", "End", [3560, 280]))

w.append(sticky("a", [-1780, -320], 640, 420, 4,
    "## Pipedrive referral network — 2 of 2: the management dashboard\n\n"
    "**The job:** " + JOB_URL + "\n\n"
    "Their scope item 6 lists fifteen numbers a manager wants to see. Pipedrive Insights\n"
    "gives you most of them one object at a time.\n\n"
    "What it cannot give you is the **recruitment funnel**, because that spans deals,\n"
    "activities and a set of aggregate custom fields at once:\n\n"
    "    outreach -> conversation -> meeting -> referral partner\n"
    "             -> referrals -> pre-screen -> site -> screened -> randomised\n\n"
    "That funnel, plus 'active deals without future activities', is this workflow. It reads\n"
    "the same pipeline the guard does, through the same PHI check, and writes four tabs a\n"
    "manager can open on a Monday.\n\n"
    "Runs weekly by default. `REPORT_WINDOW_DAYS` is the period."))

w.append(sticky("b", [860, 560], 640, 300, 3,
    "## \"Not captured\" is not zero\n\n"
    "Every recruitment number here comes from a Pipedrive custom field listed in\n"
    "`RESULT_FIELDS`. When that key is blank, the number is written as the literal string\n"
    "**not captured** — never as `0`, never as an empty cell.\n\n"
    "A zero means the practice referred nobody. A blank means nobody wired the field up.\n"
    "They are different facts and they lead to different meetings, and printing the second\n"
    "as the first is how a dashboard loses a manager in week two.\n\n"
    "The digest repeats the list at the bottom, labelled as setup tasks."))

w.append(sticky("c", [2600, 560], 600, 280, 6,
    "## The rule and the report are one build\n\n"
    "Workflow 01 enforces *no open opportunity without a next activity*. This one measures\n"
    "whether that is actually true, from the same read, on the same definitions.\n\n"
    "A rule without its measurement is a hope. A measurement computed from a second,\n"
    "slightly different definition of \"next activity\" is worse — it disagrees with the\n"
    "guard and nobody can tell which one is wrong.\n\n"
    "Both files share `config`, `read the pipeline` and `check every deal for a next\n"
    "activity`, generated from the same sources by `build/build.py`."))

for s in SHARED_STICKIES:
    w.append(s)

c = dict(FRONT_CONNECTIONS)
c["Every Monday, 08:00"] = main("config")
c.update({
    "check every deal for a next activity": main("compute the KPIs"),
    "compute the KPIs": main("writing the dashboard?"),
    "writing the dashboard?": branch(["rows for the dashboard"], ["STOP: no sheet"]),
    "rows for the dashboard": main("[cred] Sheets - append the dashboard row"),
    "[cred] Sheets - append the dashboard row": main("rows for the gaps tab"),
    "rows for the gaps tab": main("[cred] Sheets - write the gaps"),
    "[cred] Sheets - write the gaps": main("rows for the by rep tab"),
    "rows for the by rep tab": main("[cred] Sheets - write by rep"),
    "[cred] Sheets - write by rep": main("rows for the by practice tab"),
    "rows for the by practice tab": main("[cred] Sheets - write by practice"),
    "[cred] Sheets - write by practice": main("reported"),
    "STOP: no sheet": to_input("reported", 1),
    "reported": main("build the management report"),
    "build the management report": main("report webhook configured?"),
    "report webhook configured?": branch(["Post the management report"],
                                         ["STOP: no report webhook"]),
    "Post the management report": main("End"),
    "STOP: no report webhook": main("End"),
})

path, n = save("02-recruitment-reporting", w, c, ["pipedrive", "crm", "reporting"])
print('wrote %s (%d nodes)' % (os.path.basename(path), n))


# ===================================================================  THE SHEET
# Generated from the config node's column names, so the tabs and the workflows can never
# disagree about a heading.
import csv, subprocess

SHEET_DIR = os.path.join(OUT, 'sheet')
os.makedirs(SHEET_DIR, exist_ok=True)

meta = json.loads(subprocess.run(
    ['node', '-e',
     'const c=new Function(require("fs").readFileSync("js/config.js","utf8"))()[0].json;'
     'process.stdout.write(JSON.stringify({dash:c.dashboard_columns,gaps:c.gap_columns,'
     'rep:c.by_rep_columns,prac:c.by_practice_columns,stages:c.stages.map(s=>s.name),'
     'types:Object.values(c.activity_types)}))'],
    cwd=HERE, capture_output=True, text=True, check=True).stdout)

DASH_ORDER = ['run_at', 'open_deals', 'covered', 'gaps', 'coverage_pct', 'overdue',
              'outreach_attempts', 'conversations', 'meetings', 'new_partners',
              'active_partners', 'referrals_sent', 'prescreen_qualified', 'sent_to_site',
              'screened', 'randomized', 'referral_to_screen', 'screen_to_random',
              'stalled', 'high_priority']
GAP_ORDER = ['deal_id', 'deal', 'organisation', 'person', 'stage', 'owner', 'value',
             'last_activity', 'days_quiet', 'action', 'run_at']
REP_ORDER = ['rep', 'open_deals', 'gaps', 'overdue', 'outreach_attempts', 'conversations',
             'meetings', 'new_partners', 'referrals_sent', 'run_at']
PRAC_ORDER = ['organisation', 'stage', 'owner', 'referrals_sent', 'prescreen_qualified',
              'sent_to_site', 'screened', 'randomized', 'last_referral', 'run_at']


def write_csv(name, rows):
    with io.open(os.path.join(SHEET_DIR, name), 'w', encoding='utf-8-sig', newline='') as f:
        csv.writer(f, lineterminator='\r\n').writerows(rows)
    return name


write_csv('Dashboard.csv', [[meta['dash'][k] for k in DASH_ORDER]])
write_csv('Gaps.csv', [[meta['gaps'][k] for k in GAP_ORDER]])
write_csv('By rep.csv', [[meta['rep'][k] for k in REP_ORDER]])
write_csv('By practice.csv', [[meta['prac'][k] for k in PRAC_ORDER]])

lists = [['Stage', 'Activity type']]
cols = [meta['stages'], meta['types']]
for i in range(max(len(x) for x in cols)):
    lists.append([col[i] if i < len(col) else '' for col in cols])
write_csv('Lists.csv', lists)

print('wrote sheet/Dashboard.csv (%d columns), sheet/Gaps.csv (%d), sheet/By rep.csv (%d), '
      'sheet/By practice.csv (%d), sheet/Lists.csv'
      % (len(DASH_ORDER), len(GAP_ORDER), len(REP_ORDER), len(PRAC_ORDER)))
