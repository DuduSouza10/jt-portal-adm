"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { runAction, type FormState } from "@/lib/action-result";
import { parseMoneyBR } from "@/lib/importacao/csv";
import { alterarPreco } from "@/modules/produtos/precificacao.service";

export async function salvarPrecoAction(produtoId: string, _: FormState, form: FormData): Promise<FormState> {
  const me = await requirePermission("produtos.precificar");
  return runAction("produto.preco", async () => {
    const r = await alterarPreco(me, produtoId, parseMoneyBR(String(form.get("valor") ?? "")), String(form.get("motivo") ?? ""));
    revalidatePath("/precificacao");
    revalidatePath("/relatorios");
    return { ok: true, message: r.mudou ? "Preço atualizado." : "O preço já era esse." };
  });
}
