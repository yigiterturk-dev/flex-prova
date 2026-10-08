// Signs each fixture with WEBHOOK_SECRET and POSTs it to the running server, in file order.
// Fixtures marked `_tamper: true` are sent with a broken signature on purpose.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const base = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const secret = process.env.WEBHOOK_SECRET;
if (!secret) throw new Error("WEBHOOK_SECRET is required for replay");

const sign = (body: string) => createHmac("sha256", secret).update(body).digest("hex");

async function send(path: string, payload: Record<string, unknown>) {
  const { _tamper, ...clean } = payload;
  const body = JSON.stringify(clean);
  const good = sign(body);
  const signature = _tamper ? (good[0] === "0" ? "1" : "0") + good.slice(1) : good;
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": signature },
    body,
  });
  const id = clean.event_id ?? clean.message_id;
  console.log(`${path} ${id} -> ${res.status}`);
}

const load = (f: string) => JSON.parse(readFileSync(new URL(`../fixtures/${f}`, import.meta.url), "utf8"));

for (const evt of load("events.json")) await send("/webhooks/reservations", evt);
for (const msg of load("messages.json")) await send("/webhooks/messages", msg);
