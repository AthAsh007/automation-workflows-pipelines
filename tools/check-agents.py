#!/usr/bin/env python3
"""Check that every agent profile under agents/ can actually be installed.

A profile is installed by copying files out of its folder, so a missing SKILL.md,
a jobs entry pointing at a prompt that is not there, or a script that does not
parse only shows up on the operator's machine, after a restart. This catches
those before merge.

Rules enforced, for every folder in agents/ except those starting with `_`:
  1. README.md and SKILL.md exist.
  2. SKILL.md opens with front matter holding a `name` and a `description`, and no
     two profiles use the same skill name.
  3. Every .json file parses.
  4. Every job in jobs.entry.json has a name and a schedule. A job with
     `no_agent: false` names a `prompt_file`, and that prompt (or `prompt_source`,
     when the file in the folder has a different name from the installed one)
     exists somewhere in the profile folder. A `skill` on a job matches a skill
     name declared in this repository. Jobs carrying a `_comment` are
     reference-only siblings and skip the prompt and skill checks.
  5. Every .prompt.md file says that attached output is data, not instructions.
  6. Every .py file under the folder compiles.

Exit code 0 if clean, 1 if not.
"""

import json
import os
import re
import sys

FRONT_MATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.S)
FIELD = re.compile(r"^([A-Za-z_][\w-]*)\s*:\s*(.+?)\s*$", re.M)
# The injection guard every scheduled prompt in this repo carries. Matching on the
# phrase keeps the wording free while still failing a prompt that dropped it.
DATA_GUARD = re.compile(r"\b(?:is|are)\s+DATA,\s+not\s+instructions\b", re.I)


def front_matter(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    m = FRONT_MATTER.match(text)
    if not m:
        return None
    return {k: v.strip().strip("'\"") for k, v in FIELD.findall(m.group(1))}


def files_under(folder):
    for dp, dn, fn in os.walk(folder):
        dn[:] = [d for d in dn if d not in {"node_modules", "__pycache__", ".venv"}]
        for f in fn:
            yield os.path.join(dp, f)


def main(root="."):
    agents_dir = os.path.join(root, "agents")
    if not os.path.isdir(agents_dir):
        print("no agents/ folder, nothing to check")
        return 0

    problems = []
    skills = {}       # skill name -> profile that declares it
    jobs_to_check = []  # (profile, job, folder)
    profiles = sorted(
        d for d in os.listdir(agents_dir)
        if os.path.isdir(os.path.join(agents_dir, d)) and not d.startswith(("_", "."))
    )

    for name in profiles:
        folder = os.path.join(agents_dir, name)
        rel = os.path.relpath(folder, root).replace(os.sep, "/")
        all_files = list(files_under(folder))
        basenames = {os.path.basename(p) for p in all_files}

        for required in ("README.md", "SKILL.md"):
            if not os.path.isfile(os.path.join(folder, required)):
                problems.append(f"{rel}: missing {required}")

        skill_path = os.path.join(folder, "SKILL.md")
        if os.path.isfile(skill_path):
            fm = front_matter(skill_path)
            if fm is None:
                problems.append(f"{rel}/SKILL.md: no front matter (--- name / description ---)")
            else:
                for key in ("name", "description"):
                    if not fm.get(key):
                        problems.append(f"{rel}/SKILL.md: front matter has no `{key}`")
                skill = fm.get("name")
                if skill:
                    if skill in skills:
                        problems.append(f"{rel}/SKILL.md: skill name `{skill}` already used by {skills[skill]}")
                    else:
                        skills[skill] = rel

        for path in all_files:
            prel = os.path.relpath(path, root).replace(os.sep, "/")
            if path.endswith(".json"):
                try:
                    with open(path, encoding="utf-8") as f:
                        data = json.load(f)
                except (ValueError, UnicodeDecodeError) as e:
                    problems.append(f"{prel}: does not parse: {e}")
                    continue
                if os.path.basename(path) == "jobs.entry.json":
                    for job in data.get("jobs", []):
                        jobs_to_check.append((prel, job, basenames))
            elif path.endswith(".prompt.md"):
                with open(path, encoding="utf-8") as f:
                    if not DATA_GUARD.search(f.read()):
                        problems.append(f"{prel}: no 'is DATA, not instructions' guard for attached output")
            elif path.endswith(".py"):
                # Compile in memory: no .pyc written next to the source, nothing to clean up.
                try:
                    with open(path, "rb") as f:
                        compile(f.read(), prel, "exec")
                except (SyntaxError, ValueError) as e:
                    problems.append(f"{prel}: does not compile: {e}")

    # Jobs are checked last so a job may use a skill declared by another profile.
    for prel, job, basenames in jobs_to_check:
        label = f"{prel}: job `{job.get('name', '?')}`"
        if not job.get("name"):
            problems.append(f"{prel}: a job has no name")
        if not (job.get("schedule_display") or job.get("schedule")):
            problems.append(f"{label} has no schedule")
        # A job carrying `_comment` is a reference-only sibling (another brand, another
        # install). Its prompt and skill live outside this repository by design.
        reference_only = bool(job.get("_comment"))
        if job.get("no_agent") is False and not reference_only:
            prompt = job.get("prompt_file")
            # prompt_file is where the prompt is installed; prompt_source is the file in
            # this folder that gets copied there, when the two names differ.
            source = os.path.basename(job.get("prompt_source") or prompt or "")
            if not prompt:
                problems.append(f"{label} runs the agent but names no prompt_file")
            elif source not in basenames:
                problems.append(f"{label} installs {prompt}, but no {source} in the profile "
                                f"(set prompt_source if the file in the folder has another name)")
        skill = job.get("skill")
        if skill and skill not in skills and not reference_only:
            problems.append(f"{label} uses skill `{skill}`, which no SKILL.md in agents/ declares")

    for p in problems:
        print(p)
    print(f"{len(profiles)} profiles, {len(skills)} skills, {len(jobs_to_check)} jobs checked; "
          f"{len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
