import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { GuestAutomationService, verifySignature } from "./service.js";

export function createApp(service = new GuestAutomationService(), secret = process.env.WEBHOOK_SECRET) {
  if (!secret) throw new Error("WEBHOOK_SECRET is required");
  const send = (res: ServerResponse, status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  const readBody = (req: IncomingMessage) => new Promise<string>((resolve, reject) => { let body = ""; let size = 0; req.setEncoding("utf8"); req.on("data", (chunk) => { size += Buffer.byteLength(chunk); if (size > 1_000_000) { reject(new Error("request body too large")); req.destroy(); } else body += chunk; }); req.on("end", () => resolve(body)); req.on("error", reject); });
  const isObject = (value: unknown): value is Record<string, any> => typeof value === "object" && value !== null && !Array.isArray(value);
  const validReservationEvent = (value: unknown) => isObject(value) && typeof value.event_id === "string" && typeof value.type === "string" && ["reservation.created", "reservation.modified", "reservation.cancelled"].includes(value.type) && typeof value.occurred_at === "string" && !Number.isNaN(Date.parse(value.occurred_at)) && isObject(value.data) && typeof value.data.reservation_id === "string" && Number.isInteger(value.data.version) && value.data.version >= 1;
  const validMessage = (value: unknown) => isObject(value) && typeof value.message_id === "string" && typeof value.reservation_id === "string" && typeof value.sent_at === "string" && !Number.isNaN(Date.parse(value.sent_at)) && typeof value.body === "string";
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "POST" && (url.pathname === "/webhooks/reservations" || url.pathname === "/webhooks/messages")) {
        const raw = await readBody(req);
        if (!verifySignature(raw, req.headers["x-signature"] as string | undefined, secret)) return send(res, 401, { error: "invalid signature" });
        const payload = JSON.parse(raw);
        if (url.pathname.endsWith("reservations")) { if (!validReservationEvent(payload)) return send(res, 400, { error: "invalid reservation event" }); service.handleReservationEvent(payload); }
        else { if (!validMessage(payload)) return send(res, 400, { error: "invalid message" }); service.handleMessage(payload); }
        return send(res, 202, { accepted: true });
      }
      const match = url.pathname.match(/^\/reservations\/([^/]+)$/);
      if (req.method === "GET" && match) { const result = service.getReservation(decodeURIComponent(match[1])); return result ? send(res, 200, result) : send(res, 404, { error: "reservation not found" }); }
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { status: "ok" });
      if (req.method === "GET" && url.pathname === "/escalations") return send(res, 200, service.getOpenEscalations());
      return send(res, 404, { error: "not found" });
    } catch (error) { console.error(error); return send(res, 400, { error: "invalid request" }); }
  });
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  const databasePath = process.env.DATABASE_PATH ?? "./data/guest-automation.sqlite";
  const service = new GuestAutomationService(undefined, databasePath);
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const server = createApp(service, webhookSecret).listen(port, () => console.log(`Guest automation service listening on :${port}`));
  const interval = Number(process.env.WORKER_INTERVAL_MS ?? 0);
  if (interval > 0) setInterval(() => { for (const message of service.processDueMessages()) console.log(`sent planned message ${message.id}`); }, interval).unref();
  const shutdown = () => { service.close(); server.close(() => process.exit(0)); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

export { GuestAutomationService } from "./service.js";
