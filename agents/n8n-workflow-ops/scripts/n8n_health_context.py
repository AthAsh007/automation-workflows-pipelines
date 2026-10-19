#!/usr/bin/env python3
"""Collect the last N hours of executions for a set of n8n workflows.

Read-only. Prints one JSON document for the workflow-health prompt to read:
per workflow, its name, whether it is active, run counts by status, and for each
failed run the node that failed and the error message (trimmed). Workflows that
are active but did not run in the window are listed under `silent`.

Usage:
  n8n_health_context.py --hours 24 --watch ID1,ID2,ID3

Environment:
  N8N_BASE_URL  e.g. https://n8n.example.com
  N8N_API_KEY   an n8n REST API key; read access is enough

Standard library only, so it runs on any agent host without a virtualenv.
"""

import argparse
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

MAX_FAILURES_DETAILED = 10  # per workflow; the rest are counted, not fetched
MAX_PAGES = 20              # 20 pages x 250 = 5000 executions per workflow, then stop
ERROR_CHARS = 300


def api(base, key, path, params=None):
    url = base.rstrip("/") + "/api/v1" + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"X-N8N-API-KEY": key, "accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def parse_time(s):
    if not s:
        return None
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00"))


def executions_since(base, key, wf_id, since):
    """Newest first; stop paging once runs are older than `since`."""
    out, cursor = [], None
    for _ in range(MAX_PAGES):
        params = {"workflowId": wf_id, "limit": 250}
        if cursor:
            params["cursor"] = cursor
        page = api(base, key, "/executions", params)
        for ex in page.get("data", []):
            started = parse_time(ex.get("startedAt"))
            if started and started < since:
                return out
            out.append(ex)
        cursor = page.get("nextCursor")
        if not cursor:
            break
    return out


def failure_detail(base, key, ex_id):
    try:
        ex = api(base, key, f"/executions/{ex_id}", {"includeData": "true"})
    except urllib.error.HTTPError as e:
        return {"id": ex_id, "node": None, "error": f"could not load execution: HTTP {e.code}"}
    result = ((ex.get("data") or {}).get("resultData")) or {}
    err = result.get("error") or {}
    node = (err.get("node") or {}).get("name") or result.get("lastNodeExecuted")
    message = str(err.get("message") or err.get("description") or "no error message recorded")
    return {
        "id": ex_id,
        "started": ex.get("startedAt"),
        "node": node,
        "error": " ".join(message.split())[:ERROR_CHARS],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--hours", type=float, default=24)
    ap.add_argument("--watch", required=True, help="comma-separated workflow IDs")
    args = ap.parse_args()

    base = os.environ.get("N8N_BASE_URL", "").strip()
    key = os.environ.get("N8N_API_KEY", "").strip()
    if not base or not key:
        print(json.dumps({"error": "N8N_BASE_URL and N8N_API_KEY must be set"}))
        return 2

    now = dt.datetime.now(dt.timezone.utc)
    since = now - dt.timedelta(hours=args.hours)
    report = {"window_hours": args.hours, "generated_at": now.isoformat(), "workflows": [], "silent": []}

    for wf_id in [w.strip() for w in args.watch.split(",") if w.strip()]:
        try:
            wf = api(base, key, f"/workflows/{wf_id}")
        except urllib.error.HTTPError as e:
            report["workflows"].append({"id": wf_id, "error": f"could not load workflow: HTTP {e.code}"})
            continue
        runs = executions_since(base, key, wf_id, since)
        counts = {}
        for ex in runs:
            status = ex.get("status") or ("success" if ex.get("finished") else "unknown")
            counts[status] = counts.get(status, 0) + 1
        failed = [ex for ex in runs if ex.get("status") in ("error", "crashed")]
        entry = {
            "id": wf_id,
            "name": wf.get("name"),
            "active": bool(wf.get("active")),
            "runs": len(runs),
            "by_status": counts,
            "failures": [failure_detail(base, key, ex["id"]) for ex in failed[:MAX_FAILURES_DETAILED]],
            "failures_not_detailed": max(0, len(failed) - MAX_FAILURES_DETAILED),
        }
        report["workflows"].append(entry)
        if entry["active"] and not runs:
            report["silent"].append({"id": wf_id, "name": wf.get("name")})

    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
