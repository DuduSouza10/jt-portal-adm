import { connection } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  await connection();
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", db: "ok", latencyMs: Date.now() - started });
  } catch {
    return Response.json({ status: "error", db: "down" }, { status: 503 });
  }
}
