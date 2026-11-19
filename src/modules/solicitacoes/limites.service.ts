import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { DomainError } from "@/lib/errors";
import { fmtDateTime } from "@/lib/format";
import type { CurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { getPedidoSettings, type PedidoSettings } from "@/lib/settings";
import { addMonths, COUNTED, holdActive, limitError, limitFor, periodStart } from "./limites";

/**
 * S1–S3 com banco (regras do portal do Eduardo, ver limites.ts). Chamado DENTRO da transação do service
 * de solicitações, depois de travar a base (dois pedidos da mesma base ao mesmo tempo não furam o ciclo).
 */

type Tx = Prisma.TransactionClient;
type Base = { id: string; code: string; type: "BASE" | "FRANQUIA" | "ALMOXARIFADO" };
type Produto = { id: string; code: string; name: string; unit: string; limitBase: number | null; limitFranquia: number | null; limitBlockDays: number };

/** Quem aprova não entra no ciclo nem nos limites (no sistema do Eduardo, o admin). */
export const isExempt = (user: CurrentUser) => can(user, "solicitacoes.aprovar");

export async function lockBase(tx: Tx, baseId: string) {
  const key = `pedido:${baseId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

async function sourceStatus(tx: Tx, id: string | null) {
  if (!id) return null;
  return (await tx.solicitacao.findUnique({ where: { id }, select: { status: true } }))?.status ?? "CANCELADA";
}

/** Ciclo valendo para a base agora (ou null). */
export async function activeCycle(tx: Tx, baseId: string, now = new Date()) {
  const c = await tx.cicloBase.findUnique({ where: { baseId } });
  if (!c) return null;
  return holdActive({ ...c, sourceStatus: await sourceStatus(tx, c.sourceSolicitacaoId) }, now) ? c : null;
}

/** Quanto a base já pediu do produto no período do limite. */
async function usedInPeriod(tx: Tx, baseId: string, p: Produto, revokedAt: Date | null, now: Date) {
  const r = await tx.solicitacaoItem.aggregate({
    _sum: { requested: true },
    where: { produtoId: p.id, solicitacao: { baseId, status: { in: COUNTED }, createdAt: { gte: periodStart(now, p.limitBlockDays, revokedAt) } } },
  });
  return r._sum.requested ?? 0;
}

/** Barra o pedido que fere S1, S2 ou S3. */
export async function checkBeforeCreate(
  tx: Tx,
  user: CurrentUser,
  base: Base,
  itens: { produtoId: string; quantity: number }[],
  produtos: Produto[],
  peopleCount: number | null | undefined,
  cfg: PedidoSettings,
  now = new Date(),
) {
  if (isExempt(user)) return;
  if (base.type === "BASE") {
    if (!peopleCount) throw new DomainError("Informe o número de pessoas na base.");
    const c = cfg.cicloAtivo ? await activeCycle(tx, base.id, now) : null;
    if (c) throw new DomainError(`Esta base está no ciclo de ${cfg.cicloMeses} meses e poderá fazer uma nova solicitação após ${fmtDateTime(c.blockedUntil)}.`);
  }
  if (!cfg.limitesAtivos) return;
  const blocks = new Map((await tx.bloqueioProduto.findMany({ where: { baseId: base.id, produtoId: { in: produtos.map((p) => p.id) } } })).map((b) => [b.produtoId, b]));
  for (const it of itens) {
    const p = produtos.find((x) => x.id === it.produtoId)!;
    const b = blocks.get(p.id);
    if (b && holdActive({ ...b, sourceStatus: await sourceStatus(tx, b.sourceSolicitacaoId) }, now))
      throw new DomainError(`${p.name} está bloqueado para nova solicitação até ${fmtDateTime(b.blockedUntil)}.`);
    const limit = limitFor(p, base.type);
    if (limit == null || limit <= 0) continue;
    const err = limitError(p.name, p.unit, limit, await usedInPeriod(tx, base.id, p, b?.revokedAt ?? null, now), it.quantity);
    if (err) throw new DomainError(err);
  }
}

/** Depois de criar: bloqueia o produto que atingiu o limite e começa o ciclo da base. */
export async function afterCreate(tx: Tx, user: CurrentUser, base: Base, solicitacaoId: string, produtos: Produto[], cfg: PedidoSettings, now = new Date()) {
  if (isExempt(user)) return;
  for (const p of cfg.limitesAtivos ? produtos : []) {
    const limit = limitFor(p, base.type);
    if (limit == null || limit <= 0) continue;
    const prev = await tx.bloqueioProduto.findUnique({ where: { baseId_produtoId: { baseId: base.id, produtoId: p.id } } });
    const used = await usedInPeriod(tx, base.id, p, prev?.revokedAt ?? null, now);
    if (used < limit) continue;
    const data = {
      blockedUntil: new Date(now.getTime() + p.limitBlockDays * 86_400_000),
      reason: `Limite de ${limit} ${p.unit} atingido automaticamente na solicitação.`,
      sourceSolicitacaoId: solicitacaoId,
      revokedAt: null,
      updatedById: user.id,
    };
    await tx.bloqueioProduto.upsert({ where: { baseId_produtoId: { baseId: base.id, produtoId: p.id } }, update: data, create: { ...data, baseId: base.id, produtoId: p.id } });
  }
  if (base.type === "BASE" && cfg.cicloAtivo) {
    const data = { blockedUntil: addMonths(now, cfg.cicloMeses), sourceSolicitacaoId: solicitacaoId, reason: `Ciclo automático de ${cfg.cicloMeses} meses iniciado após a solicitação.`, revokedAt: null, updatedById: user.id };
    await tx.cicloBase.upsert({ where: { baseId: base.id }, update: data, create: { ...data, baseId: base.id } });
  }
}

/** Enviado: o ciclo que este pedido começou passa a contar 3 meses a partir do envio. */
export async function onShipped(tx: Tx, solicitacaoId: string, baseId: string, shippedAt: Date) {
  const cfg = await getPedidoSettings();
  if (!cfg.cicloAtivo) return;
  await tx.cicloBase.updateMany({
    where: { baseId, sourceSolicitacaoId: solicitacaoId, revokedAt: null },
    data: { blockedUntil: addMonths(shippedAt, cfg.cicloMeses), reason: `Ciclo de ${cfg.cicloMeses} meses contado a partir da confirmação do envio.` },
  });
}

/** Recusado/cancelado: bloqueios automáticos deste pedido caem (o ciclo cai sozinho pelo status). */
export async function onDropped(tx: Tx, solicitacaoId: string, actorId: string) {
  await tx.bloqueioProduto.updateMany({ where: { sourceSolicitacaoId: solicitacaoId, revokedAt: null }, data: { revokedAt: new Date(), updatedById: actorId } });
}
