#!/usr/bin/env python3
"""Emit recent LinkedIn draft history + posted log for prompt injection into the drafts job.

Two modes:

  linkedin_context.py                 combined mode — both brands, one shared output dir.
                                      Used by the `content_drafts` job.
  linkedin_context.py --brand acme per-brand mode — that brand's approval dir and log
                                      only, plus today's state-machine verdict. Used by
                                      the `man_lin_pos` / `mch_lin_pos` approval jobs.

Per-brand mode exists so the two approval jobs never read each other's state: a shared
log makes one brand's post look like the other's and the job silently skips a day.
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import re
import subprocess
import sys
from pathlib import Path

HOME = Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes")))
JOB_ID = os.environ.get("LINKEDIN_JOB_ID", "a4112f423b01")
OUTPUT_DIR = HOME / "cron" / "output" / JOB_ID
LOG_PATH = HOME / "data" / "linkedin_posted_log.tsv"
DAYS = int(os.environ.get("LINKEDIN_CONTEXT_DAYS", "14"))

BRANDS = ("acme", "mch")


def approval_dir(brand: str) -> Path:
    return HOME / "cron" / "output" / f"linkedin_approval_{brand}"


def brand_log_path(brand: str) -> Path:
    """Per-brand log if the deployment splits them, otherwise the shared log.

    linkedin_log.sh writes brand as a *column* of the shared TSV unless LINKEDIN_LOG_PATH
    points it elsewhere, so both layouts are live. Reading whichever exists means the
    state machine is correct either way; brand_log_lines() filters by column regardless.
    """
    split = HOME / "data" / f"linkedin_posted_log_{brand}.tsv"
    return split if split.exists() else LOG_PATH


def brand_log_lines(brand: str) -> list[str]:
    path = brand_log_path(brand)
    if not path.exists():
        return []
    lines = []
    for ln in path.read_text(errors="replace").splitlines():
        if not ln.strip():
            continue
        fields = ln.split("\t")
        # Shared log: date, brand, status, note. Split log: no brand column to match on.
        if len(fields) >= 2 and fields[1] in BRANDS and fields[1] != brand:
            continue
        lines.append(ln)
    return lines


def resolve_state(brand: str, today: str) -> tuple[str, str]:
    """Today's state per the four-state machine. Returns (state, action).

    The log is the source of truth; file presence alone never decides. Draft artefacts
    are written at draft time, so treating them as evidence of a post makes a cancelled
    date unrecoverable.
    """
    # Last decisive status wins, not `posted` wins. The log is append-only, so a
    # rollback of a bad post is a `cancelled` row appended after the `posted` one —
    # precedence by status rather than order would read that day as still published.
    # `skipped` is not decisive: it covers both "draft generated" and "skipped, reason".
    decisive = ""
    for ln in brand_log_lines(brand):
        fields = ln.split("\t")
        if len(fields) >= 3 and fields[0] == today and fields[2].strip() in ("posted", "cancelled"):
            decisive = fields[2].strip()

    if decisive == "posted":
        return "POSTED", "[SILENT] — already published today"
    if decisive == "cancelled":
        return "CANCELLED", "draft again — the earlier draft was discarded"

    day_dir = approval_dir(brand)
    artefacts = sorted(day_dir.glob(f"{today}*")) if day_dir.is_dir() else []
    if artefacts:
        return "AWAITING APPROVAL", "[SILENT] — a draft is pending review"
    return "NOTHING YET", "draft it"


def response_text(path: Path) -> str:
    text = path.read_text(errors="replace")
    parts = text.split("\n## Response", 1)
    return parts[1] if len(parts) == 2 else text


def summarize(path: Path) -> str:
    body = response_text(path)
    date = path.name[:10]
    pillars = re.findall(r"^Pillar:\s*(.+)$", body, re.M)
    # First non-decoration body line per brand block as the topic hint.
    topics = []
    for block in re.split(r"^={10,}$", body, flags=re.M):
        block = block.strip()
        if not block or block.startswith(("ACME", "MCH", "Pillar:")):
            continue
        first = next(
            (ln.strip() for ln in block.splitlines()
             if ln.strip() and not ln.startswith(("#", "Pillar:", "---", "Sources:"))),
            "",
        )
        if first:
            topics.append(first[:110])
        if len(topics) >= 2:
            break
    parts = [date]
    if pillars:
        parts.append("pillars: " + ", ".join(p.strip()[:40] for p in pillars[:2]))
    for t in topics:
        parts.append(f'"{t}"')
    return " — ".join(parts)


def emit_brand_state(brand: str) -> None:
    today = dt.date.today().isoformat()
    state, action = resolve_state(brand, today)
    print(f"## Today's state for {brand} ({today})")
    print(f"- State: **{state}**")
    print(f"- Action: {action}")
    if state.startswith(("POSTED", "AWAITING")):
        # Said plainly because the failure mode is a second draft for a day that
        # already has one pending or published.
        print("- Generate nothing. Log the reason and exit.")
    print()


def emit_brand_history(brand: str) -> None:
    day_dir = approval_dir(brand)
    print("## Recent drafts (do NOT repeat these angles, openings, or examples)")
    captions = sorted(day_dir.glob("*_caption.txt"))[-DAYS:] if day_dir.is_dir() else []
    for f in captions:
        try:
            first = next(
                (ln.strip() for ln in f.read_text(errors="replace").splitlines() if ln.strip()),
                "",
            )
        except OSError:
            continue
        print(f'- {f.name[:10]} — "{first[:140]}"')
    if not captions:
        print("- (no drafts archived yet)")

    print()
    print(f"## Posted log for {brand} (what actually published — weight these pillars up)")
    lines = brand_log_lines(brand)[-DAYS:]
    for ln in lines:
        print(f"- {ln.replace(chr(9), ' | ')}")
    if not lines:
        print(f"- (none logged yet — logged with: linkedin_log.sh posted|skipped {brand} 'note')")


def main(brand: str | None = None) -> int:
    if brand:
        emit_brand_state(brand)
        emit_brand_history(brand)
    else:
        print("## Recent draft history (do NOT repeat these angles, openings, or examples)")
        if OUTPUT_DIR.is_dir():
            files = sorted(OUTPUT_DIR.glob("*.md"))[-DAYS:]
            for f in files:
                try:
                    print(f"- {summarize(f)}")
                except OSError:
                    continue
            if not files:
                print("- (no drafts archived yet)")
        else:
            print("- (no drafts archived yet)")

        print()
        print("## Posted log (what the operator actually published — weight these pillars up)")
        if LOG_PATH.exists():
            lines = [ln for ln in LOG_PATH.read_text().splitlines() if ln.strip()]
            for ln in lines[-DAYS:]:
                print(f"- {ln.replace(chr(9), ' | ')}")
            if not lines:
                print("- (none logged yet)")
        else:
            print("- (none logged yet — operator logs with: linkedin_log.sh posted|skipped acme|mch 'note')")

    signal_script = HOME / "scripts" / "brand_signal_digest.py"
    if signal_script.exists():
        print()
        print("## Internal brand signals (INTERNAL ONLY — never quote infra, credentials, IDs, or names in drafts)")
        try:
            out = subprocess.run(
                [sys.executable, str(signal_script)],
                capture_output=True, text=True, timeout=60,
            )
            if out.returncode == 0:
                # Drop ops/infra sections — irrelevant to content and needless exposure.
                skip = re.compile(r"^## .*(docker|container|cron / automation|core memory)", re.I)
                keep, skipping = [], False
                for ln in out.stdout.splitlines():
                    if ln.startswith("## "):
                        skipping = bool(skip.match(ln))
                    if not skipping:
                        keep.append(ln)
                print("\n".join(keep).strip())
            else:
                print("- (signal script failed; draft from cadence + news only)")
        except (OSError, subprocess.TimeoutExpired):
            print("- (signal script unavailable; draft from cadence + news only)")

    try:
        from offer_context import emit_offer_context
        emit_offer_context()
    except ImportError:
        pass
    return 0


try:
    import safe_stdout
    safe_stdout.install()
except ImportError:
    pass

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--brand",
        choices=BRANDS,
        help="emit one brand's approval-dir history, log and state; omit for combined mode",
    )
    # parse_known_args, not parse_args: this script previously ignored argv entirely, and
    # the sibling context scripts still do. If the cron runner ever passes an extra
    # argument, tolerating it keeps the job producing context instead of exiting 2 —
    # a hard failure here is invisible until a day's draft silently never appears.
    raise SystemExit(main(parser.parse_known_args()[0].brand))
