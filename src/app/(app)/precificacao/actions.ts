"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { runAction, type FormState } from "@/lib/action-result";
import { parseMoneyBR } from "@/lib/importacao/csv";
import { alterarPreco, atualizarPrecosPlanilha } from "@/modules/produtos/precificacao.service";
import { lerPlanilhaPrecos } from "@/modules/produtos/precos-planilha";
import { DomainError } from "@/lib/errors";

export async function salvarPrecoAction(produtoId: string, _: FormState, form: FormData): Promise<FormState> {
  const me = await requirePermission("produtos.precificar");
  return runAction("produto.preco", async () => {
    const r = await alterarPreco(me, produtoId, parseMoneyBR(String(form.get("valor") ?? "")), String(form.get("motivo") ?? ""));
    revalidatePath("/precificacao");
    revalidatePath("/relatorios");
    return { ok: true, message: r.mudou ? "Preço atualizado." : "O preço já era esse." };
  });
}

/** Atualiza os preços a partir de uma planilha CSV (código e preço, ou a planilha de estoque com ValorMedio). */
export async function importarPrecosAction(_: FormState, form: FormData): Promise<FormState> {
  const me = await requirePermission("produtos.precificar");
  return runAction("produto.preco.planilha", async () => {
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new DomainError("Escolha a planilha (CSV).");
    if (arquivo.size > 5 * 1024 * 1024) throw new DomainError("A planilha passa de 5 MB.");
    const lida = lerPlanilhaPrecos(new Uint8Array(await arquivo.arrayBuffer()));
    if (lida.erro) throw new DomainError(lida.erro);
    const r = await atualizarPrecosPlanilha(me, lida.linhas, `Planilha ${arquivo.name}`.slice(0, 200));
    revalidatePath("/precificacao");
    revalidatePath("/relatorios");
    const erros = r.erros.length ? ` Com erro: ${r.erros.slice(0, 8).map((e) => `${e.codigo} (linha ${e.line})`).join(", ")}${r.erros.length > 8 ? "…" : ""}.` : "";
    return { ok: true, message: `Preços da planilha: ${r.atualizados} atualizado(s), ${r.iguais} sem mudança, ${lida.ignoradas} linha(s) sem preço ignorada(s), ${r.erros.length} com erro.${erros}` };
  });
}
