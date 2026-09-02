"""Drain the queue: retry what is transient, dead-letter what is not.

    python worker.py --once        # process everything ready, then exit
    python worker.py               # poll forever
    python worker.py --dead        # list what gave up, and why

The decision this file exists to make is which failures are worth retrying. A 500
from downstream is. A 422 means the payload will never be accepted, and retrying
it eight times with exponential backoff only delays the alert by an hour.
"""

from __future__ import annotations

import argparse
import json
import random
import time

from store import Job, Store

MAX_ATTEMPTS = 6
BASE_DELAY = 2.0        # seconds
MAX_DELAY = 900.0       # 15 minutes


class Transient(Exception):
    """Worth retrying: a timeout, a 5xx, a rate limit, a closed connection."""


class Permanent(Exception):
    """Not worth retrying: a 4xx that is not 408 or 429, or bad data."""


def backoff(attempt: int) -> float:
    """Exponential, capped, with jitter.

    The jitter is not decoration. Without it, a downstream service that was down
    for two minutes receives every queued event at the same instant when it
    recovers, and goes down again. Multiplying by a random factor spreads the
    retries across the window instead.
    """
    ceiling = min(MAX_DELAY, BASE_DELAY * (2 ** attempt))
    return ceiling * random.uniform(0.5, 1.0)


def classify(status: int) -> type[Exception]:
    """Map an HTTP status onto the retry decision."""
    if status in (408, 425, 429) or status >= 500:
        return Transient
    if status >= 400:
        return Permanent
    return None


# -- the actual work ------------------------------------------------------

def process(job: Job) -> str:
    """Handle one event. Replace the body; keep the exception contract.

    Raise Transient to be retried with backoff, Permanent to be dead-lettered
    immediately. Returning normally completes the job.
    """
    event = job.event_type or "(untyped)"
    payload = job.payload

    if event in ("order.created", "order.updated"):
        order_id = payload.get("data", {}).get("order_id")
        if not order_id:
            # No amount of retrying will add the field.
            raise Permanent("order event with no order_id")
        return "upserted order %s" % order_id

    if event == "contact.unsubscribed":
        email = payload.get("data", {}).get("email", "")
        if "@" not in email:
            raise Permanent("unsubscribe with no usable address")
        return "suppressed %s" % email

    if event == "test.transient":
        raise Transient("deliberate transient failure, for the fixtures")

    # An unrecognised event type is not an error. Providers add event types, and
    # a worker that dead-letters everything new is a worker that pages you at
    # 3am because someone shipped a feature.
    return "ignored unrecognised event type %s" % event


# -- the loop -------------------------------------------------------------

def run_once(store: Store, batch: int = 20, verbose: bool = True) -> dict:
    stats = {"completed": 0, "retried": 0, "dead": 0}
    for job in store.lease(seconds=60.0, limit=batch):
        try:
            outcome = process(job)
        except Permanent as exc:
            store.fail(job, "permanent: %s" % exc, retry_in=None)
            stats["dead"] += 1
            if verbose:
                print("[dead] %s: %s" % (job.delivery_id, exc))
        except Transient as exc:
            if job.attempts + 1 >= MAX_ATTEMPTS:
                store.fail(job, "gave up after %d attempts: %s"
                           % (MAX_ATTEMPTS, exc), retry_in=None)
                stats["dead"] += 1
                if verbose:
                    print("[dead] %s: %s (max attempts)" % (job.delivery_id, exc))
            else:
                delay = backoff(job.attempts)
                store.fail(job, str(exc), retry_in=delay)
                stats["retried"] += 1
                if verbose:
                    print("[retry in %.0fs] %s: %s"
                          % (delay, job.delivery_id, exc))
        except Exception as exc:
            # An unexpected exception is treated as transient. A bug in process()
            # that is fixed and redeployed should not have cost you the events
            # that hit it.
            delay = backoff(job.attempts)
            store.fail(job, "unexpected: %r" % exc, retry_in=delay)
            stats["retried"] += 1
            if verbose:
                print("[retry in %.0fs] %s: unexpected %r"
                      % (delay, job.delivery_id, exc))
        else:
            store.complete(job)
            stats["completed"] += 1
            if verbose:
                print("[ok] %s: %s" % (job.delivery_id, outcome))
    return stats


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--once", action="store_true", help="drain and exit")
    ap.add_argument("--dead", action="store_true", help="list dead letters")
    ap.add_argument("--replay", metavar="DELIVERY_ID",
                    help="put one dead letter back on the queue")
    ap.add_argument("--interval", type=float, default=2.0)
    ap.add_argument("--db", default=None)
    args = ap.parse_args(argv)

    store = Store(args.db) if args.db else Store()
    try:
        if args.dead:
            rows = store.dead_letters()
            if not rows:
                print("no dead letters")
            for r in rows:
                print("%s  %-24s attempts=%d  %s"
                      % (r["delivery_id"], r["event_type"] or "-",
                         r["attempts"], (r["last_error"] or "")[:100]))
            return 0

        if args.replay:
            ok = store.replay_dead_letter(args.replay)
            print("requeued %s" % args.replay if ok else "no dead letter %s" % args.replay)
            return 0 if ok else 1

        if args.once:
            stats = run_once(store)
            print(json.dumps({**stats, **store.counts()}))
            return 0

        print("polling every %.1fs. Ctrl-C to stop." % args.interval)
        while True:
            if run_once(store)["completed"] == 0:
                time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nstopping")
        return 0
    finally:
        store.close()


if __name__ == "__main__":
    raise SystemExit(main())
