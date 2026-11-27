"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth/session";
import { canAccessBase } from "@/lib/permissions/check";
import { firstIssue, runAction, type FormState } from "@/lib/action-result";
import { DomainError } from "@/lib/errors";
import { diaDeHoje } from "@/modules/solicitacoes/limites";

// Liberar ou mudar a data do ciclo da base (S1) e dos bloqueios de produto (S3). Como o Dev no sistema do Eduardo.

const schema = z.object({
  tipo: z.enum(["ciclo", "bloqueio"]),
  id: z.string().min(1),
  acao: z.enum(["liberar", "data"]),
  // Data final (AAAA-MM-DD): vale até o fim do dia em São Paulo.
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.").optional(),
});

export async function ajustarCicloAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requirePermission("solicitacoes.liberar");
  const p = schema.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: firstIssue(p.error) };
  const { tipo, id, acao, ate } = p.data;
  if (acao === "data" && !ate) return { error: "Informe uma data válida." };
  const until = ate ? new Date(`${ate}T23:59:59-03:00`) : null;

  const r = await runAction("solicitacao.ciclo", async () => {
    await db.$transaction(async (tx) => {
      const data = acao === "liberar" ? { revokedAt: new Date(), updatedById: user.id } : { blockedUntil: until!, revokedAt: null, updatedById: user.id };
      let alvo: string;
      if (tipo === "ciclo") {
        const row = await tx.cicloBase.findUnique({ where: { baseId: id }, include: { base: true } });
        if (!row || !canAccessBase(user, row.base)) throw new DomainError("Registro não encontrado.");
        await tx.cicloBase.update({ where: { baseId: id }, data });
        alvo = `ciclo da base ${row.base.code}`;
      } else {
        const row = await tx.bloqueioProduto.findUnique({ where: { id }, include: { base: true, produto: true } });
        if (!row || !canAccessBase(user, row.base)) throw new DomainError("Registro não encontrado.");
        await tx.bloqueioProduto.update({ where: { id }, data });
        alvo = `bloqueio de ${row.produto.code} em ${row.base.code}`;
      }
      await audit(
        {
          actorId: user.id,
          action: `solicitacao.${tipo}.${acao}`,
          entity: tipo === "ciclo" ? "CicloBase" : "BloqueioProduto",
          entityId: id,
          summary: acao === "liberar" ? `Liberou o ${alvo}` : `Mudou a data do ${alvo} para ${ate!.split("-").reverse().join("/")}`,
        },
        tx,
      );
    });
  });
  if (r.error) return r;
  revalidatePath("/solicitacoes/ciclos");
  return { ok: true, message: acao === "liberar" ? "Liberado." : "Data atualizada." };
}

// S23: liberação de urgência. O Dev/Admin libera uma base própria para pedir hoje, fora de segunda e terça.
// A liberação vale só para o dia de hoje (Brasília) e some sozinha no dia seguinte.

const liberarDiaSchema = z.object({ baseId: z.string().min(1, "Escolha a base.") });

export async function liberarDiaAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requirePermission("solicitacoes.liberar");
  const p = liberarDiaSchema.safeParse(Object.fromEntries(f));
  if (!p.success) return { error: firstIssue(p.error) };
  const dia = diaDeHoje(new Date());

  const r = await runAction("solicitacao.liberarDia", async () => {
    await db.$transaction(async (tx) => {
      const base = await tx.base.findUnique({ where: { id: p.data.baseId } });
      if (!base || !base.active || base.type !== "BASE" || !canAccessBase(user, base)) throw new DomainError("Base não encontrada.");
      const jaTem = await tx.liberacaoDia.findUnique({ where: { baseId_dia: { baseId: base.id, dia } } });
      if (jaTem) throw new DomainError("Esta base já está liberada para hoje.");
      const row = await tx.liberacaoDia.create({ data: { baseId: base.id, dia, createdById: user.id } });
      await audit(
        { actorId: user.id, action: "solicitacao.liberarDia", entity: "LiberacaoDia", entityId: row.id, summary: `Liberou a base ${base.code} para pedir hoje (${dia.split("-").reverse().join("/")}), fora de segunda e terça` },
        tx,
      );
    });
  });
  if (r.error) return r;
  revalidatePath("/solicitacoes/ciclos");
  revalidatePath("/solicitacoes/nova");
  return { ok: true, message: "Base liberada para hoje." };
}

export async function cancelarLiberacaoDiaAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requirePermission("solicitacoes.liberar");
  const id = String(f.get("id") ?? "");
  if (!id) return { error: "Registro não encontrado." };

  const r = await runAction("solicitacao.cancelarLiberacaoDia", async () => {
    await db.$transaction(async (tx) => {
      const row = await tx.liberacaoDia.findUnique({ where: { id }, include: { base: true } });
      if (!row || !canAccessBase(user, row.base)) throw new DomainError("Registro não encontrado.");
      await tx.liberacaoDia.delete({ where: { id } });
      await audit({ actorId: user.id, action: "solicitacao.cancelarLiberacaoDia", entity: "LiberacaoDia", entityId: id, summary: `Cancelou a liberação do dia da base ${row.base.code}` }, tx);
    });
  });
  if (r.error) return r;
  revalidatePath("/solicitacoes/ciclos");
  revalidatePath("/solicitacoes/nova");
  return { ok: true, message: "Liberação cancelada." };
}
