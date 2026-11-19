"use server";

import { requirePermission } from "@/lib/auth/session";
import { DomainError } from "@/lib/errors";
import { logger, errorInfo } from "@/lib/logger";
import { parseScan } from "@/modules/solicitacoes/rules";
import { lookupParaEnvio } from "@/modules/solicitacoes/service";

export type ScanResult = { ok: true; id: string } | { ok: false; error: string };

/** Bipou a guia: acha o pedido e diz se ele pode ser enviado agora. */
export async function lookupScanAction(raw: string): Promise<ScanResult> {
  const user = await requirePermission("expedicao.enviar");
  const code = parseScan(String(raw).slice(0, 300));
  if (!code) return { ok: false, error: "Código não reconhecido. Bipe o QR da guia ou digite o nº do pedido (SOL-000123)." };
  try {
    return { ok: true, id: await lookupParaEnvio(user, code) };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    logger.error("expedicao.lookup", errorInfo(e));
    return { ok: false, error: "Erro inesperado. Tente novamente." };
  }
}
