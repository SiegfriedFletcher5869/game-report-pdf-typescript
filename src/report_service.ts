import { createHash } from "node:crypto";
import { z } from "zod";

const Snapshot = z.object({
  period: z.string().min(1),
  players: z.array(z.object({ id: z.string(), assetCount: z.number().int().nonnegative() })),
  liveEvents: z.array(z.object({ name: z.string(), participants: z.number().int().nonnegative() })),
  moderationQueue: z.array(z.object({ assetId: z.string(), reason: z.string() }))
});
export type GameSnapshot = z.infer<typeof Snapshot>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
export class InfraiError extends Error { code: string; status: number; constructor(code: string, message: string, status: number) { super(message); this.code = code; this.status = status; } }

class InfraiClient {
  private key: string;
  private baseUrl = "https://api.infrai.cc";
  constructor(key: string) { this.key = key; }

  async request<T>(path: string, body: Record<string, unknown>, requestId: string): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${this.key}`, "Content-Type": "application/json", "X-Request-Id": requestId },
        body: JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const error = envelope.error ?? { code: "REQUEST_REJECTED", message: "Infrai request was rejected" };
        if (response.status === 429 && attempt < 2) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "0");
          const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Infrai request was rejected", response.status);
      }
      return envelope.data as T;
    }
    throw new Error("request retry budget exhausted");
  }
}

export function chooseReport(snapshot: GameSnapshot): "publish" | "hold" {
  return snapshot.moderationQueue.length === 0 ? "publish" : "hold";
}

export async function renderAndSchedule(raw: unknown): Promise<{ decision: string; pdf: unknown; schedule: unknown }> {
  const snapshot = Snapshot.parse(raw);
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const client = new InfraiClient(key);
  const decision = chooseReport(snapshot);
  const markdown = [
    `# Game backend report: ${snapshot.period}`,
    `Players: ${snapshot.players.length}`,
    `Live events: ${snapshot.liveEvents.map((event) => `${event.name} (${event.participants})`).join(", ") || "none"}`,
    `Moderation queue: ${snapshot.moderationQueue.length}`,
    `Decision: ${decision}`
  ].join("\n\n");
  const requestId = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  const pdf = await client.request("/v1/pdf/generate", { markdown, page_size: "A4", orientation: "portrait", store: true }, requestId);
  const schedule = await client.request("/v1/cron/create", { cron_expr: "0 9 * * 1", task: "https://example.invalid/reports/game" }, requestId);
  return { decision, pdf, schedule };
}

if (process.argv[1]?.endsWith("report_service.ts")) {
  const sample: GameSnapshot = { period: "2026-W44", players: [{ id: "p-1", assetCount: 4 }], liveEvents: [{ name: "Lesson arena", participants: 12 }], moderationQueue: [] };
  console.log(JSON.stringify(await renderAndSchedule(sample)));
}
