# Integrations

The parts every webhook integration needs and most skip: verifying the signature,
not processing the same delivery twice, and retrying only what is worth retrying.

```
integrations/
├── webhook_receiver.py    verify, deduplicate, enqueue, respond fast
├── worker.py              process the queue, with backoff and a dead letter
├── store.py               SQLite-backed idempotency and queue, swappable
└── test_integrations.py   the failure paths, not the happy one
```

Runs on the standard library. No framework, no broker, no cloud account:

```bash
cd integrations
python webhook_receiver.py            # listens on :8080
python worker.py --once               # drain the queue
python test_integrations.py           # 20 tests, no dependencies
```

## The four rules

**1. Verify the signature before you parse the body.**
Parsing first means your JSON parser is the first thing an unauthenticated
attacker reaches. `verify_signature()` runs on raw bytes, uses
`hmac.compare_digest` rather than `==`, and rejects a timestamp outside a
five-minute window so a captured delivery cannot be replayed a week later.

Comparing signatures with `==` leaks the correct value one byte at a time through
timing. This is not theoretical for an endpoint an attacker can call in a loop.

**2. Respond in milliseconds, process afterwards.**
The receiver writes the delivery to a queue and returns 202. It does not call
your database, your CRM or the sender's API first. Providers time out between one
and ten seconds and then retry, so slow processing inside the handler turns one
event into five duplicates and eventually gets your endpoint disabled.

**3. Deduplicate on the provider's delivery id, not on the payload.**
Every provider retries, and at-least-once delivery is the contract you are
actually given. `store.claim()` inserts the delivery id under a unique constraint
and returns False if it is already there, so the second copy is acknowledged and
dropped. Hashing the body instead is wrong: two genuinely different events can
carry identical payloads a second apart.

**4. Retry what is transient. Dead-letter what is not.**
A 500 from downstream is worth retrying. A 422 means the payload will never be
accepted, and retrying it eight times with exponential backoff just delays the
alert by an hour. The worker classifies before it retries, and gives up into a
dead-letter table that records the last error rather than deleting the event.

## Backoff, and why it has jitter

```python
delay = min(MAX_DELAY, BASE * (2 ** attempt)) * random.uniform(0.5, 1.0)
```

Without the random factor, a downstream service that was down for two minutes
gets every queued event at the same instant when it recovers, and goes down
again. This is the thundering-herd failure, and the fix is one multiplication.

## What this is not

It is not a message broker. `store.py` is SQLite because that makes the whole
thing runnable in one command with nothing installed, and because the semantics
are easier to read in 200 lines of SQL than in a broker's configuration. The
interface is small on purpose: `claim`, `enqueue`, `lease`, `complete`, `fail`.
Swapping in Postgres is a connection change; swapping in SQS or Redis is
implementing those five methods.

For real volume, use a real broker. Use this to understand what the broker is
doing for you, and to run a small integration without operating one.

## Prior art

Signature verification with a timestamp window and constant-time comparison is
the scheme Stripe, GitHub and Slack all document for their own webhooks, and the
implementation here follows that published shape. Idempotency keys and the
lease-based queue are ordinary patterns. The code is written for this repository.
