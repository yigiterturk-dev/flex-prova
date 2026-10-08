import { createHmac, timingSafeEqual } from "node:crypto";

export type ReservationStatus = "confirmed" | "cancelled";
export type PlannedMessageStatus = "scheduled" | "cancelled" | "sent";
export type MessageKind = "welcome" | "checkin_instructions" | "checkout_reminder";
export type Classification = "question" | "maintenance" | "complaint" | "other";

export interface Reservation { id: string; version: number; status: ReservationStatus; channel: string; listing: { id: string; timezone: string }; guest: { name: string; phone: string }; check_in: string; check_out: string }
export interface PlannedMessage { id: string; reservation_id: string; kind: MessageKind; send_at: string; status: PlannedMessageStatus }
export interface Escalation { id: string; reservation_id: string; message_id: string; reason: "urgent" | "complaint" | "urgent_and_complaint"; status: "open" | "resolved"; body: string }
export interface InboundMessage { message_id: string; reservation_id: string; sent_at: string; body: string }
export interface ClassifierResult { classification: Classification; urgent: boolean }
export interface Classifier { classify(body: string): ClassifierResult }

export class FallbackClassifier implements Classifier {
  classify(body: string): ClassifierResult {
    const text = body.toLowerCase();
    const urgent = /urgent|emergency|leak|leaking|locked out|lock(ed)? out|fire|gas|danger|no water|getting worse/.test(text);
    const complaint = /refund|not clean|dirty|complaint|disappoint|terrible|awful|expect a partial/.test(text);
    const maintenance = /broken|leak|leaking|heating|toilet|plumb|key code|wifi|wi-fi|water/.test(text);
    const question = /\?|\b(can|could|where|what|when|how|is there|do you)\b/.test(text);
    return { classification: complaint ? "complaint" : maintenance ? "maintenance" : question ? "question" : "other", urgent };
  }
}

function localDateTimeToUtc(date: string, hour: number, minute: number, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(target));
  const values = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
  const observed = Date.UTC(values.year, values.month - 1, values.day, values.hour === 24 ? 0 : values.hour, values.minute);
  return new Date(target + (target - observed));
}

export function verifySignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class GuestAutomationService {
  private reservations = new Map<string, Reservation>();
  private messages = new Map<string, PlannedMessage>();
  private escalations = new Map<string, Escalation>();
  private processedEvents = new Set<string>();
  private processedMessages = new Set<string>();
  constructor(private classifier: Classifier = new FallbackClassifier()) {}

  handleReservationEvent(event: { event_id: string; type: string; occurred_at: string; data: Reservation & { reservation_id: string } }): void {
    if (!["reservation.created", "reservation.modified", "reservation.cancelled"].includes(event.type)) return;
    if (this.processedEvents.has(event.event_id)) return;
    this.processedEvents.add(event.event_id);
    const incoming = event.data; const id = incoming.reservation_id; const current = this.reservations.get(id);
    if (current && incoming.version <= current.version) return;
    const reservation: Reservation = { id, version: incoming.version, status: event.type === "reservation.cancelled" ? "cancelled" : incoming.status, channel: incoming.channel, listing: incoming.listing, guest: incoming.guest, check_in: incoming.check_in, check_out: incoming.check_out };
    this.reservations.set(id, reservation);
    if (reservation.status === "cancelled") this.cancelPending(id); else this.planMessages(reservation, event.occurred_at);
  }

  handleMessage(message: InboundMessage): void {
    if (this.processedMessages.has(message.message_id)) return;
    this.processedMessages.add(message.message_id);
    const result = this.classifier.classify(message.body);
    if ((result.urgent || result.classification === "complaint") && this.reservations.has(message.reservation_id)) {
      const reason = result.urgent && result.classification === "complaint" ? "urgent_and_complaint" : result.urgent ? "urgent" : "complaint";
      const id = `esc_${message.message_id}`;
      this.escalations.set(id, { id, reservation_id: message.reservation_id, message_id: message.message_id, reason, status: "open", body: message.body });
    }
  }

  private planMessages(r: Reservation, createdAt: string): void {
    const sends: Array<[MessageKind, Date]> = [["checkin_instructions", localDateTimeToUtc(r.check_in, 15, 0, r.listing.timezone)], ["checkout_reminder", localDateTimeToUtc(r.check_out, 8, 0, r.listing.timezone)]];
    if (!this.messages.has(`plan_${r.id}_welcome`)) this.messages.set(`plan_${r.id}_welcome`, { id: `plan_${r.id}_welcome`, reservation_id: r.id, kind: "welcome", send_at: new Date(createdAt).toISOString(), status: "scheduled" });
    for (const [kind, sendAt] of sends) {
      const id = `plan_${r.id}_${kind}`; const existing = this.messages.get(id);
      if (!existing || existing.status === "cancelled") this.messages.set(id, { id, reservation_id: r.id, kind, send_at: sendAt.toISOString(), status: "scheduled" });
      else if (existing.status === "scheduled") existing.send_at = sendAt.toISOString();
    }
  }
  private cancelPending(id: string): void { for (const message of this.messages.values()) if (message.reservation_id === id && message.status === "scheduled") message.status = "cancelled"; }
  getReservation(id: string) { const reservation = this.reservations.get(id); return reservation ? { reservation, planned_messages: [...this.messages.values()].filter((m) => m.reservation_id === id), escalations: [...this.escalations.values()].filter((e) => e.reservation_id === id) } : undefined; }
  getOpenEscalations() { return [...this.escalations.values()].filter((e) => e.status === "open"); }
}
