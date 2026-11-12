import "server-only";
import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { logger, errorInfo } from "@/lib/logger";

type Tx = Prisma.TransactionClient;

export type AuditEntry = {
  actorId: string | null;
  /** "<modulo>.<verbo>", ex.: "usuario.criar" */
  action: string;
  entity: string;
  entityId?: string | null;
  /** Frase legível que aparece na tela de auditoria. */
  summary: string;
  data?: Prisma.InputJsonValue;
};

async function clientIp() {
  try {
    const h = await headers();
    return h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    return null; // fora de uma requisição (seed, jobs)
  }
}

/**
 * Grava um registro de auditoria.
 * Passe `tx` para gravar na MESMA transação da alteração (recomendado: se a alteração falhar,
 * a auditoria também não fica). Toda alteração de dado de negócio deve chamar isto.
 */
export async function audit(entry: AuditEntry, tx: Tx = db) {
  try {
    await tx.auditLog.create({
      data: { ...entry, entityId: entry.entityId ?? null, ip: await clientIp() },
    });
  } catch (e) {
    // Fora de transação, falha de auditoria não derruba a operação, mas fica no log.
    if (tx !== db) throw e;
    logger.error("audit.failed", { ...errorInfo(e), action: entry.action });
  }
}

/** Diferença campo a campo entre dois objetos (para guardar em `data`). */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const changes: Record<string, { de: unknown; para: unknown }> = {};
  for (const k of Object.keys(after)) {
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[k] = { de: a ?? null, para: b ?? null };
  }
  // Ida e volta em JSON: datas viram texto e o resultado cabe no campo Json do Prisma.
  return JSON.parse(JSON.stringify(changes)) as Prisma.InputJsonObject;
}
