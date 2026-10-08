# Operations Runbook

## Start and health

Copy `.env.example` to `.env`, replace the example with a private `WEBHOOK_SECRET`, then run `npm ci` and `npm run dev` (or `npm run build && node dist/src/index.js`). The server refuses to start without `WEBHOOK_SECRET`. Check `GET /health` after startup. Keep `DATABASE_PATH` on durable storage and enable the worker with `WORKER_INTERVAL_MS=60000` when due-message processing is wanted.

## Backup and restore

Stop the process before copying the SQLite database, or use SQLite's online backup tooling. Preserve the database and its `-wal`/`-shm` files together when using WAL mode. To restore, replace the configured database file while the service is stopped, then start the service and verify `/health` and a known reservation read.

## Shutdown and rollback

Send `SIGTERM` or `SIGINT`; the service closes SQLite before exiting. Roll back by stopping the process, restoring the previous application artifact and database backup, then running the health check and a read-only reservation check. Do not replay historical webhooks until the restored version and dedupe state have been verified.

## Failure notes

Invalid signatures return `401`; malformed signed payloads return `400`. A missing or unwritable database path prevents safe startup and should be fixed rather than falling back to memory. The worker is single-process and logs each message it marks `sent`.
