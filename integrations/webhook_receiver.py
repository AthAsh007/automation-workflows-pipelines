"""A webhook receiver that verifies, deduplicates, enqueues and gets out of the way.

    WEBHOOK_SECRET=whsec_test python webhook_receiver.py

Standard library only, so it runs anywhere Python does. The HTTP server is
`http.server`, which is fine for a single integration and is not a production web
server; put this behind gunicorn, uvicorn or your framework of choice when the
volume justifies it. The three things worth copying are above the server class
and have nothing to do with which framework you use.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

from store import Store

SECRET = os.environ.get("WEBHOOK_SECRET", "")
TOLERANCE_SECONDS = int(os.environ.get("WEBHOOK_TOLERANCE", "300"))
MAX_BODY_BYTES = int(os.environ.get("WEBHOOK_MAX_BODY", str(1024 * 1024)))


class SignatureError(Exception):
    """Rejected before parsing. The message is for the log, not the response."""


def verify_signature(raw_body: bytes, timestamp: str, signature: str,
                     secret: str = SECRET,
                     tolerance: int = TOLERANCE_SECONDS) -> None:
    """Verify an HMAC-SHA256 signature over `timestamp.body`.

    Raises SignatureError. Called on raw bytes, before any parsing, so that an
    unauthenticated caller never reaches the JSON parser.

    Signing `timestamp.body` rather than `body` alone is what makes the timestamp
    tamper-proof; signing the body alone lets an attacker replay a captured
    request forever by supplying any timestamp they like.
    """
    if not secret:
        raise SignatureError("no WEBHOOK_SECRET configured; refusing to accept")
    if not timestamp or not signature:
        raise SignatureError("missing timestamp or signature header")

    try:
        sent_at = int(timestamp)
    except ValueError:
        raise SignatureError("timestamp is not an integer")

    drift = abs(time.time() - sent_at)
    if drift > tolerance:
        # A valid signature on a two-week-old body is still a replay.
        raise SignatureError("timestamp is %.0fs outside the %ds window"
                             % (drift, tolerance))

    expected = hmac.new(secret.encode("utf-8"),
                        timestamp.encode("utf-8") + b"." + raw_body,
                        hashlib.sha256).hexdigest()

    # compare_digest, not ==. String comparison returns on the first differing
    # byte, and the timing difference is measurable by anyone who can call this
    # endpoint in a loop, which is everyone.
    if not hmac.compare_digest(expected, signature.strip()):
        raise SignatureError("signature mismatch")


def sign(raw_body: bytes, timestamp: str, secret: str = SECRET) -> str:
    """The other half, for tests and for anything sending to this endpoint."""
    return hmac.new(secret.encode("utf-8"),
                    timestamp.encode("utf-8") + b"." + raw_body,
                    hashlib.sha256).hexdigest()


def handle_delivery(store: Store, source: str, delivery_id: str,
                    event_type: str, payload: dict) -> tuple[int, str]:
    """Deduplicate and enqueue. Returns (status, message).

    Nothing here talks to a database that is not this one, calls an API, or does
    any work the sender is waiting for. Providers time out between one and ten
    seconds and then retry, so slow work in the handler turns one event into five
    duplicates and eventually gets the endpoint disabled.
    """
    if not store.claim(delivery_id, source, event_type):
        # Already seen. 200, not an error: the provider did the right thing by
        # retrying, and telling it otherwise makes it retry more.
        return 200, "duplicate delivery, already accepted"

    store.enqueue(delivery_id, source, event_type, payload)
    return 202, "accepted"


class Handler(BaseHTTPRequestHandler):
    server_version = "webhook-receiver/1.0"
    store: Store = None            # set in serve()

    def _respond(self, status: int, message: str) -> None:
        body = json.dumps({"status": status, "message": message}).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if self.path.rstrip("/") not in ("/webhook", "/webhooks"):
            self._respond(404, "not found")
            return

        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY_BYTES:
            # Refuse before reading. An unauthenticated caller should not be able
            # to make this process allocate an arbitrary amount of memory.
            self._respond(413, "body too large")
            return
        raw = self.rfile.read(length)

        try:
            verify_signature(raw,
                             self.headers.get("X-Webhook-Timestamp", ""),
                             self.headers.get("X-Webhook-Signature", ""))
        except SignatureError as exc:
            # Log the detail, return a generic message. Telling a caller which
            # part of their forgery was wrong is free help.
            self.log_message("rejected: %s", exc)
            self._respond(401, "invalid signature")
            return

        try:
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("body is not a JSON object")
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            self._respond(400, "malformed body: %s" % exc)
            return

        delivery_id = (self.headers.get("X-Webhook-Delivery")
                       or payload.get("id") or "")
        if not delivery_id:
            # Without an id there is no way to deduplicate, and the provider's
            # retries would each be processed. Better to refuse than to guess.
            self._respond(400, "missing delivery id")
            return

        status, message = handle_delivery(
            self.store,
            source=self.headers.get("X-Webhook-Source", "unknown"),
            delivery_id=str(delivery_id),
            event_type=str(payload.get("type") or payload.get("event") or ""),
            payload=payload)
        self._respond(status, message)

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/health":
            self._respond(200, json.dumps(self.store.counts()))
        else:
            self._respond(404, "not found")

    def log_message(self, fmt, *args):
        print("[receiver] " + (fmt % args))


def serve(port: int = 8080, db_path: str = None) -> None:
    Handler.store = Store(db_path) if db_path else Store()
    server = HTTPServer(("127.0.0.1", port), Handler)
    print("listening on http://127.0.0.1:%d/webhook" % port)
    print("health at   http://127.0.0.1:%d/health" % port)
    if not SECRET:
        print("WEBHOOK_SECRET is not set. Every delivery will be rejected.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping")
    finally:
        Handler.store.close()


if __name__ == "__main__":
    serve(int(os.environ.get("PORT", "8080")))
