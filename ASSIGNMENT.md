# Practice Assessment — Guest Automation Service

> ⏱ **Time limit: 2 hours.** Start your timer when you open this file.
> Commit early and often — we read your commit history.
> AI tools are allowed, but you must be able to explain every line in the follow-up interview.

## Context

We run ~300 short-term rental units across London, Dublin and Athens. Reservations
come in from channels (Airbnb, Booking.com, direct) as **webhooks**. Guests message us
constantly. We want a small service that reacts to these events automatically so our
ops team only touches what actually needs a human.

You are building the first version of that service.

## What you get

```
fixtures/events.json     # reservation webhooks, in the order we send them
fixtures/messages.json   # inbound guest messages
scripts/replay.ts        # signs & POSTs the fixtures to your server
.env.example
```

Run `npm install`, then `npm run dev` for your server and `npm run replay` in another shell.

## Requirements

### Core (must have)

1. **Reservation webhook** — `POST /webhooks/reservations`
   - Verify the `X-Signature` header: hex `HMAC-SHA256(WEBHOOK_SECRET, rawBody)`.
     Reject invalid signatures with `401`.
   - Handle `reservation.created`, `reservation.modified`, `reservation.cancelled`.
   - Webhooks can be **delivered more than once** and **out of order**. Your final state
     must be correct regardless. (Hint: look at `event_id`, `version`.)

2. **Scheduled guest messages** — for every active reservation, the service plans:
   - `welcome` — immediately when the reservation is created
   - `checkin_instructions` — 24h before check-in (check-in time is 15:00 local)
   - `checkout_reminder` — 08:00 local on the check-out day

   You do **not** need to actually send anything. Store the planned messages with their
   `send_at` (UTC) and a status (`scheduled | cancelled | sent`).
   Modifying dates must reschedule; cancelling must cancel pending messages.
   Watch the time zones: each listing has its own.

3. **Inbound guest messages** — `POST /webhooks/messages` (same signature scheme)
   - Classify each message into one of: `question`, `maintenance`, `complaint`, `other`,
     plus `urgent: boolean`.
   - Anything `urgent`, or any `complaint`, must create an **escalation** for the ops team.
   - Classification must go behind an interface. An LLM implementation is welcome,
     but the service **and the tests** must work with no API key (fallback implementation).
   - Messages for unknown reservations must not crash the service.

4. **Read API** — `GET /reservations/:id` returns the reservation, its planned
   messages and its escalations. `GET /escalations?status=open` lists open escalations.

5. **Tests** — cover at least: signature verification, duplicate + out-of-order delivery,
   rescheduling on modify, cancellation, escalation rules.

### Stretch (only if core is solid)

- Persist to SQLite instead of memory.
- A worker loop that "sends" due messages (log them) and marks them `sent`.
- Swap the fallback classifier for a real LLM call with a timeout + fallback on failure.

## Deliverables

- Your code in this repo, with a meaningful commit history.
- `README.md`: how to run, the main design decisions, trade-offs, and what you would do
  next with another day.

## How we review

We care more about **correctness under messy input**, clarity and judgement than about
the number of features. A small, correct, well-tested core beats a large, fragile one.
