#!/usr/bin/env python3
"""Check every n8n workflow JSON against the conventions.

  1. The file parses, and has `nodes` and `connections`.
  2. Node names are unique, and every connection points at a node that exists.
  3. Live workflows (outside archive/ and starters/) have exactly one node
     named `config`.
  4. Live workflows do not read `$env` or `$vars`.
  5. No node holds a value that looks like a real credential.
  6. A workflow with a send, publish, write or call node also has a gate: a
     `STOP:` node, or a `preview`/`test_run`/`dry_run` key in its config node.

Workflows under archive/ and starters/ are checked for 1, 2 and 5 only. The
archive predates the config-node rule. The starters are single-file templates
built to n8n's own library conventions, which do not require a config node or a
STOP gate; docs/CONFIG-NODE.md section 9 is what converting one takes.

Exit code 0 if clean, 1 if not.
"""

import json
import os
import re
import sys

SECRET = re.compile(
    r"(?i)(api[_-]?key|secret|token|password|passwd|bearer)\s*[:=]\s*"
    r"['\"]([A-Za-z0-9_\-]{16,})['\"]"
)
PLACEHOLDER = re.compile(
    r"(?i)^(your[_-]|xxx|placeholder|changeme|<|\{\{|sk-ant-xxx|example)"
)
ACTION = re.compile(
    r"(?i)\b(send|publish|post the|upsert|create|update|delete|write|call|"
    r"enroll|charge)\b"
)
GATE_KEYS = ("preview", "test_run", "dry_run", "live_send", "send_enabled", "mode")


def load(path):
    with open(path, "rb") as f:
        return json.loads(f.read().decode("utf-8-sig"))


# Directories held to rules 1, 2 and 5 only.
RELAXED = {"archive", "starters"}


def check(path, rel, relaxed):
    out = []

    def bad(msg):
        out.append("%s: %s" % (rel.replace("\\", "/"), msg))

    try:
        wf = load(path)
    except Exception as exc:
        bad("does not parse: %s" % exc)
        return out

    nodes = wf.get("nodes")
    if not isinstance(nodes, list):
        bad("has no nodes array")
        return out
    if "connections" not in wf:
        bad("has no connections object")

    names = [n.get("name", "") for n in nodes]
    dupes = {n for n in names if names.count(n) > 1}
    if dupes:
        bad("duplicate node names: %s" % ", ".join(sorted(dupes)))

    known = set(names)
    for source, outputs in (wf.get("connections") or {}).items():
        if source not in known:
            bad("connection from an unknown node: %s" % source)
        for group in (outputs or {}).values():
            for branch in group or []:
                for link in branch or []:
                    target = link.get("node")
                    if target not in known:
                        bad("connection to an unknown node: %s" % target)

    raw = open(path, "rb").read().decode("utf-8-sig")

    for m in SECRET.finditer(raw):
        value = m.group(2)
        if not PLACEHOLDER.match(value):
            bad("looks like a committed credential near %r" % m.group(1))

    if relaxed:
        return out

    configs = [n for n in nodes if n.get("name") == "config"]
    if len(configs) != 1:
        bad("expected exactly one node named 'config', found %d" % len(configs))

    if "$env" in raw:
        bad("reads $env. See docs/CONFIG-NODE.md")
    if "$vars" in raw:
        bad("reads $vars, which needs a paid n8n plan. See docs/CONFIG-NODE.md")

    acts = [n.get("name", "") for n in nodes if ACTION.search(n.get("name", ""))]
    if acts:
        has_stop = any(n.get("name", "").startswith("STOP:") for n in nodes)
        cfg = json.dumps(configs[0]) if configs else ""
        has_flag = any(k in cfg for k in GATE_KEYS)
        if not (has_stop or has_flag):
            bad("has action nodes (%s) but no STOP: gate and no preview flag"
                % ", ".join(acts[:3]))
    return out


def main(root="."):
    problems, count = [], 0
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in (".git", "node_modules")]
        for f in fn:
            if not f.endswith(".json"):
                continue
            path = os.path.join(dp, f)
            rel = os.path.relpath(path, root)
            parts = rel.replace("\\", "/").split("/")
            if parts[0] != "n8n" or "sample" in parts or "demo" in parts:
                continue
            count += 1
            problems += check(path, rel, bool(RELAXED & set(parts)))
    if not problems:
        print("validate-workflows: %d workflow file(s) clean" % count)
        return 0
    for p in problems:
        print(p)
    print("\nvalidate-workflows: %d problem(s) across %d file(s)." % (len(problems), count))
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
