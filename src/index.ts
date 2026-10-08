import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { GuestAutomationService, verifySignature } from "./service.js";

export function createApp(service = new GuestAutomationService(), secret = process.env.WEBHOOK_SECRET ?? "whsec_practice_123") {
  const send = (res: ServerResponse, status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  const readBody = (req: IncomingMessage) => new Promise<string>((resolve, reject) => { let body = ""; req.setEncoding("utf8"); req.on("data", (chunk) => body += chunk); req.on("end", () => resolve(body)); req.on("error", reject); });
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "POST" && (url.pathname === "/webhooks/reservations" || url.pathname === "/webhooks/messages")) {
        const raw = await readBody(req);
        if (!verifySignature(raw, req.headers["x-signature"] as string | undefined, secret)) return send(res, 401, { error: "invalid signature" });
        const payload = JSON.parse(raw);
        if (url.pathname.endsWith("reservations")) service.handleReservationEvent(payload); else service.handleMessage(payload);
        return send(res, 202, { accepted: true });
      }
      const match = url.pathname.match(/^\/reservations\/([^/]+)$/);
      if (req.method === "GET" && match) { const result = service.getReservation(decodeURIComponent(match[1])); return result ? send(res, 200, result) : send(res, 404, { error: "reservation not found" }); }
      if (req.method === "GET" && url.pathname === "/escalations") return send(res, 200, service.getOpenEscalations());
      return send(res, 404, { error: "not found" });
    } catch (error) { console.error(error); return send(res, 400, { error: "invalid request" }); }
  });
}

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, () => console.log(`Guest automation service listening on :${port}`));
}

export { GuestAutomationService } from "./service.js";
