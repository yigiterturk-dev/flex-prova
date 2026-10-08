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

Plans use each listing's IANA timezone and convert local check-in (15:00) and checkout (08:00) times to UTC. Modifications update scheduled plans; cancellations mark pending plans cancelled. Classification is deterministic and behind a `Classifier` interface, so an LLM adapter can be added without changing webhook or escalation logic. Unknown reservation messages never crash the service or create an orphan escalation.

## Trade-offs and next steps

The test suite uses the in-memory mode for isolation; production defaults to SQLite. SQLite is still single-process and the worker is intentionally lightweight. With another day I would move to Postgres for multi-instance operation, add a durable job queue, structured logs/metrics, operational auth, richer DST tests, and an LLM adapter with timeout and fallback.
