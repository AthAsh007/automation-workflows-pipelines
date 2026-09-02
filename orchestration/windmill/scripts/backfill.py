"""Backfill a date range. Windmill generates the form from this signature.

Windmill has no partition primitive, so a range is an ordinary loop. Running it
as a Windmill script rather than a shell command means the run is logged, retried
and permissioned like everything else in the workspace.
"""

import sys
from datetime import date, timedelta

sys.path.insert(0, "/app")

from shared.pipeline import run


def main(start: str, end: str, drop_dir: str = "/tmp/partner",
         stop_on_failure: bool = False) -> dict:
    """Load every day in [start, end].

    stop_on_failure is False by default: one day with a bad partner file should
    not leave the other 89 unloaded. The summary lists which days need attention.
    """
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    if d1 < d0:
        raise ValueError("end (%s) is before start (%s)" % (end, start))

    done, problems, missing = [], [], []
    day = d0
    while day <= d1:
        iso = day.isoformat()
        source = "%s/partner-%s.csv" % (drop_dir, iso)
        try:
            summary = run(iso, source, db_path="/app/data/warehouse.db")
        except FileNotFoundError:
            missing.append(iso)
        else:
            done.append(iso)
            if summary["failed_checks"]:
                problems.append({"date": iso, "checks": summary["failed_checks"]})
                if stop_on_failure:
                    break
        day += timedelta(days=1)

    return {"loaded": len(done), "days": done, "missing_files": missing,
            "days_with_failing_checks": problems}
