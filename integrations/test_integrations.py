"""Tests for the failure paths. The happy path is the least interesting one.

    python test_integrations.py

No dependencies, no pytest required. A test suite that needs an install is a test
suite that does not get run.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import worker
from store import Store
from webhook_receiver import SignatureError, handle_delivery, sign, verify_signature

SECRET = "whsec_test_do_not_use"


def fresh_store():
    path = os.path.join(tempfile.mkdtemp(), "t.db")
    return Store(path)


# -- signature verification -----------------------------------------------

def test_a_correct_signature_passes():
    body = b'{"id":"1"}'
    ts = str(int(time.time()))
    verify_signature(body, ts, sign(body, ts, SECRET), SECRET)


def test_a_tampered_body_fails():
    ts = str(int(time.time()))
    good = sign(b'{"amount":100}', ts, SECRET)
    try:
        verify_signature(b'{"amount":100000}', ts, good, SECRET)
    except SignatureError:
        return
    raise AssertionError("a changed body must not verify against the old signature")


def test_a_replayed_delivery_fails_once_it_is_stale():
    body = b'{"id":"1"}'
    old = str(int(time.time()) - 3600)
    signature = sign(body, old, SECRET)      # a genuine signature, an hour old
    try:
        verify_signature(body, old, signature, SECRET, tolerance=300)
    except SignatureError as exc:
        assert "outside" in str(exc), exc
        return
    raise AssertionError("an hour-old delivery must be rejected as a replay")


def test_the_timestamp_cannot_be_edited_without_breaking_the_signature():
    body = b'{"id":"1"}'
    old = str(int(time.time()) - 3600)
    signature = sign(body, old, SECRET)
    now = str(int(time.time()))
    try:
        # The attacker rewrites the timestamp to get inside the window. It fails,
        # because the timestamp is part of what was signed.
        verify_signature(body, now, signature, SECRET, tolerance=300)
    except SignatureError:
        return
    raise AssertionError("the timestamp must be covered by the signature")


def test_a_wrong_secret_fails():
    body = b'{"id":"1"}'
    ts = str(int(time.time()))
    try:
        verify_signature(body, ts, sign(body, ts, "another-secret"), SECRET)
    except SignatureError:
        return
    raise AssertionError("a signature from a different secret must not verify")


def test_missing_headers_fail():
    for ts, sg in [("", "abc"), (str(int(time.time())), ""), ("", "")]:
        try:
            verify_signature(b"{}", ts, sg, SECRET)
        except SignatureError:
            continue
        raise AssertionError("missing headers must be rejected")


def test_no_configured_secret_rejects_everything():
    body = b'{"id":"1"}'
    ts = str(int(time.time()))
    try:
        verify_signature(body, ts, sign(body, ts, ""), secret="")
    except SignatureError as exc:
        assert "no WEBHOOK_SECRET" in str(exc)
        return
    raise AssertionError("an unconfigured receiver must fail closed, not open")


# -- idempotency ----------------------------------------------------------

def test_the_same_delivery_is_accepted_once_and_acknowledged_twice():
    store = fresh_store()
    payload = {"id": "evt_1", "type": "order.created",
               "data": {"order_id": "ORD-1"}}
    first = handle_delivery(store, "acme", "evt_1", "order.created", payload)
    second = handle_delivery(store, "acme", "evt_1", "order.created", payload)
    assert first == (202, "accepted"), first
    assert second[0] == 200, "a duplicate is acknowledged, not an error"
    assert store.counts()["queued"] == 1, "and it is queued exactly once"


def test_two_events_with_identical_payloads_are_both_processed():
    """Deduplication is on the delivery id, not a hash of the body."""
    store = fresh_store()
    body = {"type": "order.created", "data": {"order_id": "ORD-1"}}
    handle_delivery(store, "acme", "evt_1", "order.created", body)
    handle_delivery(store, "acme", "evt_2", "order.created", body)
    assert store.counts()["queued"] == 2


# -- the queue ------------------------------------------------------------

def test_a_leased_job_is_not_handed_to_a_second_worker():
    store = fresh_store()
    store.enqueue("d1", "acme", "order.created", {"data": {"order_id": "1"}})
    first = store.lease(seconds=60, limit=10)
    second = store.lease(seconds=60, limit=10)
    assert len(first) == 1
    assert second == [], "a leased job must not be visible to another worker"


def test_an_expired_lease_returns_the_job():
    store = fresh_store()
    store.enqueue("d1", "acme", "order.created", {"data": {"order_id": "1"}})
    store.lease(seconds=-1, limit=10)          # a worker that died immediately
    again = store.lease(seconds=60, limit=10)
    assert len(again) == 1, "work must not be lost when a worker dies"


def test_a_permanent_failure_goes_straight_to_the_dead_letters():
    store = fresh_store()
    store.enqueue("d1", "acme", "order.created", {"data": {}})   # no order_id
    stats = worker.run_once(store, verbose=False)
    assert stats["dead"] == 1, stats
    assert stats["retried"] == 0, "a 4xx-shaped failure is not retried"
    assert store.counts()["queued"] == 0


def test_a_transient_failure_is_retried_and_then_given_up_on():
    store = fresh_store()
    store.enqueue("d1", "acme", "test.transient", {})
    for _ in range(worker.MAX_ATTEMPTS + 1):
        # available_at is in the future after each failure, so the test moves it
        # back rather than sleeping through the real backoff.
        store.conn.execute("UPDATE queue SET available_at = 0, leased_until = NULL")
        worker.run_once(store, verbose=False)
    assert store.counts()["queued"] == 0
    assert store.counts()["dead_letters"] == 1
    row = store.dead_letters()[0]
    assert "gave up" in row["last_error"], row["last_error"]


def test_an_unrecognised_event_type_completes_rather_than_dead_lettering():
    store = fresh_store()
    store.enqueue("d1", "acme", "some.brand.new.event", {"data": {}})
    stats = worker.run_once(store, verbose=False)
    assert stats["completed"] == 1, "a new event type is not a failure"
    assert stats["dead"] == 0


def test_a_dead_letter_can_be_replayed():
    store = fresh_store()
    store.enqueue("d1", "acme", "order.created", {"data": {}})
    worker.run_once(store, verbose=False)
    assert store.counts()["dead_letters"] == 1
    assert store.replay_dead_letter("d1") is True
    assert store.counts()["queued"] == 1
    assert store.counts()["dead_letters"] == 0


def test_replaying_something_that_is_not_there_reports_it():
    assert fresh_store().replay_dead_letter("nope") is False


# -- backoff --------------------------------------------------------------

def test_backoff_grows_and_is_capped():
    assert worker.backoff(0) <= worker.BASE_DELAY
    assert worker.backoff(3) > worker.backoff(0)
    assert worker.backoff(50) <= worker.MAX_DELAY


def test_backoff_is_jittered():
    """Identical delays are the thundering-herd bug, not a nice round number."""
    values = {round(worker.backoff(4), 6) for _ in range(40)}
    assert len(values) > 1, "backoff must not be deterministic"


def test_classify_splits_retryable_from_permanent():
    for status in (429, 500, 502, 503, 504, 408):
        assert worker.classify(status) is worker.Transient, status
    for status in (400, 401, 403, 404, 422):
        assert worker.classify(status) is worker.Permanent, status
    assert worker.classify(200) is None


# -- runner ---------------------------------------------------------------

def main() -> int:
    tests = [(n, f) for n, f in sorted(globals().items())
             if n.startswith("test_") and callable(f)]
    passed = failed = 0
    for name, fn in tests:
        try:
            fn()
            passed += 1
        except Exception:
            failed += 1
            print("FAIL %s" % name)
            print("".join("     " + l for l in
                          traceback.format_exc().splitlines(True)[-4:]))
    print("\n%d passed, %d failed" % (passed, failed))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
