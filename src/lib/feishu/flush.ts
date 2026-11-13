import "server-only";
import { after } from "next/server";
import { processOutbox } from "@/lib/feishu/outbox";
import { errorInfo, logger } from "@/lib/logger";

/**
 * Tenta enviar os avisos do Feishu logo depois da resposta ao usuário (não atrasa a tela).
 * Chame nas actions/rotas depois de um evento. O que falhar fica na fila e o agendador tenta de novo.
 */
export function flushFeishuSoon() {
  try {
    after(async () => {
      try {
        await processOutbox();
      } catch (e) {
        logger.error("feishu.outbox.flush_failed", errorInfo(e));
      }
    });
  } catch {
    // Fora de uma requisição (testes, scripts): o agendador envia depois.
  }
}
