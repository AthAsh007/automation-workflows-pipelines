# Builds the three workflow JSON files from js/*.js.
# Run: python build.py
import io, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..')
CFG = "$('config').first().json"

WF1 = '01-job-order-to-campaign'
WF2 = '02-outreach-runner'
WF3 = '03-inbound-and-qualify'


def js(name):
    with io.open(os.path.join(HERE, 'js', name), encoding='utf-8') as f:
        return f.read().rstrip()


# ---------------------------------------------------------------- node builders
def code(nid, name, pos, file, **kw):
    n = {"parameters": {"jsCode": js(file)}, "id": nid, "name": name,
         "type": "n8n-nodes-base.code", "typeVersion": 2, "position": pos}
    n.update(kw)
    return n


def noop(nid, name, pos):
    return {"parameters": {}, "id": nid, "name": name,
            "type": "n8n-nodes-base.noOp", "typeVersion": 1, "position": pos}


def if_expr(nid, name, pos, left):
    return {"parameters": {
        "conditions": {
            "options": {"caseSensitive": True, "leftValue": "",
                        "typeValidation": "loose", "version": 2},
            "conditions": [{"id": nid + "-c", "leftValue": left, "rightValue": "true",
                            "operator": {"type": "boolean", "operation": "true",
                                         "singleValue": True}}],
            "combinator": "and"},
        "looseTypeValidation": True, "options": {}},
        "id": nid, "name": name, "type": "n8n-nodes-base.if",
        "typeVersion": 2.2, "position": pos}


def if_flag(nid, name, pos, flag):
    return if_expr(nid, name, pos, "={{ %s.%s }}" % (CFG, flag))


def merge(nid, name, pos, inputs=2):
    return {"parameters": {"numberInputs": inputs},
            "id": nid, "name": name, "type": "n8n-nodes-base.merge",
            "typeVersion": 3, "position": pos}


def sticky(nid, pos, w, h, colour, content):
    return {"parameters": {"content": content, "height": h, "width": w, "color": colour},
            "id": nid, "name": "Sticky Note " + nid, "type": "n8n-nodes-base.stickyNote",
            "typeVersion": 1, "position": pos}


def http(nid, name, pos, method, url, headers=None, body=None, form=None,
         retry=True, note=None):
    """An HTTP node that never ends a run. `neverError` keeps 4xx/5xx as data so the Code
    node after it can classify the failure, which is the whole retry story."""
    params = {
        "method": method,
        "url": url,
        "options": {"response": {"response": {"neverError": True, "fullResponse": False}},
                    "timeout": 20000}
    }
    if headers:
        params["sendHeaders"] = True
        params["headerParameters"] = {"parameters": [
            {"name": k, "value": v} for k, v in headers]}
    if body is not None:
        params["sendBody"] = True
        params["specifyBody"] = "json"
        params["jsonBody"] = body
    if form is not None:
        params["sendBody"] = True
        params["contentType"] = "raw"
        params["rawContentType"] = "application/x-www-form-urlencoded"
        params["body"] = form
    n = {"parameters": params, "id": nid, "name": name,
         "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": pos,
         "onError": "continueRegularOutput", "alwaysOutputData": True}
    if retry:
        # Transport-level retry, for the connection reset and the 502. Business-level
        # retry (a Twilio 30001, a rate limit) is the backoff in `record the attempt`;
        # the two solve different problems and both are needed.
        n["retryOnFail"] = True
        n["maxTries"] = 3
        n["waitBetweenTries"] = 2000
    if note:
        n["notes"] = note
        n["notesInFlow"] = True
    return n


SUPA_HEADERS = [
    ("apikey", "={{ %s.supabase_key }}" % CFG),
    ("Authorization", "=Bearer {{ %s.supabase_key }}" % CFG),
    ("Content-Type", "application/json"),
]


def supa_rest(nid, name, pos, table, body, on_conflict=None, prefer=None, note=None):
    url = "={{ %s.supabase_url }}/rest/v1/%s" % (CFG, table)
    if on_conflict:
        url += "?on_conflict=" + on_conflict
    headers = list(SUPA_HEADERS) + [
        ("Prefer", prefer or "resolution=merge-duplicates,return=representation")]
    return http(nid, name, pos, "POST", url, headers=headers, body=body, note=note)


def supa_rpc(nid, name, pos, fn, body, note=None):
    return http(nid, name, pos, "POST",
                "={{ %s.supabase_url }}/rest/v1/rpc/%s" % (CFG, fn),
                headers=list(SUPA_HEADERS), body=body, note=note)


def main(*t):
    return {"main": [[{"node": x, "type": "main", "index": 0} for x in t]]}


def branch(yes, no):
    return {"main": [[{"node": x, "type": "main", "index": 0} for x in yes],
                     [{"node": x, "type": "main", "index": 0} for x in no]]}


def to_merge(name, index):
    return {"main": [[{"node": name, "type": "main", "index": index}]]}


def branch_merge(yes, no):
    """Each side is a list of (node_name, input_index) or a plain name (index 0)."""
    def side(items):
        out = []
        for it in items:
            if isinstance(it, tuple):
                out.append({"node": it[0], "type": "main", "index": it[1]})
            else:
                out.append({"node": it, "type": "main", "index": 0})
        return out
    return {"main": [side(yes), side(no)]}


def save(name, nodes, connections, tags):
    wf = {"name": name, "nodes": nodes, "connections": connections,
          "settings": {"executionOrder": "v1"}, "pinData": {},
          "meta": {"templateCredsSetupCompleted": False}, "tags": tags}
    path = os.path.join(OUT, name + '.json')
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
        f.write('\n')
    return path, len(nodes)


TAGS = ["meridian", "candidate-engine"]

# =====================================================================  WORKFLOW 1
w1 = []

w1.append({"parameters": {"httpMethod": "POST", "path": "meridian-job-order",
                          "responseMode": "lastNode", "options": {}},
           "id": "hook1", "name": "Job order created",
           "type": "n8n-nodes-base.webhook", "typeVersion": 2,
           "position": [-1500, 180], "webhookId": "meridian-job-order",
           "notes": "Point the ATS webhook subscription here. Bullhorn: Events API. "
                    "CEIPAL / Recruit CRM: their outbound webhook settings."})

w1.append({"parameters": {}, "id": "man1", "name": "Run it now",
           "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1,
           "position": [-1500, 380]})

w1.append(code("cfg1", "config", [-1280, 280], "config.js"))
w1.append(code("readjob", "read the job order", [-1060, 280], "read-the-job-order.js"))
w1.append(if_expr("usable", "job order usable?", [-840, 280], "={{ $json._job_usable }}"))
w1.append(code("stopjob", "STOP: job order not usable", [-620, 460], "stop-job-not-usable.js"))

w1.append(if_expr("aineed", "AI worth calling?", [-620, 180],
                  "={{ $json._ai_worth_calling }}"))
w1.append(http("aijob", "[cred] AI - read the job description", [-400, 60], "POST",
               "https://api.anthropic.com/v1/messages",
               headers=[("x-api-key", "={{ %s.ai_key }}" % CFG),
                        ("anthropic-version", "2023-06-01"),
                        ("Content-Type", "application/json")],
               body=("={{ JSON.stringify({ model: %s.ai_model, max_tokens: 1024, "
                     "output_config: { effort: %s.ai_effort }, "
                     "system: 'You extract hiring requirements from staffing job orders. "
                     "Reply with JSON only, no prose and no code fence, matching: "
                     "{\"required_skills\":[],\"nice_to_have\":[],\"certifications\":[],"
                     "\"shift\":\"\"}. Skills must be short lowercase noun phrases a "
                     "recruiter would search on (\"forklift\", \"osha 10\", \"rf scanner\") "
                     "- never sentences, never soft skills like \"team player\". At most ' "
                     "+ %s.ai_max_skills + ' required skills. If the description does not "
                     "state something, return an empty array rather than guessing.', "
                     "messages: [{ role: 'user', content: 'Job title: ' + $json.title + "
                     "'\\n\\nDescription:\\n' + $json.description }] }) }}"
                     % (CFG, CFG, CFG)),
               note="Runs ONCE PER JOB ORDER, not per candidate — a few hundred tokens per "
                    "campaign. It fills in blanks; it never decides who is contacted. Blank "
                    "AI_API_KEY skips it entirely and the keyword rules stand alone."))
w1.append(code("aiapply", "apply the AI requirements", [-180, 60],
               "apply-the-ai-requirements.js"))
w1.append(code("aioff", "STOP: keyword rules only", [-400, 280],
               "stop-keyword-rules-only.js"))
w1.append(merge("jobspec", "the job spec", [40, 180]))

w1.append(if_flag("atson", "ATS connected?", [260, 180], "ats_enabled"))
w1.append(http("atssearch", "[cred] ATS - search candidates", [-400, 80], "POST",
               "={{ %s.ats_base_url }}/search/Candidate" % CFG,
               headers=[("Authorization", "=Bearer {{ %s.ats_token }}" % CFG),
                        ("BhRestToken", "={{ %s.ats_token }}" % CFG),
                        ("Content-Type", "application/json")],
               body=("={{ JSON.stringify({ query: $json.required_skills.join(' OR ') || "
                     "$json.title, fields: Object.values(%s.ats_fields.candidate).join(','), "
                     "count: %s.ats_search_limit }) }}" % (CFG, CFG)),
               note="THE one node that changes per ATS vendor. Everything downstream reads "
                    "the normalised shape, so swapping Bullhorn for CEIPAL is this node and "
                    "the ATS_FIELDS map in config."))
w1.append(code("stoppool", "STOP: using the sample pool", [-400, 300], "stop-sample-pool.js"))
w1.append(merge("pool", "one candidate pool", [-180, 180]))

w1.append(code("normalise", "normalise the candidates", [40, 180], "normalise-the-candidates.js"))
w1.append(code("scorejob", "score against the job order", [260, 180],
               "score-against-the-job-order.js"))

w1.append(if_flag("supaon1", "Supabase connected?", [480, 180], "supabase_enabled"))
w1.append(supa_rpc("hist", "[cred] Supabase - engagement history", [700, 80],
                   "engagement_history",
                   "={{ JSON.stringify({ p_client_id: %s.client_id, p_ats_job_id: "
                   "$('the job spec').first().json.ats_job_id, p_phones: "
                   "$('score against the job order').all().map(i => i.json.phone_e164)"
                   ".filter(Boolean) }) }}" % CFG,
                   note="One call, not three. A half-populated suppression list is worse "
                        "than none, so opt-outs, recent touches and live enrollments come "
                        "back together or not at all."))
w1.append(code("readhist", "read the engagement history", [920, 80],
               "read-the-engagement-history.js"))
w1.append(code("stophist", "STOP: no engagement history", [700, 300],
               "stop-no-engagement-history.js"))
w1.append(merge("histm", "one engagement history", [1140, 180]))

w1.append(code("gate", "decide who gets contacted", [1360, 180],
               "decide-who-gets-contacted.js"))
w1.append(if_expr("anyone", "anyone to enroll?", [1580, 180], "={{ $json._has_enrollments }}"))
w1.append(code("stopnobody", "STOP: nobody eligible", [1800, 360], "stop-nobody-eligible.js"))

w1.append(code("rowsdb", "rows for supabase", [1800, 100], "rows-for-supabase.js"))
w1.append(if_expr("writedb", "writing to the database?", [2020, 100], "={{ $json._write }}"))
w1.append(code("stopprev1", "STOP: preview - nothing enrolled", [2240, 300],
               "stop-preview-not-enrolled.js"))

w1.append(supa_rest("upjob", "[cred] Supabase - upsert the job order", [2240, -20],
                    "job_orders", "={{ JSON.stringify([$json.job_order]) }}",
                    on_conflict="client_id,ats_job_id"))
w1.append(supa_rest("upcamp", "[cred] Supabase - upsert the campaign", [2460, -20],
                    "campaigns",
                    "={{ JSON.stringify([$('rows for supabase').first().json.campaign]) }}",
                    on_conflict="client_id,idempotency_key",
                    note="The unique index on (client_id, idempotency_key) is what makes an "
                         "ATS webhook delivered three times create one campaign."))
w1.append(supa_rest("upcand", "[cred] Supabase - upsert the candidates", [2680, -20],
                    "candidates",
                    "={{ JSON.stringify($('rows for supabase').first().json.candidates) }}",
                    on_conflict="client_id,ats_candidate_id"))
w1.append(code("link", "link the enrollments", [2900, -20], "link-the-enrollments.js"))
w1.append(supa_rest("upenr", "[cred] Supabase - insert the enrollments", [3120, -20],
                    "enrollments", "={{ JSON.stringify($json.enrollments) }}",
                    on_conflict="campaign_id,candidate_id",
                    prefer="resolution=ignore-duplicates,return=representation",
                    note="ignore-duplicates, not merge. Re-running a launch must never "
                         "reset somebody's step counter back to zero and text them again."))

w1.append(code("sum1", "build the launch summary", [3340, 100], "build-the-launch-summary.js"))
w1.append(if_flag("slack1", "summary configured?", [3560, 100], "slack_enabled"))
w1.append(http("post1", "Post the launch summary", [3780, 20], "POST",
               "={{ %s.slack_webhook_url }}" % CFG,
               headers=[("Content-Type", "application/json")],
               body="={{ JSON.stringify($json.slack_payload) }}"))
w1.append(noop("end1", "End", [4000, 140]))

w1.append(sticky("w1a", [-1560, -260], 520, 380, 4,
    "## 1 of 3 — a job order becomes a campaign\n\n"
    "The ATS posts a new job order here (or press **Run it now**). In order:\n\n"
    "1. the job is normalised through the **ATS_FIELDS** map — one map per vendor\n"
    "2. candidates are pulled and normalised: phones to E.164, duplicates collapsed\n"
    "3. everyone is scored against the job, transparently\n"
    "4. **the gate** — opt-outs, cooldowns, people already in another live campaign,\n"
    "   the score floor, and the per-run cap\n"
    "5. the survivors are enrolled with a first touch *scheduled*, not sent\n\n"
    "Nothing is sent from this workflow at all. Workflow 2 owns every outbound\n"
    "message, which is what keeps quiet hours and the daily cap in one place.\n\n"
    "Everything you edit is in the **config** node."))

w1.append(sticky("w1b", [1320, -180], 460, 280, 3,
    "## The gate\n\n"
    "Nobody is enrolled who does not pass every check, and every rejection is kept\n"
    "with the reason next to the name — so *\"why was this person not contacted\"*\n"
    "is as answerable as *\"why were they\"*.\n\n"
    "The order is deliberate. **Opt-out is checked before the score**, because an\n"
    "opted-out number is never reconsidered on the grounds that the job is a good\n"
    "fit for them."))

w1.append(sticky("w1c", [2200, 460], 500, 240, 5,
    "## Nothing is written until you say so\n\n"
    "`DEMO_MODE = true` (how it ships) runs the whole pipeline against the sample\n"
    "pool and writes nothing. Open **STOP: preview - nothing enrolled** to read the\n"
    "entire launch: who would be enrolled, in what order, with what score, and\n"
    "everyone held back and why.\n\n"
    "Set `DEMO_MODE = false` and fill in Supabase to persist a campaign. Even then\n"
    "no message is sent — that is workflow 2, and it has its own gate."))

# The AI branch was inserted mid-canvas. Shift everything downstream of it to the right so
# nothing overlaps. Layout only — no behaviour depends on a node's position.
_KEEP = {'Job order created', 'Run it now', 'config', 'read the job order',
         'job order usable?', 'STOP: job order not usable', 'AI worth calling?',
         '[cred] AI - read the job description', 'apply the AI requirements',
         'STOP: keyword rules only', 'the job spec', 'ATS connected?', 'Sticky Note w1a'}
for _n in w1:
    if _n['name'] not in _KEEP:
        _n['position'] = [_n['position'][0] + 880, _n['position'][1]]

c1 = {
    "Job order created": main("config"),
    "Run it now": main("config"),
    "config": main("read the job order"),
    "read the job order": main("job order usable?"),
    "job order usable?": branch(["AI worth calling?"], ["STOP: job order not usable"]),
    "STOP: job order not usable": main("End"),
    "AI worth calling?": branch(["[cred] AI - read the job description"],
                                ["STOP: keyword rules only"]),
    "[cred] AI - read the job description": main("apply the AI requirements"),
    "apply the AI requirements": to_merge("the job spec", 0),
    "STOP: keyword rules only": to_merge("the job spec", 1),
    "the job spec": main("ATS connected?"),
    "[cred] ATS - search candidates": to_merge("one candidate pool", 0),
    "STOP: using the sample pool": to_merge("one candidate pool", 1),
    "one candidate pool": main("normalise the candidates"),
    "normalise the candidates": main("score against the job order"),
    "score against the job order": main("Supabase connected?"),
    "Supabase connected?": branch(["[cred] Supabase - engagement history"],
                                  ["STOP: no engagement history"]),
    "[cred] Supabase - engagement history": main("read the engagement history"),
    "read the engagement history": to_merge("one engagement history", 0),
    "STOP: no engagement history": to_merge("one engagement history", 1),
    "one engagement history": main("decide who gets contacted"),
    "decide who gets contacted": main("anyone to enroll?"),
    "anyone to enroll?": branch(["rows for supabase"], ["STOP: nobody eligible"]),
    "STOP: nobody eligible": main("End"),
    "rows for supabase": main("writing to the database?"),
    "writing to the database?": branch(["[cred] Supabase - upsert the job order"],
                                       ["STOP: preview - nothing enrolled"]),
    "STOP: preview - nothing enrolled": main("build the launch summary"),
    "[cred] Supabase - upsert the job order": main("[cred] Supabase - upsert the campaign"),
    "[cred] Supabase - upsert the campaign": main("[cred] Supabase - upsert the candidates"),
    "[cred] Supabase - upsert the candidates": main("link the enrollments"),
    "link the enrollments": main("[cred] Supabase - insert the enrollments"),
    "[cred] Supabase - insert the enrollments": main("build the launch summary"),
    "build the launch summary": main("summary configured?"),
    "summary configured?": branch(["Post the launch summary"], ["End"]),
    "Post the launch summary": main("End"),
}
# The ATS branch wires straight into the merge; fix the true side to the HTTP node.
c1["ATS connected?"] = branch(["[cred] ATS - search candidates"],
                              ["STOP: using the sample pool"])

# =====================================================================  WORKFLOW 2
w2 = []

w2.append({"parameters": {"rule": {"interval": [{"field": "minutes", "minutesInterval": 15}]}},
           "id": "sched2", "name": "Every 15 minutes",
           "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2,
           "position": [-1500, 180]})
w2.append({"parameters": {}, "id": "man2", "name": "Run it now",
           "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1,
           "position": [-1500, 380]})

w2.append(code("cfg2", "config", [-1280, 280], "config.js"))
w2.append(if_flag("supaon2", "Supabase connected?", [-1060, 280], "supabase_enabled"))
w2.append(supa_rpc("claim", "[cred] Supabase - claim the due queue", [-840, 180],
                   "claim_due_attempts",
                   "={{ JSON.stringify({ p_client_id: %s.client_id, p_limit: "
                   "%s.runner_batch_size, p_lease_seconds: %s.lease_seconds }) }}"
                   % (CFG, CFG, CFG),
                   note="SELECT ... FOR UPDATE SKIP LOCKED behind an RPC. Ten runners take "
                        "ten disjoint batches; two overlapping schedules cannot claim the "
                        "same enrollment. This is why the runner is safe to run every 15 min."))
w2.append(code("stopq", "STOP: using the sample due queue", [-840, 400],
               "stop-sample-due-queue.js"))
w2.append(merge("dueq", "one due queue", [-620, 280]))

w2.append(code("decide", "decide the next touch", [-400, 280], "decide-the-next-touch.js"))
w2.append(if_expr("haswork", "anything to send?", [-180, 280], "={{ $json._has_work }}"))
w2.append(code("stopdue", "STOP: nothing due", [40, 480], "stop-nothing-due.js"))

w2.append(if_flag("sending", "sending?", [40, 200], "send_enabled"))
w2.append(code("stopprev2", "STOP: preview - nothing sent", [260, 400],
               "stop-preview-nothing-sent.js"))

w2.append(if_expr("chan", "SMS or voice?", [260, 120], "={{ $json.channel === 'sms' }}"))

w2.append(if_flag("twon", "Twilio connected?", [480, 20], "twilio_enabled"))
w2.append(http("twsend", "[cred] Twilio - send the SMS", [700, -60], "POST",
               "=https://api.twilio.com/2010-04-01/Accounts/{{ %s.twilio_sid }}/Messages.json"
               % CFG,
               headers=[("Authorization",
                         "={{ 'Basic ' + (%s.twilio_sid + ':' + %s.twilio_token).base64Encode() }}"
                         % (CFG, CFG))],
               form=("={{ (() => { const c = %s; const p = [['To', $json.to], "
                     "['Body', $json.body]]; if (c.twilio_messaging_sid) "
                     "p.push(['MessagingServiceSid', c.twilio_messaging_sid]); else "
                     "p.push(['From', c.twilio_from]); if (c.twilio_status_callback) "
                     "p.push(['StatusCallback', c.twilio_status_callback]); return p.map("
                     "x => encodeURIComponent(x[0]) + '=' + encodeURIComponent(x[1]))"
                     ".join('&'); })() }}" % CFG),
               note="MessagingServiceSid when one is set, From otherwise — never both. "
                    "StatusCallback points at workflow 3, which is how a delivery failure "
                    "hours later still reaches the attempt row."))
w2.append(code("twread", "read the Twilio result", [920, -60], "read-the-twilio-result.js"))
w2.append(code("twoff", "STOP: Twilio not configured", [700, 120],
               "stop-provider-not-configured.js"))

w2.append(if_flag("reton", "Retell connected?", [480, 260], "retell_enabled"))
w2.append(http("retsend", "[cred] Retell - start the call", [700, 340], "POST",
               "https://api.retellai.com/v2/create-phone-call",
               headers=[("Authorization", "=Bearer {{ %s.retell_key }}" % CFG),
                        ("Content-Type", "application/json")],
               body=("={{ JSON.stringify({ from_number: %s.retell_from, to_number: $json.to, "
                     "override_agent_id: %s.retell_agent, retell_llm_dynamic_variables: "
                     "$json.retell_vars, metadata: { enrollment_id: $json.enrollment_id, "
                     "candidate_id: $json.candidate_id, campaign_id: $json.campaign_id, "
                     "step: $json.step, idempotency_key: $json.idempotency_key } }) }}"
                     % (CFG, CFG)),
               note="`metadata` is the important part. Retell echoes it verbatim on the "
                    "call_analyzed webhook, which is how workflow 3 links a finished call "
                    "back to an enrollment without guessing from the phone number."))
w2.append(code("retread", "read the Retell result", [920, 340], "read-the-retell-result.js"))
w2.append(code("retoff", "STOP: Retell not configured", [700, 520],
               "stop-provider-not-configured.js"))

w2.append(merge("sendm", "one send result", [1140, 140]))
w2.append(code("record", "record the attempt", [1360, 140], "record-the-attempt.js"))
w2.append(if_expr("persist2", "persisting?", [1580, 140], "={{ $json._write }}"))
w2.append(code("nopersist2", "STOP: not persisted", [1800, 340], "stop-not-persisted.js"))

w2.append(supa_rest("wattempts", "[cred] Supabase - write the attempts", [1800, 140],
                    "contact_attempts", "={{ JSON.stringify($json.attempts) }}",
                    on_conflict="client_id,idempotency_key",
                    prefer="resolution=ignore-duplicates,return=minimal",
                    note="ignore-duplicates. A conflict here means another execution already "
                         "sent this exact touch — that is the guarantee working, not an error."))
w2.append(supa_rest("wenr", "[cred] Supabase - advance the enrollments", [2020, 140],
                    "enrollments",
                    "={{ JSON.stringify($('record the attempt').first().json.enrollment_updates) }}",
                    on_conflict="id", prefer="resolution=merge-duplicates,return=minimal"))
w2.append(supa_rest("wopt", "[cred] Supabase - record carrier opt-outs", [2240, 140],
                    "opt_outs",
                    "={{ JSON.stringify($('record the attempt').first().json.opt_outs) }}",
                    on_conflict="client_id,phone_e164,channel",
                    prefer="resolution=ignore-duplicates,return=minimal",
                    note="Twilio 21610 means the carrier has them on ITS stop list and our "
                         "webhook never saw the STOP. This is the only place we learn about "
                         "it, so it has to become a real opt-out here."))

w2.append(code("sum2", "build the runner summary", [2460, 140], "build-the-runner-summary.js"))
w2.append(if_expr("post2", "worth posting?", [2680, 140], "={{ $json._post }}"))
w2.append(http("slack2", "Post the runner summary", [2900, 60], "POST",
               "={{ %s.slack_webhook_url }}" % CFG,
               headers=[("Content-Type", "application/json")],
               body="={{ JSON.stringify($json.slack_payload) }}"))
w2.append(noop("end2", "End", [3120, 180]))

w2.append(sticky("w2a", [-1560, -280], 520, 400, 4,
    "## 2 of 3 — the outreach runner\n\n"
    "Every fifteen minutes. Claims a batch of due enrollments from the database,\n"
    "walks each one up the ladder, and sends exactly one touch per person.\n\n"
    "**The queue is a database view, not logic in here.** Opted-out numbers, people\n"
    "already being worked by another campaign, leased rows and terminal enrollments\n"
    "never come back from `v_due_attempts` at all — a rule in Postgres cannot be\n"
    "skipped by an n8n branch that did not run.\n\n"
    "**Quiet hours are the candidate's, not yours.** 09:00 in New York is 06:00 in\n"
    "Los Angeles, and TCPA does not care which office set the schedule. Rows outside\n"
    "the window are rescheduled, never dropped."))

w2.append(sticky("w2b", [420, 620], 520, 300, 6,
    "## Retries, in three rules\n\n"
    "**sent** → advance a rung, schedule the next touch at the ladder's delay\n\n"
    "**transient** (a 502, a rate limit, a timeout) → stay on this rung, come back\n"
    "with exponential backoff *and jitter*. Without jitter, 300 enrollments that\n"
    "failed on one Twilio blip all retry in the same second and fail together again.\n\n"
    "**permanent** (21211 bad number, 30003 unreachable, 21610 opted out) → stop.\n"
    "Retrying these costs money and manufactures a fake \"attempted 6 times\".\n\n"
    "The list of permanent codes is `PERMANENT_SMS_ERRORS` in **config**."))

w2.append(sticky("w2c", [1320, -180], 480, 260, 3,
    "## Why a candidate is never texted twice\n\n"
    "The idempotency key — `sha(enrollment | channel | step)` — is computed in\n"
    "**decide the next touch**, *before* the send, and the unique index on\n"
    "`contact_attempts` rejects a second insert with the same key.\n\n"
    "So if n8n dies between Twilio accepting the message and the row being written,\n"
    "the next run recomputes the same key, the insert conflicts, and nothing is sent.\n"
    "A retry is safe by construction rather than by being careful."))

c2 = {
    "Every 15 minutes": main("config"),
    "Run it now": main("config"),
    "config": main("Supabase connected?"),
    "Supabase connected?": branch(["[cred] Supabase - claim the due queue"],
                                  ["STOP: using the sample due queue"]),
    "[cred] Supabase - claim the due queue": to_merge("one due queue", 0),
    "STOP: using the sample due queue": to_merge("one due queue", 1),
    "one due queue": main("decide the next touch"),
    "decide the next touch": main("anything to send?"),
    "anything to send?": branch(["sending?"], ["STOP: nothing due"]),
    "STOP: nothing due": main("record the attempt"),
    "sending?": branch(["SMS or voice?"], ["STOP: preview - nothing sent"]),
    "STOP: preview - nothing sent": main("build the runner summary"),
    "SMS or voice?": branch(["Twilio connected?"], ["Retell connected?"]),
    "Twilio connected?": branch(["[cred] Twilio - send the SMS"],
                                ["STOP: Twilio not configured"]),
    "[cred] Twilio - send the SMS": main("read the Twilio result"),
    "read the Twilio result": to_merge("one send result", 0),
    "STOP: Twilio not configured": to_merge("one send result", 0),
    "Retell connected?": branch(["[cred] Retell - start the call"],
                                ["STOP: Retell not configured"]),
    "[cred] Retell - start the call": main("read the Retell result"),
    "read the Retell result": to_merge("one send result", 1),
    "STOP: Retell not configured": to_merge("one send result", 1),
    "one send result": main("record the attempt"),
    "record the attempt": main("persisting?"),
    "persisting?": branch(["[cred] Supabase - write the attempts"],
                          ["STOP: not persisted"]),
    "STOP: not persisted": main("build the runner summary"),
    "[cred] Supabase - write the attempts": main("[cred] Supabase - advance the enrollments"),
    "[cred] Supabase - advance the enrollments": main("[cred] Supabase - record carrier opt-outs"),
    "[cred] Supabase - record carrier opt-outs": main("build the runner summary"),
    "build the runner summary": main("worth posting?"),
    "worth posting?": branch(["Post the runner summary"], ["End"]),
    "Post the runner summary": main("End"),
}

# =====================================================================  WORKFLOW 3
w3 = []

w3.append({"parameters": {"httpMethod": "POST", "path": "meridian-inbound",
                          "responseMode": "responseNode", "options": {"rawBody": False}},
           "id": "hook3", "name": "Inbound webhook",
           "type": "n8n-nodes-base.webhook", "typeVersion": 2,
           "position": [-1600, 280], "webhookId": "meridian-inbound",
           "notes": "One endpoint for three things: Twilio inbound SMS, Twilio status "
                    "callbacks, and the Retell call_analyzed webhook. Put this URL in both "
                    "consoles and in TWILIO_STATUS_CALLBACK in config."})

w3.append(code("cfg3", "config", [-1380, 280], "config.js"))
w3.append(code("verify", "verify the signature", [-1160, 280], "verify-the-signature.js"))
w3.append(if_expr("sigok", "signature ok?", [-940, 280], "={{ $json._allow }}"))
w3.append(code("stopsig", "STOP: signature rejected", [-720, 480],
               "stop-signature-rejected.js"))

w3.append(code("readev", "read the event", [-720, 180], "read-the-event.js"))
w3.append(if_expr("action", "actionable?", [-500, 180],
                  "={{ $json._understood && $json._stop_sequence === true }}"))
w3.append(code("stopign", "STOP: event ignored", [-280, 380], "stop-event-ignored.js"))

w3.append(if_expr("optout", "opted out?", [-280, 80], "={{ $json.intent === 'opt_out' }}"))
w3.append(code("dooptout", "handle the opt-out", [-60, -80], "handle-the-opt-out.js"))
w3.append(if_flag("db3", "database connected?", [160, -80], "supabase_enabled"))
w3.append(code("nooptout", "STOP: opt-out not persisted", [380, -240],
               "stop-optout-not-persisted.js"))
w3.append(supa_rpc("stopall", "[cred] Supabase - stop all outreach", [380, -80],
                   "stop_all_outreach", "={{ JSON.stringify($json.rpc) }}",
                   note="One transaction. The number goes on the opt-out list AND every "
                        "enrollment for it in every campaign has next_attempt_at set to "
                        "null. There is no window where the opt-out is recorded but a text "
                        "is still queued."))

w3.append(code("qualify", "qualify the candidate", [-60, 180], "qualify-the-candidate.js"))
w3.append(if_expr("isqual", "qualified?", [160, 180], "={{ $json._qualified }}"))
w3.append(code("stopnq", "STOP: not qualified", [380, 380], "stop-not-qualified.js"))

w3.append(code("slot", "pick the recruiter and slot", [380, 100],
               "pick-the-recruiter-and-slot.js"))
w3.append(if_expr("canbook", "can we book?", [600, 100],
                  "={{ %s.calendar_enabled && %s.writeback_enabled && "
                  "!$json._recruiter_missing }}" % (CFG, CFG)))
w3.append({"parameters": {
    "calendar": {"__rl": True, "mode": "id", "value": "={{ $json.booking.calendar_id }}"},
    "start": "={{ $json.booking.starts_at }}",
    "end": "={{ $json.booking.ends_at }}",
    "additionalFields": {
        "summary": "={{ $json.booking.summary }}",
        "description": "={{ $json.booking.description }}",
        "attendees": "={{ $json.booking.attendees }}",
        "sendUpdates": "all"}},
    "id": "gcal", "name": "[cred] Google Calendar - book the interview",
    "type": "n8n-nodes-base.googleCalendar", "typeVersion": 1.3,
    "position": [820, 20], "onError": "continueRegularOutput", "alwaysOutputData": True,
    "notes": "The one n8n credential this engine needs, besides Gmail. Everything else "
             "lives in the config node."})
w3.append(supa_rest("appt", "[cred] Supabase - record the appointment", [1040, 20],
                    "appointments",
                    "={{ JSON.stringify([{ client_id: %s.client_id, enrollment_id: "
                    "$('read the event').first().json.enrollment_id, candidate_id: "
                    "$('read the event').first().json.candidate_id, recruiter_email: "
                    "$('pick the recruiter and slot').first().json.booking.recruiter_email, "
                    "calendar_provider: %s.calendar_provider, calendar_event_id: $json.id "
                    "|| null, starts_at: $('pick the recruiter and slot').first().json"
                    ".booking.starts_at, ends_at: $('pick the recruiter and slot').first()"
                    ".json.booking.ends_at, status: 'booked' }]) }}" % (CFG, CFG),
                    on_conflict="enrollment_id,starts_at"))
w3.append(code("stopnb", "STOP: qualified - not booked", [820, 240], "stop-not-booked.js"))
w3.append(merge("outm", "one outcome", [1260, 180]))

w3.append(code("wbpay", "the write-back payload", [1480, 180], "the-writeback-payload.js"))
w3.append(if_expr("dowb", "writing back?", [1700, 180], "={{ $json._write }}"))
w3.append(supa_rest("qwb", "[cred] Supabase - queue the write-back", [1920, 80],
                    "ats_writebacks", "={{ JSON.stringify($json.writebacks) }}",
                    on_conflict="client_id,idempotency_key",
                    prefer="resolution=ignore-duplicates,return=representation",
                    note="Queued BEFORE it is attempted. A Bullhorn outage then delays a "
                         "note instead of losing it, and a retry sweep drains the table."))
w3.append(http("atsnote", "[cred] ATS - add the note", [2140, 80], "POST",
               "={{ %s.ats_base_url }}/entity/Note" % CFG,
               headers=[("Authorization", "=Bearer {{ %s.ats_token }}" % CFG),
                        ("BhRestToken", "={{ %s.ats_token }}" % CFG),
                        ("Content-Type", "application/json")],
               body=("={{ JSON.stringify(Object.assign({ personReference: { id: "
                     "$('the write-back payload').first().json.ats_candidate_id } }, "
                     "$('the write-back payload').first().json.writebacks[0].payload)) }}"),
               note="Vendor-shaped, like the search node. The note TEXT is built in "
                    "`the write-back payload` so swapping ATS never changes what is said."))
w3.append(code("stopwb", "STOP: write-back skipped", [1920, 320], "stop-writeback-skipped.js"))

w3.append(if_flag("tellslack", "tell the recruiter?", [2360, 180], "slack_enabled"))
w3.append(http("slack3", "Post the recruiter alert", [2580, 80], "POST",
               "={{ %s.slack_webhook_url }}" % CFG,
               headers=[("Content-Type", "application/json")],
               body="={{ JSON.stringify($('the write-back payload').first().json.slack_payload) }}"))
w3.append(if_expr("tellmail", "email the recruiter?", [2800, 180],
                  "={{ %s.notify_recruiter_email && %s.writeback_enabled && "
                  "!!$('the write-back payload').first().json.booking.recruiter_email }}"
                  % (CFG, CFG)))
w3.append({"parameters": {
    "sendTo": "={{ $('the write-back payload').first().json.booking.recruiter_email }}",
    "subject": "={{ $('the write-back payload').first().json.recruiter_email_subject }}",
    "emailType": "text",
    "message": "={{ $('the write-back payload').first().json.recruiter_email_body }}",
    "options": {"appendAttribution": False}},
    "id": "gmail3", "name": "[cred] Gmail - tell the recruiter",
    "type": "n8n-nodes-base.gmail", "typeVersion": 2.1, "position": [3020, 80],
    "onError": "continueRegularOutput"})

w3.append(if_flag("dolog", "logging the event?", [3240, 200], "supabase_enabled"))
w3.append(supa_rest("logev", "[cred] Supabase - log the event", [3460, 100],
                    "inbound_events",
                    "={{ JSON.stringify([{ client_id: %s.client_id, source: "
                    "$('read the event').first().json.source, event_type: "
                    "$('read the event').first().json.event_type, from_number: "
                    "$('read the event').first().json.from_number, body: "
                    "$('read the event').first().json.body_text, intent: "
                    "$('read the event').first().json.intent, provider_event_id: "
                    "$('read the event').first().json.provider_event_id, payload: "
                    "$('read the event').first().json._raw }]) }}" % CFG,
                    on_conflict="client_id,source,provider_event_id",
                    prefer="resolution=ignore-duplicates,return=minimal",
                    note="Every event is logged, including the ones nothing was done about. "
                         "The unique key is the provider's own event id, so Twilio and "
                         "Retell retrying a webhook writes one row."))

w3.append(code("resp", "the webhook response", [3680, 260], "the-webhook-response.js"))
w3.append({"parameters": {"respondWith": "text",
                          "responseBody": "={{ $json.body }}",
                          "options": {"responseCode": "={{ $json._http_status }}",
                                      "responseHeaders": {"entries": [
                                          {"name": "Content-Type",
                                           "value": "={{ $json._content_type }}"}]}}},
           "id": "respond3", "name": "Respond to the provider",
           "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1,
           "position": [3900, 260]})

# The yellow "start here" note n8n's template guidelines ask for: one main note,
# in the default yellow, explaining the workflow and how to set it up. It sits
# above the green section note, so it is the first thing on the canvas.
w3.append(sticky("w3s", [-1660, -980], 540, 620, 1,
    "## Inbound & qualify — start here\n\n"
    "The third of three workflows. Import it alongside\n"
    "`01-job-order-to-campaign` and `02-outreach-runner` — all three share the\n"
    "same **config** node and the same Supabase schema.\n\n"
    "**Run it before you configure anything.** `bash sample/test-webhooks.sh`\n"
    "fires six events into this webhook — six runs, each ending at a named\n"
    "node. No credentials, no Supabase project, nothing leaving the building.\n\n"
    "**Setup, in order**\n"
    "1. `supabase/schema.sql`, then `supabase/seed.sql`.\n"
    "2. **config** — `CLIENT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.\n"
    "3. This workflow's **production** URL into the Twilio console and the Retell\n"
    "   dashboard, and the same value into `TWILIO_STATUS_CALLBACK` — Twilio\n"
    "   signs the exact public URL it posted to, so behind a proxy it never matches.\n"
    "4. Credentials on the `[cred]` nodes: Google Calendar, Gmail, Slack.\n"
    "5. `DEMO_MODE = false` **and** `TEST_RUN = false` — only then may a run\n"
    "   write to a client's ATS or a recruiter's real calendar."))

w3.append(sticky("w3a", [-1660, -320], 540, 420, 4,
    "## 3 of 3 — inbound, qualification, booking, write-back\n\n"
    "One public endpoint, three kinds of event: a candidate's SMS reply, a Twilio\n"
    "delivery receipt, and Retell's `call_analyzed` webhook.\n\n"
    "**It is signed, and it fails closed.** This URL can opt a candidate out and\n"
    "write into the client's ATS, so an unsigned request is refused — and a *missing*\n"
    "secret is refused too, not trusted. Only preview mode lets a curl through.\n\n"
    "**Any inbound message stops the sequence**, whatever it says. Someone who wrote\n"
    "back is a conversation, and a robot texting over the top of a human reply is the\n"
    "most visible way this kind of system embarrasses an agency."))

w3.append(sticky("w3b", [-120, 500], 500, 300, 3,
    "## Opt-out is one database call\n\n"
    "`stop_all_outreach(client_id, phone)` — in a single transaction the number goes\n"
    "on the opt-out list **and** every enrollment for that number, in every campaign,\n"
    "has `next_attempt_at` set to null.\n\n"
    "Not four calls that could half-succeed. There is no window in which the opt-out\n"
    "is recorded but a text is still sitting in the queue.\n\n"
    "It is keyed on the **phone**, not the candidate — one human with three ATS\n"
    "records opts out once."))

w3.append(sticky("w3c", [340, -320], 520, 300, 6,
    "## The AI fills in the blanks. It does not decide.\n\n"
    "Retell is asked structured questions and returns typed answers. **This node**\n"
    "computes pass/fail from `QUALIFY` in the config node — so changing the bar is a\n"
    "config edit rather than a prompt rewrite, and a decision from last quarter can\n"
    "be re-explained against the rules in force at the time.\n\n"
    "**null never passes.** A question the agent could not establish is not an\n"
    "assumed yes — it routes to `needs_review`, which a human sees, rather than to a\n"
    "silent rejection."))

c3 = {
    "Inbound webhook": main("config"),
    "config": main("verify the signature"),
    "verify the signature": main("signature ok?"),
    "signature ok?": branch(["read the event"], ["STOP: signature rejected"]),
    "STOP: signature rejected": main("the webhook response"),
    "read the event": main("actionable?"),
    "actionable?": branch(["opted out?"], ["STOP: event ignored"]),
    "STOP: event ignored": main("logging the event?"),
    "opted out?": branch(["handle the opt-out"], ["qualify the candidate"]),
    "handle the opt-out": main("database connected?"),
    "database connected?": branch(["[cred] Supabase - stop all outreach"],
                                  ["STOP: opt-out not persisted"]),
    "[cred] Supabase - stop all outreach": main("logging the event?"),
    "STOP: opt-out not persisted": main("logging the event?"),
    "qualify the candidate": main("qualified?"),
    "qualified?": branch(["pick the recruiter and slot"], ["STOP: not qualified"]),
    "STOP: not qualified": to_merge("one outcome", 1),
    "pick the recruiter and slot": main("can we book?"),
    "can we book?": branch(["[cred] Google Calendar - book the interview"],
                           ["STOP: qualified - not booked"]),
    "[cred] Google Calendar - book the interview":
        main("[cred] Supabase - record the appointment"),
    "[cred] Supabase - record the appointment": to_merge("one outcome", 0),
    "STOP: qualified - not booked": to_merge("one outcome", 1),
    "one outcome": main("the write-back payload"),
    "the write-back payload": main("writing back?"),
    "writing back?": branch(["[cred] Supabase - queue the write-back"],
                            ["STOP: write-back skipped"]),
    "[cred] Supabase - queue the write-back": main("[cred] ATS - add the note"),
    "[cred] ATS - add the note": main("tell the recruiter?"),
    "STOP: write-back skipped": main("tell the recruiter?"),
    "tell the recruiter?": branch(["Post the recruiter alert"], ["email the recruiter?"]),
    "Post the recruiter alert": main("email the recruiter?"),
    "email the recruiter?": branch(["[cred] Gmail - tell the recruiter"],
                                   ["logging the event?"]),
    "[cred] Gmail - tell the recruiter": main("logging the event?"),
    "logging the event?": branch(["[cred] Supabase - log the event"],
                                 ["the webhook response"]),
    "[cred] Supabase - log the event": main("the webhook response"),
    "the webhook response": main("Respond to the provider"),
}

p1, n1 = save(WF1, w1, c1, TAGS)
p2, n2 = save(WF2, w2, c2, TAGS)
p3, n3 = save(WF3, w3, c3, TAGS)

for p, n in ((p1, n1), (p2, n2), (p3, n3)):
    print('wrote %-34s %d nodes' % (os.path.basename(p), n))
