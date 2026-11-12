import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError } from "@/lib/errors";
import { errorInfo, logger } from "@/lib/logger";

/** Estado devolvido pelas server actions de formulário (usado pelo <ActionForm>). */
export type FormState = { error?: string; ok?: boolean; message?: string };

export const isUniqueError = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Banco ocupado demais (fila de transações estourou o tempo). Com muitos usuários, acontece em picos. */
const isBusyError = (e: unknown) =>
  (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028") ||
  (e instanceof Error && /Unable to start a transaction in the given time/i.test(e.message));

/**
 * Executa o corpo de uma server action e converte erros em mensagem amigável.
 * - DomainError → mensagem dele
 * - unique constraint → `uniqueMessage`
 * - redirect()/notFound() → propagam normalmente
 * - qualquer outro → loga e mostra "Erro inesperado"
 */
export async function runAction(
  name: string,
  fn: () => Promise<FormState | void>,
  opts: { uniqueMessage?: string } = {},
): Promise<FormState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    if (opts.uniqueMessage && isUniqueError(e)) return { error: opts.uniqueMessage };
    if (isBusyError(e)) {
      logger.warn(`action.${name}.busy`, errorInfo(e));
      return { error: "O sistema está ocupado agora. Nada foi alterado; tente de novo em alguns segundos." };
    }
    // redirect()/notFound() lançam erros especiais que precisam propagar.
    if (e && typeof e === "object" && "digest" in e) throw e;
    logger.error(`action.${name}`, errorInfo(e));
    return { error: "Erro inesperado. Tente novamente." };
  }
}

export const firstIssue = (e: { issues: { message: string }[] }) => e.issues[0]?.message ?? "Dados inválidos.";
