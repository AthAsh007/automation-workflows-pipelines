# Builds ../01-pitch-and-send.json and ../02-replies-and-reporting.json from js/*.js
# Run: python build.py
#
# The two workflows share a config node generated from one file. The sender and the reply
# handler have to agree about which field holds a pitch id and what counts as a booked deal,
# and the only way to guarantee that is for there to be one source for both.
import io, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..')
CFG = "$('config').first().json"

JOB_URL = 'https://example.com/jobs/~022093291467589751915/'

AIRTABLE = "={{ %s.airtable_url }}/{{ %s.airtable_base }}" % (CFG, CFG)


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
         # A provider that 402s, rate-limits or times out must not end the run. The node
         # after each of these treats a missing answer as a named failure, never as a
         # successful empty result.
         "onError": "continueRegularOutput", "retryOnFail": True, "maxTries": 2,
         "waitBetweenTries": 2000}
    if always:
        n["alwaysOutputData"] = True
    if notes:
        n["notes"] = notes
    return n


def airtable(nid, name, pos, table_key, method='GET', body=None, notes=None):
    url = AIRTABLE + "/{{ %s.%s }}" % (CFG, table_key)
    return http(nid, name, pos, method, url,
                headers=[("Authorization", "={{ 'Bearer ' + %s.airtable_key }}" % CFG),
                         ("Content-Type", "application/json")],
                query=[("pageSize", "100")] if method == 'GET' else None,
                body=body, always=(method == 'GET'), notes=notes)


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


# =====================================================================  01 PITCH AND SEND
w = []
w.append({"parameters": {}, "id": "manual", "name": "Run it now",
          "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-1940, 180]})
w.append({"parameters": {"rule": {"interval": [{"field": "cronExpression",
              "expression": "0 8 * * 1-5"}]}},
          "id": "sched", "name": "Every weekday, 08:00",
          "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2,
          "position": [-1940, 380]})

w.append(code("cfg", "config", [-1720, 280], "config.js"))
w.append(if_expr("at-on", "Airtable configured?", [-1500, 280],
                 "={{ %s.airtable_enabled }}" % CFG))

w.append(airtable("students", "[cred] Airtable - students", [-1280, 140],
                  "students_table",
                  notes="One row per creator. Only rows whose Status is in "
                        "ACTIVE_STUDENT_STATES are pitched for."))
w.append(airtable("brands", "[cred] Airtable - brand targets", [-1060, 140],
                  "brands_table",
                  notes="Over 100 targets: add an offset loop. Airtable returns an 'offset' "
                        "when there is another page."))
w.append(airtable("inboxes", "[cred] Airtable - inboxes", [-840, 140], "inboxes_table",
                  notes="Sending accounts and their health. This table is what the "
                        "deliverability gate reads; keep it fed from your sending platform."))
w.append(airtable("pitchlog", "[cred] Airtable - the pitch log", [-620, 140],
                  "pitches_table",
                  notes="Read for the dedupe. A pitch logged late is a pitch sent twice."))
w.append(code("roster", "read the roster", [-400, 140], "read-the-roster.js"))
w.append(code("demo", "STOP: demo roster", [-1280, 440], "stop-demo-roster.js"))
w.append(merge("merge-roster", "one roster", [-180, 280]))

w.append(code("match", "match brands to students", [40, 280],
              "match-brands-to-students.js"))
w.append(if_expr("work", "anything to pitch?", [260, 280], "={{ $json._has_work }}"))
w.append(code("nowork", "STOP: nothing to pitch", [480, 500], "stop-nothing-to-pitch.js"))

w.append(code("pitch", "build the pitch", [480, 200], "build-the-pitch.js"))
w.append(if_expr("writer", "writer configured?", [700, 200], "={{ $json._needs_writer }}"))
w.append(http("ai", "AI - write the pitch", [920, 100], "POST",
              "={{ %s.ai_url }}" % CFG,
              headers=[("x-api-key", "={{ %s.ai_api_key }}" % CFG),
                       ("anthropic-version", "2023-06-01"),
                       ("content-type", "application/json")],
              body=("={{ JSON.stringify({ model: %s.ai_model, max_tokens: 700,"
                    " system: $json._ai_system,"
                    " messages: [{ role: 'user', content: $json._ai_user }] }) }}") % CFG,
              notes="Anthropic Messages API. The prompt is assembled in 'build the pitch' so "
                    "it is readable without opening this body. The model is given FACTS and "
                    "told not to add any — it never sees a blank slate."))
w.append(code("apply", "apply the written pitch", [1140, 100],
              "apply-the-written-pitch.js"))
w.append(code("nowriter", "STOP: no writer", [920, 340], "stop-no-writer.js"))
w.append(merge("merge-pitch", "one list of pitches", [1360, 200]))

w.append(code("audit", "audit the pitch", [1580, 200], "audit-the-pitch.js"))
w.append(code("inbox", "assign a healthy inbox", [1800, 200], "assign-a-healthy-inbox.js"))

w.append(if_expr("send-on", "sending this one?", [2020, 200], "={{ $json._send }}"))
w.append(code("payload", "payload for the campaign", [2240, 100],
              "payload-for-the-campaign.js"))
w.append(http("send", "[cred] Instantly - add to the campaign", [2460, 100], "POST",
              "={{ %s.send_url }}" % CFG,
              headers=[("Authorization", "={{ 'Bearer ' + %s.send_api_key }}" % CFG),
                       ("Content-Type", "application/json")],
              body="={{ JSON.stringify($json._body) }}",
              notes="Instantly v2 POST /leads. For Smartlead, change SEND_URL in config and "
                    "the body in 'payload for the campaign'. Nothing else moves."))
w.append(code("sent", "record what was sent", [2680, 100], "record-what-was-sent.js"))
w.append(code("notsent", "STOP: not sent", [2240, 340], "stop-not-sent.js"))
w.append(merge("merge-sent", "what happened", [2900, 200]))

w.append(if_expr("log-on", "logging the pitches?", [3120, 200],
                 "={{ %s.log_enabled }}" % CFG))
w.append(code("logrows", "rows for the pitch log", [3340, 100],
              "rows-for-the-pitch-log.js"))
w.append(airtable("logwrite", "[cred] Airtable - log the pitches", [3560, 100],
                  "pitches_table", method='POST',
                  body="={{ JSON.stringify($json._body) }}",
                  notes="Ten records per request, which is Airtable's maximum. typecast is "
                        "on so a new hold reason creates the select option instead of 422ing "
                        "the whole batch."))
w.append(code("logok", "confirm the log", [3780, 100], "confirm-the-log.js"))
w.append(code("nolog", "STOP: not logged", [3340, 340], "stop-not-logged.js"))
w.append(merge("merge-log", "logged", [4000, 200]))

w.append(code("summary", "build the run summary", [4220, 280], "build-the-run-summary.js"))
w.append(if_expr("alert-on", "alert configured?", [4440, 280],
                 "={{ %s.alert_enabled }}" % CFG))
w.append(http("alert", "Post the run summary", [4660, 180], "POST",
              "={{ %s.alert_webhook_url }}" % CFG,
              headers=[("Content-Type", "application/json")],
              body="={{ JSON.stringify($json._alert_body) }}", timeout=15000,
              notes="Slack incoming webhook shape. Any endpoint that accepts JSON works."))
w.append(noop("noalert", "STOP: no alert webhook", [4660, 380]))
w.append(noop("end", "End", [4880, 280]))

w.append(sticky("a", [-2000, -360], 660, 440, 4,
    "## Brand deal outreach — 1 of 2: write, gate, send, log\n\n"
    "**The job:** " + JOB_URL + "\n\n"
    "Northbeam, a done-for-you programme landing paid brand deals for creators. The post\n"
    "hires a **person** to send 10,000+ pitches a month by hand, and rules out anyone who\n"
    "\"wants to build automations\".\n\n"
    "This is not an application to that post. It is the engine the post describes, built,\n"
    "because their three hard gates are unusually good specifications:\n\n"
    "> **Proven at volume** — 10,000+ pitches/month without quality dropping.\n"
    "> **Deliverability literate** — warmup, domain health, spam are second nature.\n"
    "> **Sharp written English** — pitches read human and personal from line one.\n"
    "> Never templated.\n\n"
    "Gates two and three are the interesting ones, because both are usually claimed and\n"
    "neither is usually checkable. Here they are both **enforced in code, before a send**.\n\n"
    "Everything you edit is in the **config** node. No environment variables."))

w.append(sticky("b", [1520, 460], 640, 340, 3,
    "## The personalisation gate\n\n"
    "Facts are assembled **in code** from the brand and creator records. The model is handed\n"
    "that list and told to add nothing to it. Then **audit the pitch** checks five things:\n\n"
    "- at least `MIN_FACTS` specific details, **at least one about the brand**\n"
    "- nothing from `BANNED_PHRASES` — the template tells\n"
    "- inside `MIN_WORDS`..`MAX_WORDS`\n"
    "- a real recipient: not a role mailbox, not suppressed\n"
    "- **every number in the body traces back to a record**\n\n"
    "That last one is the sharp end. A model that rounds 84,000 followers up to \"nearly\n"
    "100k\" has fabricated a media kit, and the creator's name is on it.\n\n"
    "A brand record too thin to say anything true produces **fewer facts, not a vaguer\n"
    "sentence**. It is held. That is the difference between personalisation and mail-merge."))

w.append(sticky("c", [1740, -300], 620, 320, 3,
    "## The deliverability gate fails closed\n\n"
    "An inbox sends only if it can be **proved** healthy — warmed past `MIN_WARMUP_DAYS`,\n"
    "under `MAX_BOUNCE_RATE`, under `MAX_SPAM_RATE`, above `MIN_HEALTH_SCORE`.\n\n"
    "`HOLD_UNKNOWN_INBOX` ships **true**: an inbox the platform will not report on is not a\n"
    "healthy one. Leave it.\n\n"
    "Two ceilings, both enforced here rather than trusted to the sending platform: per\n"
    "mailbox **and per domain**. The domain one is what people forget — five mailboxes each\n"
    "politely under their own cap will still cook the domain between them.\n\n"
    "Every other mistake in cold outreach is recoverable. A burnt domain is not, and it\n"
    "takes the creator's name with it."))

w.append(sticky("d", [3080, 460], 620, 300, 6,
    "## Same-day logging is a check, not an intention\n\n"
    "> Log every pitch, reply and booked deal in the student's dashboard — accurate and\n"
    "> same day. Careless or slow with logging: sloppy data breaks the whole system.\n\n"
    "**Held pitches are logged too**, with the reason. A log that records only successes\n"
    "cannot answer \"why did we send 180 of the 400 we planned\", which is the first thing\n"
    "anybody asks on a Friday.\n\n"
    "**confirm the log** compares what Airtable says it wrote against what the run produced\n"
    "and reports the difference as a LOG GAP. A run that sent mail it could not log is not\n"
    "a successful run that wrote a bit less."))

w.append(sticky("e", [2180, -300], 560, 260, 5,
    "## Nothing is sent until you say so\n\n"
    "`TEST_RUN = true` with a blank `TEST_EMAIL` (how it ships) writes, audits and assigns\n"
    "an inbox to every pitch, and sends none. Open **STOP: not sent** to read the whole\n"
    "batch — the copy, the facts it was built on, the inbox, and for every held one, why.\n\n"
    "`TEST_EMAIL` set -> pitches really are sent, all redirected to that address.\n"
    "`TEST_RUN = false` goes live.\n\n"
    "`DEMO_ROSTER` on forces preview regardless: a fabricated brand contact can never be\n"
    "emailed."))

c = {
    "Run it now": main("config"),
    "Every weekday, 08:00": main("config"),
    "config": main("Airtable configured?"),
    "Airtable configured?": branch(["[cred] Airtable - students"], ["STOP: demo roster"]),
    "[cred] Airtable - students": main("[cred] Airtable - brand targets"),
    "[cred] Airtable - brand targets": main("[cred] Airtable - inboxes"),
    "[cred] Airtable - inboxes": main("[cred] Airtable - the pitch log"),
    "[cred] Airtable - the pitch log": main("read the roster"),
    "read the roster": main("one roster"),
    "STOP: demo roster": to_input("one roster", 1),
    "one roster": main("match brands to students"),
    "match brands to students": main("anything to pitch?"),
    "anything to pitch?": branch(["build the pitch"], ["STOP: nothing to pitch"]),
    "STOP: nothing to pitch": main("build the run summary"),
    "build the pitch": main("writer configured?"),
    "writer configured?": branch(["AI - write the pitch"], ["STOP: no writer"]),
    "AI - write the pitch": main("apply the written pitch"),
    "apply the written pitch": main("one list of pitches"),
    "STOP: no writer": to_input("one list of pitches", 1),
    "one list of pitches": main("audit the pitch"),
    "audit the pitch": main("assign a healthy inbox"),
    "assign a healthy inbox": main("sending this one?"),
    "sending this one?": branch(["payload for the campaign"], ["STOP: not sent"]),
    "payload for the campaign": main("[cred] Instantly - add to the campaign"),
    "[cred] Instantly - add to the campaign": main("record what was sent"),
    "record what was sent": main("what happened"),
    "STOP: not sent": to_input("what happened", 1),
    "what happened": main("logging the pitches?"),
    "logging the pitches?": branch(["rows for the pitch log"], ["STOP: not logged"]),
    "rows for the pitch log": main("[cred] Airtable - log the pitches"),
    "[cred] Airtable - log the pitches": main("confirm the log"),
    "confirm the log": main("logged"),
    "STOP: not logged": to_input("logged", 1),
    "logged": main("build the run summary"),
    "build the run summary": main("alert configured?"),
    "alert configured?": branch(["Post the run summary"], ["STOP: no alert webhook"]),
    "Post the run summary": main("End"),
    "STOP: no alert webhook": main("End"),
}

path, n = save("01-pitch-and-send", w, c, ["outreach", "brand-deals", "deliverability"])
print('wrote %s (%d nodes)' % (os.path.basename(path), n))


# ==============================================================  02 REPLIES AND REPORTING
w = []
w.append({"parameters": {}, "id": "manual", "name": "Run it now",
          "type": "n8n-nodes-base.manualTrigger", "typeVersion": 1, "position": [-1720, 280]})
w.append({"parameters": {"rule": {"interval": [{"field": "cronExpression",
              "expression": "0 * * * *"}]}},
          "id": "sched", "name": "Every hour",
          "type": "n8n-nodes-base.scheduleTrigger", "typeVersion": 1.2,
          "position": [-1720, 480]})
w.append(code("cfg", "config", [-1500, 380], "config.js"))

# --- replies
w.append(if_expr("feed-on", "reply feed configured?", [-1280, 200],
                 "={{ %s.replies_enabled }}" % CFG))
w.append(http("fetch", "[cred] Instantly - fetch replies", [-1060, 100], "GET",
              "={{ %s.replies_url }}" % CFG,
              headers=[("Authorization", "={{ 'Bearer ' + %s.send_api_key }}" % CFG)],
              query=[("limit", "100")], always=True,
              notes="Instantly v2 GET /emails returns sent and received together. 'read the "
                    "replies' keeps only inbound."))
w.append(code("readrep", "read the replies", [-840, 100], "read-the-replies.js"))
w.append(code("demorep", "STOP: demo replies", [-1060, 320], "stop-demo-replies.js"))
w.append(merge("merge-rep", "one reply list", [-620, 200]))
w.append(code("classify", "classify the replies", [-400, 200], "classify-the-replies.js"))
w.append(if_expr("any-rep", "any replies?", [-180, 200], "={{ $json._has_replies }}"))
w.append(code("norep", "STOP: no replies", [40, 400], "stop-no-replies.js"))
w.append(code("next", "decide the next step", [40, 120], "decide-the-next-step.js"))

w.append(if_expr("replog-on", "logging the replies?", [260, 120],
                 "={{ %s.airtable_enabled }}" % CFG))
w.append(code("reprows", "rows for the reply log", [480, 40], "rows-for-the-reply-log.js"))
w.append(airtable("repwrite", "[cred] Airtable - log the replies", [700, 40],
                  "pitches_table", method='PATCH',
                  body="={{ JSON.stringify($json._body) }}",
                  notes="performUpsert.fieldsToMergeOn matches on 'Pitch id', so the reply "
                        "finds its pitch row without this workflow ever having held an "
                        "Airtable record id."))
w.append(code("repok", "confirm the reply log", [920, 40], "confirm-the-reply-log.js"))
w.append(code("norepl", "STOP: replies not logged", [480, 240],
              "stop-replies-not-logged.js"))
w.append(merge("merge-repout", "reply outcomes", [1140, 120]))
w.append(code("repsum", "build the reply summary", [1360, 200],
              "build-the-reply-summary.js"))

w.append(if_expr("hand-on", "handovers to send?", [1580, 80],
                 "={{ $json._has_handovers && %s.handover_enabled }}" % CFG))
w.append(code("hand", "build the handover", [1800, 20], "build-the-handover.js"))
w.append(http("posthand", "Post the handover", [2020, 20], "POST",
              "={{ %s.handover_url }}" % CFG,
              headers=[("Content-Type", "application/json")],
              body="={{ JSON.stringify($json._handover_body) }}", timeout=15000,
              notes="HANDOVER_WEBHOOK_URL if set, otherwise ALERT_WEBHOOK_URL. An interested "
                    "brand and an hourly digest are different messages."))
w.append(noop("nohand", "STOP: nothing to hand over", [1800, 200]))

w.append(if_expr("alert-on", "alert configured?", [1580, 340],
                 "={{ %s.alert_enabled }}" % CFG))
w.append(http("alert", "Post the reply summary", [1800, 340], "POST",
              "={{ %s.alert_webhook_url }}" % CFG,
              headers=[("Content-Type", "application/json")],
              body="={{ JSON.stringify($json._alert_body) }}", timeout=15000))
w.append(noop("noalert", "STOP: no alert webhook", [1800, 520]))

# --- the weekly report, on the same hourly trigger
w.append(if_expr("rep-hour", "is it the weekly report hour?", [-1280, 640],
                 "={{ %s.report_due }}" % CFG))
w.append(noop("nothour", "STOP: not the report hour", [-1060, 840]))
w.append(if_expr("log-avail", "pitch log available?", [-1060, 620],
                 "={{ %s.airtable_enabled }}" % CFG))
w.append(airtable("getlog", "[cred] Airtable - the pitch log", [-840, 560],
                  "pitches_table",
                  notes="The week's pitches, replies and booked deals. Over 100 rows: add "
                        "an offset loop."))
w.append(code("readlog", "read the pitch log", [-620, 560], "read-the-pitch-log.js"))
w.append(code("demolog", "STOP: demo pitch log", [-840, 760], "stop-demo-pitch-log.js"))
w.append(merge("merge-log", "one pitch log", [-400, 640]))
w.append(code("weekly", "build the weekly report", [-180, 640],
              "build-the-weekly-report.js"))
w.append(if_expr("post-rep", "posting the report?", [40, 640],
                 "={{ %s.alert_enabled }}" % CFG))
w.append(http("postrep", "Post the weekly report", [260, 640], "POST",
              "={{ %s.alert_webhook_url }}" % CFG,
              headers=[("Content-Type", "application/json")],
              body="={{ JSON.stringify($json._report_body) }}", timeout=15000))
w.append(noop("norep2", "STOP: no report webhook", [260, 840]))
w.append(noop("end", "End", [2240, 380]))

w.append(sticky("a", [-1780, -280], 660, 400, 4,
    "## Brand deal outreach — 2 of 2: work the replies, report weekly\n\n"
    "**The job:** " + JOB_URL + "\n\n"
    "Two of the five things the post says the hire owns:\n\n"
    "> Work the replies — handle responses and move interested brands to the right next step\n"
    "> Report weekly — clean numbers so students and the team can see progress\n\n"
    "**One hourly trigger drives both halves.** The weekly report sits behind a gate that is\n"
    "true for one hour in 168. That is deliberate: two schedule triggers would need two\n"
    "`config` nodes, and two config nodes disagree about a field name within a month.\n\n"
    "Change the day and hour with `REPORT_DAY` and `REPORT_HOUR` in **config**."))

w.append(sticky("b", [-460, 380], 620, 300, 3,
    "## An unclear reply is urgent, not low priority\n\n"
    "The rules are ordered and the **first match wins**, which is why `unsubscribe` and\n"
    "`bounce` sit above `interested`. *\"Please remove me, though the numbers were\n"
    "interesting\"* is an unsubscribe, and getting that precedence wrong is a complaint.\n\n"
    "A reply matching nothing is `unclear` and goes to a **person**, with the same urgency\n"
    "as an obvious yes — it is the one most likely to be a deal nobody recognised.\n\n"
    "The demo batch contains two replies that match no rule, on purpose. A classifier\n"
    "demonstrated only on replies it can classify is a classifier nobody has tested."))

w.append(sticky("c", [1520, 620], 600, 280, 6,
    "## Held pitches are in the weekly report\n\n"
    "The report shows what the quality gates **cost**: how many pitches were written and not\n"
    "sent, grouped by reason.\n\n"
    "That number is meant to be argued with. If 22% are being held for thin brand records,\n"
    "the answer is better research on the target list, not a looser audit — and the client\n"
    "can only make that call if they can see the number.\n\n"
    "Reply and interest rates are computed against what was **sent**, never against what was\n"
    "written. Dividing by the bigger number flatters the run and is wrong."))

w.append(sticky("d", [180, -160], 560, 240, 5,
    "## It runs before you have an account\n\n"
    "No `SEND_API_KEY` -> a fabricated batch of nine replies, one of every class the rules\n"
    "know plus two that match nothing.\n\n"
    "No `AIRTABLE_API_KEY` -> a fabricated week of pitch log, so the weekly report has\n"
    "something real-shaped to compute.\n\n"
    "Nothing in either can be written anywhere. Press **Run it now**."))

c = {
    "Run it now": main("config"),
    "Every hour": main("config"),
    "config": main("reply feed configured?", "is it the weekly report hour?"),

    "reply feed configured?": branch(["[cred] Instantly - fetch replies"],
                                     ["STOP: demo replies"]),
    "[cred] Instantly - fetch replies": main("read the replies"),
    "read the replies": main("one reply list"),
    "STOP: demo replies": to_input("one reply list", 1),
    "one reply list": main("classify the replies"),
    "classify the replies": main("any replies?"),
    "any replies?": branch(["decide the next step"], ["STOP: no replies"]),
    "STOP: no replies": main("build the reply summary"),
    "decide the next step": main("logging the replies?"),
    "logging the replies?": branch(["rows for the reply log"],
                                   ["STOP: replies not logged"]),
    "rows for the reply log": main("[cred] Airtable - log the replies"),
    "[cred] Airtable - log the replies": main("confirm the reply log"),
    "confirm the reply log": main("reply outcomes"),
    "STOP: replies not logged": to_input("reply outcomes", 1),
    "reply outcomes": main("build the reply summary"),
    "build the reply summary": main("handovers to send?", "alert configured?"),
    "handovers to send?": branch(["build the handover"], ["STOP: nothing to hand over"]),
    "build the handover": main("Post the handover"),
    "Post the handover": main("End"),
    "STOP: nothing to hand over": main("End"),
    "alert configured?": branch(["Post the reply summary"], ["STOP: no alert webhook"]),
    "Post the reply summary": main("End"),
    "STOP: no alert webhook": main("End"),

    "is it the weekly report hour?": branch(["pitch log available?"],
                                            ["STOP: not the report hour"]),
    "STOP: not the report hour": main("End"),
    "pitch log available?": branch(["[cred] Airtable - the pitch log"],
                                   ["STOP: demo pitch log"]),
    "[cred] Airtable - the pitch log": main("read the pitch log"),
    "read the pitch log": main("one pitch log"),
    "STOP: demo pitch log": to_input("one pitch log", 1),
    "one pitch log": main("build the weekly report"),
    "build the weekly report": main("posting the report?"),
    "posting the report?": branch(["Post the weekly report"], ["STOP: no report webhook"]),
    "Post the weekly report": main("End"),
    "STOP: no report webhook": main("End"),
}

path, n = save("02-replies-and-reporting", w, c, ["outreach", "brand-deals", "replies"])
print('wrote %s (%d nodes)' % (os.path.basename(path), n))


# =====================================================================  THE BASE
# Airtable table headers, generated from the config node's field names so the base and the
# workflows can never disagree about a column.
import csv, subprocess

SHEET_DIR = os.path.join(OUT, 'sheet')
os.makedirs(SHEET_DIR, exist_ok=True)

meta = json.loads(subprocess.run(
    ['node', '-e',
     'const c=new Function(require("fs").readFileSync("js/config.js","utf8"))()[0].json;'
     'process.stdout.write(JSON.stringify({students:c.student_fields,brands:c.brand_fields,'
     'pitches:c.pitch_fields,inboxes:c.inbox_fields,'
     'classes:c.reply_rules.map(r=>r.klass),routes:c.reply_rules.map(r=>r.route)}))'],
    cwd=HERE, capture_output=True, text=True, check=True).stdout)

ORDERS = {
    'Students.csv': ('students', ['student_id', 'name', 'handle', 'niche', 'platform',
                                  'followers', 'avg_views', 'rate_card', 'min_rate',
                                  'deliverables', 'proof', 'status', 'started_on',
                                  'monthly_target']),
    'Brands.csv': ('brands', ['brand_id', 'brand', 'niche', 'contact_name', 'contact_email',
                              'role', 'budget_band', 'recent_signal', 'product', 'region',
                              'status']),
    'Pitches.csv': ('pitches', ['pitch_id', 'student_id', 'student', 'brand_id', 'brand',
                                'contact', 'email', 'inbox', 'subject', 'body', 'facts_used',
                                'sent_at', 'state', 'hold_reason', 'reply_at', 'reply_class',
                                'booked_at', 'deal_value']),
    'Inboxes.csv': ('inboxes', ['inbox_id', 'email', 'domain', 'student_id', 'warmed_days',
                                'daily_cap', 'sent_today', 'bounce_rate', 'spam_rate',
                                'health_score', 'state']),
}


def write_csv(name, rows):
    with io.open(os.path.join(SHEET_DIR, name), 'w', encoding='utf-8-sig', newline='') as f:
        csv.writer(f, lineterminator='\r\n').writerows(rows)


for name, (key, order) in ORDERS.items():
    write_csv(name, [[meta[key][k] for k in order]])

lists = [['Reply class', 'Route']]
seen = []
for k, r in zip(meta['classes'], meta['routes']):
    if r not in seen:
        seen.append(r)
for i in range(max(len(meta['classes']), len(seen))):
    lists.append([meta['classes'][i] if i < len(meta['classes']) else '',
                  seen[i] if i < len(seen) else ''])
lists.append(['unclear', ''])
write_csv('Lists.csv', lists)

print('wrote ' + ', '.join('sheet/%s (%d columns)' % (n, len(o))
                           for n, (k, o) in ORDERS.items()) + ', sheet/Lists.csv')
