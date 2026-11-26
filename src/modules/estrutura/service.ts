import "server-only";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/auth/session";
import type { BaseInput, RegionalInput } from "./schemas";
import type { PessoaComBases } from "./pessoas";

export async function saveRegional(actor: CurrentUser, id: string | null, input: RegionalInput) {
  return db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.regional.findUnique({ where: { id } });
      if (!before) throw new DomainError("Regional não encontrada.");
      await tx.regional.update({ where: { id }, data: input });
      await audit(
        {
          actorId: actor.id,
          action: "regional.editar",
          entity: "Regional",
          entityId: id,
          summary: `Editou a regional ${input.code}`,
          data: diff(before, input),
        },
        tx,
      );
      return id;
    }
    const r = await tx.regional.create({ data: input });
    await audit(
      { actorId: actor.id, action: "regional.criar", entity: "Regional", entityId: r.id, summary: `Criou a regional ${r.code}` },
      tx,
    );
    return r.id;
  });
}

export async function saveBase(actor: CurrentUser, id: string | null, input: BaseInput) {
  return db.$transaction(async (tx) => {
    const regional = await tx.regional.findUnique({ where: { id: input.regionalId } });
    if (!regional) throw new DomainError("Regional não encontrada.");
    if (id) {
      const before = await tx.base.findUnique({ where: { id } });
      if (!before) throw new DomainError("Base não encontrada.");
      await tx.base.update({ where: { id }, data: input });
      await audit(
        {
          actorId: actor.id,
          action: "base.editar",
          entity: "Base",
          entityId: id,
          summary: `Editou a base ${input.code}`,
          data: diff(before, input),
        },
        tx,
      );
      return id;
    }
    const b = await tx.base.create({ data: input });
    await audit(
      { actorId: actor.id, action: "base.criar", entity: "Base", entityId: b.id, summary: `Criou a base ${b.code} (${regional.code})` },
      tx,
    );
    return b.id;
  });
}

/**
 * Exclui a base de vez (E13, base que fechou). Só sem histórico: pedido (como base ou almoxarifado) ou
 * movimentação de estoque prendem a base ao registro; essas só são desativadas. Saem junto os vínculos de
 * usuários, ciclos, bloqueios e saldos zerados. Quem fica sem nenhuma base volta a "precisar de base".
 */
export async function deleteBase(actor: CurrentUser, id: string) {
  return db.$transaction(async (tx) => {
    const base = await tx.base.findUnique({ where: { id } });
    if (!base) throw new DomainError("Base não encontrada.");
    const [pedidos, movimentos] = await Promise.all([
      tx.solicitacao.count({ where: { OR: [{ baseId: id }, { almoxarifadoId: id }] } }),
      tx.stockMovement.count({ where: { baseId: id } }),
    ]);
    if (pedidos || movimentos)
      throw new DomainError("Esta base tem pedidos ou movimentações de estoque no histórico. Desative em vez de excluir.");
    await tx.stockReservation.deleteMany({ where: { baseId: id } });
    await tx.stockBalance.deleteMany({ where: { baseId: id } });
    const usuarios = await tx.userBase.count({ where: { baseId: id } });
    await tx.base.delete({ where: { id } });
    await audit(
      { actorId: actor.id, action: "base.excluir", entity: "Base", entityId: id, summary: `Excluiu permanentemente a base ${base.code} (${base.name})${usuarios ? `; ${usuarios} usuário(s) desvinculado(s)` : ""}` },
      tx,
    );
    return { code: base.code };
  });
}

/**
 * Exclusão em massa (E13): exclui de vez as bases sem histórico e devolve as que têm pedido ou
 * movimentação de estoque (essas não são excluídas; a tela oferece desativar).
 */
export async function excluirBases(actor: CurrentUser, ids: string[]) {
  const alvo = [...new Set(ids)];
  if (!alvo.length) throw new DomainError("Selecione ao menos uma base.");
  return db.$transaction(async (tx) => {
    const bases = await tx.base.findMany({ where: { id: { in: alvo } }, select: { id: true, code: true, name: true } });
    const [pedidos, pedidosAlmox, movimentos] = await Promise.all([
      tx.solicitacao.findMany({ where: { baseId: { in: alvo } }, distinct: ["baseId"], select: { baseId: true } }),
      tx.solicitacao.findMany({ where: { almoxarifadoId: { in: alvo } }, distinct: ["almoxarifadoId"], select: { almoxarifadoId: true } }),
      tx.stockMovement.findMany({ where: { baseId: { in: alvo } }, distinct: ["baseId"], select: { baseId: true } }),
    ]);
    const presas = new Set([...pedidos.map((p) => p.baseId), ...pedidosAlmox.map((p) => p.almoxarifadoId!), ...movimentos.map((m) => m.baseId)]);
    const livres = bases.filter((b) => !presas.has(b.id));
    const ids = livres.map((b) => b.id);
    if (ids.length) {
      await tx.stockReservation.deleteMany({ where: { baseId: { in: ids } } });
      await tx.stockBalance.deleteMany({ where: { baseId: { in: ids } } });
      await tx.base.deleteMany({ where: { id: { in: ids } } });
      await audit(
        { actorId: actor.id, action: "base.excluir", entity: "Base", entityId: ids[0], summary: `Excluiu permanentemente ${ids.length} base(s): ${livres.map((b) => b.code).join(", ")}`.slice(0, 1000) },
        tx,
      );
    }
    return { excluidas: livres.length, comHistorico: bases.filter((b) => presas.has(b.id)).map((b) => ({ id: b.id, code: b.code })) };
  }, { timeout: 60_000 });
}

/** Desativa (ou reativa) várias bases de uma vez: somem das listas e o histórico fica. */
export async function ativarBases(actor: CurrentUser, ids: string[], active: boolean) {
  const alvo = [...new Set(ids)];
  if (!alvo.length) throw new DomainError("Selecione ao menos uma base.");
  return db.$transaction(async (tx) => {
    const bases = await tx.base.findMany({ where: { id: { in: alvo }, active: !active }, select: { id: true, code: true } });
    if (!bases.length) return 0;
    await tx.base.updateMany({ where: { id: { in: bases.map((b) => b.id) } }, data: { active } });
    await audit(
      { actorId: actor.id, action: active ? "base.reativar" : "base.desativar", entity: "Base", entityId: bases[0].id, summary: `${active ? "Reativou" : "Desativou"} ${bases.length} base(s): ${bases.map((b) => b.code).join(", ")}`.slice(0, 1000) },
      tx,
    );
    return bases.length;
  });
}

/**
 * Pessoas que têm base registrada (qualquer tipo de acesso: supervisor, RM, conta de base, franquia...), com as bases ativas
 * de cada uma. Só leitura, para a aba "Pessoas" de Regionais e bases. Não devolve e-mail, telefone nem matrícula.
 */
export async function pessoasComBases(): Promise<PessoaComBases[]> {
  const users = await db.user.findMany({
    where: { bases: { some: { base: { active: true } } } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      login: true,
      active: true,
      profile: { select: { key: true, name: true } },
      bases: {
        where: { base: { active: true } },
        select: { base: { select: { id: true, code: true, name: true, type: true, regional: { select: { code: true } } } } },
      },
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    login: u.login,
    active: u.active,
    perfil: { key: u.profile.key, name: u.profile.name },
    bases: u.bases
      .map((b) => ({ id: b.base.id, code: b.base.code, name: b.base.name, type: b.base.type, regionalCode: b.base.regional.code }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  }));
}

/** Quantas pessoas têm base registrada (o número da aba). */
export const contarPessoasComBases = () => db.user.count({ where: { bases: { some: { base: { active: true } } } } });
