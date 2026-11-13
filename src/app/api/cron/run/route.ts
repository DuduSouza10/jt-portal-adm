import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { runScheduledJobs } from "@/lib/jobs/run";

// Chamado pelo agendador (Netlify Scheduled Function) a cada 15 min em horário comercial.
// Protegido por CRON_SECRET: Authorization: Bearer <segredo>.
export const maxDuration = 26;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  await connection();
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await runScheduledJobs());
}
