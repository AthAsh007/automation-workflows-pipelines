"""Tests for the pipeline logic, with no orchestrator involved.

This is the point of keeping the logic out of the DAG. The behaviour that matters
(validation, idempotency, quality thresholds) is testable in milliseconds, and it
does not change when you swap orchestrators.

    python -m pytest shared/test_pipeline.py -q     # if pytest is installed
    python shared/test_pipeline.py                  # if it is not

The second form exists because a template nobody can run is a template nobody
checks. The shims below cover the two pytest features used here and nothing else.
"""

import io
import sys
import traceback

try:
    import pytest
except ImportError:                                  # stand-alone fallback
    class _Mark:
        @staticmethod
        def parametrize(argnames, argvalues):
            names = [a.strip() for a in argnames.split(",")]

            def wrap(fn):
                fn._params = (names, argvalues)
                return fn
            return wrap

    class pytest:                                    # noqa: N801
        mark = _Mark

        @staticmethod
        def fixture(fn):
            fn._fixture = True
            return fn

from shared.pipeline import (
    connect, load_csv, run_quality_checks, validate_row, format_alert, failed,
)

HEADER = "partner_id,external_id,customer_ref,amount,currency,status,placed_at\n"


def csv_of(*rows):
    return io.StringIO(HEADER + "".join(r if r.endswith("\n") else r + "\n" for r in rows))


@pytest.fixture
def conn():
    c = connect(":memory:")
    yield c
    c.close()


# -- validation -----------------------------------------------------------

def test_accepts_a_well_formed_row():
    row, reason = validate_row(
        {"partner_id": "acme-north", "external_id": "ORD-1", "customer_ref": "CUST-1",
         "amount": "12.34", "currency": "gbp", "status": "Placed",
         "placed_at": "2026-09-01T09:00:00Z"}, "2026-09-01")
    assert reason is None
    assert row.amount_cents == 1234
    assert row.currency == "GBP"      # normalised
    assert row.status == "placed"     # normalised


@pytest.mark.parametrize("field,value,fragment", [
    ("partner_id", "", "partner_id is empty"),
    ("external_id", "", "external_id is empty"),
    ("amount", "twelve", "is not a decimal"),
    ("amount", "12.345", "is not a decimal"),
    ("currency", "XYZ", "is not one of"),
    ("status", "teleported", "is not one of"),
    ("placed_at", "yesterday", "is not ISO 8601"),
])
def test_rejects_with_a_specific_reason(field, value, fragment):
    base = {"partner_id": "p", "external_id": "e", "customer_ref": "c",
            "amount": "1.00", "currency": "GBP", "status": "placed",
            "placed_at": "2026-09-01T09:00:00Z"}
    base[field] = value
    row, reason = validate_row(base, "2026-09-01")
    assert row is None
    assert fragment in reason


def test_amount_is_stored_as_integer_minor_units():
    """Money as a float is how a reconciliation ends up a penny out."""
    for text, cents in [("0.01", 1), ("1", 100), ("1.5", 150), ("1.05", 105),
                        ("900.99", 90099)]:
        row, _ = validate_row(
            {"partner_id": "p", "external_id": "e", "amount": text,
             "currency": "GBP", "status": "placed"}, "2026-09-01")
        assert isinstance(row.amount_cents, int)
        assert row.amount_cents == cents


# -- loading --------------------------------------------------------------

def test_rejects_go_to_their_own_table_and_do_not_stop_the_load(conn):
    result = load_csv(conn, _tmp(csv_of(
        "acme,ORD-1,CUST-1,10.00,GBP,placed,2026-09-01T09:00:00Z",
        ",ORD-2,CUST-2,10.00,GBP,placed,2026-09-01T09:00:00Z",
        "acme,ORD-3,CUST-3,10.00,GBP,placed,2026-09-01T09:00:00Z",
    )), "2026-09-01")
    assert (result.read, result.accepted, result.rejected) == (3, 2, 1)
    rejects = conn.execute("SELECT * FROM partner_orders_rejects").fetchall()
    assert len(rejects) == 1
    assert rejects[0]["row_number"] == 3          # header is line 1
    assert "partner_id is empty" in rejects[0]["reason"]


def test_running_the_same_day_twice_is_idempotent(conn):
    path = _tmp(csv_of(
        "acme,ORD-1,CUST-1,10.00,GBP,placed,2026-09-01T09:00:00Z",
        "acme,ORD-2,CUST-2,20.00,GBP,shipped,2026-09-01T10:00:00Z",
    ))
    first = load_csv(conn, path, "2026-09-01")
    second = load_csv(conn, path, "2026-09-01")
    assert first.upserted == second.upserted == 2
    assert conn.execute("SELECT COUNT(*) c FROM partner_orders").fetchone()["c"] == 2


def test_a_rerun_reflects_corrected_source_data(conn):
    load_csv(conn, _tmp(csv_of("acme,ORD-1,CUST-1,10.00,GBP,placed,")), "2026-09-01")
    load_csv(conn, _tmp(csv_of("acme,ORD-1,CUST-1,99.00,GBP,delivered,")), "2026-09-01")
    row = conn.execute("SELECT * FROM partner_orders").fetchone()
    assert (row["amount_cents"], row["status"]) == (9900, "delivered")


def test_reloading_one_day_leaves_another_day_alone(conn):
    load_csv(conn, _tmp(csv_of("acme,ORD-1,C,10.00,GBP,placed,")), "2026-09-01")
    load_csv(conn, _tmp(csv_of("acme,ORD-9,C,10.00,GBP,placed,")), "2026-09-02")
    load_csv(conn, _tmp(csv_of("acme,ORD-1,C,10.00,GBP,placed,")), "2026-09-01")
    days = [r["business_date"] for r in
            conn.execute("SELECT DISTINCT business_date FROM partner_orders"
                         " ORDER BY business_date")]
    assert days == ["2026-09-01", "2026-09-02"]


# -- quality --------------------------------------------------------------

def test_an_empty_partition_fails_the_row_count_check(conn):
    load_csv(conn, _tmp(csv_of()), "2026-09-01")
    checks = {c["check_name"]: c for c in run_quality_checks(conn, "2026-09-01")}
    assert checks["row_count"]["passed"] is False


def test_null_rate_check_uses_its_threshold(conn):
    rows = ["acme,ORD-%d,%s,10.00,GBP,placed," % (i, "" if i < 3 else "CUST-%d" % i)
            for i in range(10)]
    load_csv(conn, _tmp(csv_of(*rows)), "2026-09-01")
    lenient = {c["check_name"]: c for c in
               run_quality_checks(conn, "2026-09-01", max_null_customer_rate=0.50)}
    strict = {c["check_name"]: c for c in
              run_quality_checks(conn, "2026-09-01", max_null_customer_rate=0.10)}
    assert lenient["null_customer_ref"]["passed"] is True
    assert strict["null_customer_ref"]["passed"] is False


def test_check_results_are_recorded_and_overwritten_not_duplicated(conn):
    load_csv(conn, _tmp(csv_of("acme,ORD-1,C,10.00,GBP,placed,")), "2026-09-01")
    run_quality_checks(conn, "2026-09-01")
    run_quality_checks(conn, "2026-09-01")
    n = conn.execute("SELECT COUNT(*) c FROM quality_checks"
                     " WHERE business_date = '2026-09-01'").fetchone()["c"]
    assert n == 4


def test_alert_names_the_check_the_number_and_the_threshold(conn):
    load_csv(conn, _tmp(csv_of()), "2026-09-01")
    fails = failed(run_quality_checks(conn, "2026-09-01"))
    text = format_alert("2026-09-01", fails)
    assert "row_count" in text and "2026-09-01" in text and "expected" in text


# -- helper ---------------------------------------------------------------

def _tmp(buf):
    """load_csv takes a path or a StringIO. Tests use the latter."""
    return buf


def _run_standalone():
    """Minimal runner, used when pytest is not installed."""
    tests = [(n, f) for n, f in sorted(globals().items())
             if n.startswith("test_") and callable(f)]
    passed = failures = 0
    for name, fn in tests:
        cases = [()]
        names, values = getattr(fn, "_params", (None, None))
        if names:
            cases = [tuple(v if isinstance(v, tuple) else (v,)) for v in values]
        for case in cases:
            needs_conn = "conn" in fn.__code__.co_varnames[:fn.__code__.co_argcount]
            c = connect(":memory:") if needs_conn else None
            label = name + ("[%s]" % ", ".join(map(repr, case)) if case else "")
            try:
                fn(c, *case) if needs_conn else fn(*case)
                passed += 1
            except Exception:
                failures += 1
                print("FAIL %s" % label)
                print("".join("     " + l for l in
                              traceback.format_exc().splitlines(True)[-4:]))
            finally:
                if c is not None:
                    c.close()
    print("\n%d passed, %d failed" % (passed, failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(_run_standalone())
