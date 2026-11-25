"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { runAction, firstIssue, type FormState } from "@/lib/action-result";
import { pickClientIp } from "@/lib/client-ip";
import { createSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { cadastroSchema } from "@/modules/acessos/cadastro";
import { criarContaFranquia } from "@/modules/acessos/cadastro.service";

/** Tela pública "Criar conta" (só franquias). Cria a conta, já entra e leva para o início. */
export async function cadastroAction(_: FormState, form: FormData): Promise<FormState> {
  const parsed = cadastroSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const h = await headers();
  const ip = pickClientIp((n) => h.get(n), process.env);

  const r = await runAction("cadastro", async () => {
    const user = await criarContaFranquia(parsed.data, ip);
    await createSession(user.id);
    logger.info("cadastro.ok", { userId: user.id });
  }, { uniqueMessage: "Esse usuário já existe. Escolha outro." });
  if (r.error) return r;
  redirect("/");
}
