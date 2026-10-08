# Guest Automation Service

## Run

```bash
npm install
npm run dev
# another terminal
WEBHOOK_SECRET=your-secret npm run replay
```

The port defaults to `3000`. `WEBHOOK_SECRET` is required for the server and has no production fallback; use the fixture value from `.env.example` only for the local replay. Node.js `>=22.5.0` is required for the built-in `node:sqlite` driver. Run `npm run verify` for the complete local quality gate.

Routes are `POST /webhooks/reservations`, `POST /webhooks/messages`, `GET /reservations/:id`, `GET /escalations?status=open`, and `GET /health`. Both webhook routes require the lowercase hex HMAC in `X-Signature`.

The server persists state to SQLite at `DATABASE_PATH` (default `./data/guest-automation.sqlite`), including dedupe keys. An optional worker can be enabled with `WORKER_INTERVAL_MS=60000 npm run dev`. It logs and marks due scheduled messages as `sent`; without this variable the service only plans messages.

## Design decisions

The HTTP layer preserves the raw request body for HMAC-SHA256 verification and rejects invalid requests before parsing them. Tests use an in-memory service for isolation; the server stores reservations, plans, escalations, and processed IDs in SQLite. Reservation versions are monotonic per reservation; duplicate event IDs and stale versions are ignored, so retries and out-of-order delivery cannot regress state.

Plans use each listing's IANA timezone and convert local check-in (15:00) and checkout (08:00) times to UTC. The check-in instructions are scheduled exactly 24 hours before that UTC instant; this is intentional around DST transitions, where “the previous local day at 15:00” can differ. Modifications update scheduled plans; cancellations mark pending plans cancelled. Classification is deterministic and behind a `Classifier` interface, so an LLM adapter can be added without changing webhook or escalation logic. Unknown reservation messages create an `unknown_reservation` escalation so an urgent message cannot disappear silently.

## Decisions

- Check-in instructions use the exact instant 24 hours before local 15:00 converted to UTC, rather than subtracting one calendar day in local time.
- A message for an unknown reservation is retained as an escalation and is not treated as successfully handled by silently dropping it.
- SQLite dedupe claims use `INSERT OR IGNORE` against unique keys, so concurrent service instances cannot both claim the same event or message.

## Trade-offs and next steps

The test suite uses the in-memory mode for isolation; production defaults to SQLite. SQLite is still single-process and the worker is intentionally lightweight. With another day I would move to Postgres for multi-instance operation, add a durable job queue, structured logs/metrics, operational auth, richer DST tests, and an LLM adapter with timeout and fallback.
