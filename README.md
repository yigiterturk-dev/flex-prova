# Guest Automation Service

## Run

```bash
npm install
npm run dev
# another terminal
npm run replay
```

Defaults are port `3000` and `WEBHOOK_SECRET=whsec_practice_123`. Validate with `npm test` and `npm run typecheck`.

## Design decisions

The HTTP layer preserves the raw request body for HMAC-SHA256 verification and rejects invalid requests before parsing them. The domain service stores reservations, plans, escalations, and processed IDs in memory. Reservation versions are monotonic per reservation; duplicate event IDs and stale versions are ignored, so retries and out-of-order delivery cannot regress state.

Plans use each listing's IANA timezone and convert local check-in (15:00) and checkout (08:00) times to UTC. Modifications update scheduled plans; cancellations mark pending plans cancelled. Classification is deterministic and behind a `Classifier` interface, so an LLM adapter can be added without changing webhook or escalation logic. Unknown reservation messages never crash the service or create an orphan escalation.

## Trade-offs and next steps

Memory keeps the core small but loses state on restart and is not suitable for multiple instances. With another day I would add SQLite/Postgres with unique event/message constraints, a durable worker queue, structured logs/metrics, operational auth, richer DST tests, and an LLM adapter with timeout and fallback.
