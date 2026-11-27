import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { DomainError } from "@/lib/errors";
import { fmtDateTime } from "@/lib/format";
import type { CurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions/check";
import { getPedidoSettings, type PedidoSettings } from "@/lib/settings";
import { addMonths, cicloFranquiaAcabou, COUNTED, estadoCicloFranquia, holdActive, limitError, limitFor, periodStart } from "./limites";
import { ABERTOS, formatNumber, tipoPedidoFranquia, type TipoPedido } from "./rules";

/**
 * S1–S3 e S20 com banco (regras do portal do Eduardo, ver limites.ts). Chamado DENTRO da transação do service
 * de solicitações, depois de travar a base (dois pedidos da mesma base ao mesmo tempo não furam o ciclo).
 */

type Tx = Prisma.TransactionClient;
type Base = { id: string; code: string; type: "BASE" | "FRANQUIA" | "ALMOXARIFADO" };
type Produto = { id: string; code: string; name: string; unit: string; lacre: boolean; limitBase: number | null; limitFranquia: number | null; limitBlockDays: number };

const meses = (n: number) => (n === 1 ? "1 mês" : `${n} meses`);

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

/**
 * S16: pedido ainda em andamento (aguardando aprovação até enviado, antes de recebido/recusado/cancelado) da base
 * ou franquia, ou null. Enquanto existir, não abre outro: vale para base e franquia, com ou sem o ciclo ligado.
 * Na franquia (S20) a conta é por tipo: um pedido de insumos e um de lacres podem andar juntos.
 */
export async function pedidoEmAndamento(tx: Pick<Tx, "solicitacao">, baseId: string, tipo?: TipoPedido) {
  const abertos = await tx.solicitacao.findMany({
    where: { baseId, status: { in: ABERTOS } },
    orderBy: { createdAt: "desc" },
    select: { number: true, itens: { select: { produto: { select: { lacre: true, name: true } } } } },
  });
  const s = tipo ? abertos.find((a) => tipoPedidoFranquia(a.itens.map((i) => i.produto)) === tipo) : abertos[0];
  return s ? formatNumber(s.number) : null;
}

/** S20: pedido de cada vaga do ciclo da franquia ainda vale (não foi recusado nem cancelado)? */
async function vagasVivas(tx: Tx, c: { insumosSolicitacaoId: string | null; lacresSolicitacaoId: string | null }) {
  const vivo = async (id: string | null) => !!id && COUNTED.includes((await sourceStatus(tx, id)) ?? "CANCELADA");
  return { insumos: await vivo(c.insumosSolicitacaoId), lacres: await vivo(c.lacresSolicitacaoId) };
}

/** S20: estado do ciclo da franquia agora (vagas usadas e bloqueio). */
export async function estadoFranquia(tx: Tx, baseId: string, now = new Date()) {
  const c = await tx.cicloBase.findUnique({ where: { baseId } });
  if (!c) return { ciclo: null, ...estadoCicloFranquia(null, { insumos: false, lacres: false }, now) };
  const ciclo = { insumosId: c.insumosSolicitacaoId, lacresId: c.lacresSolicitacaoId, blockedUntil: c.blockedUntil, revokedAt: c.revokedAt };
  return { ciclo: c, ...estadoCicloFranquia(ciclo, await vagasVivas(tx, c), now) };
}

/** O que a tela de pedido avisa antes de enviar: ciclo (data), vaga do tipo já feita e pedido em andamento. */
export async function avisosDoPedido(tx: Tx, base: Base, tipo: TipoPedido | undefined, cfg: PedidoSettings, now = new Date()) {
  if (base.type === "FRANQUIA" && tipo) {
    const st = cfg.cicloAtivo ? await estadoFranquia(tx, base.id, now) : null;
    return {
      cicloAte: st?.bloqueada ? st.ciclo!.blockedUntil : null,
      jaFez: !!st && (tipo === "INSUMOS" ? st.insumos : st.lacres),
      emAndamento: await pedidoEmAndamento(tx, base.id, tipo),
    };
  }
  const c = base.type === "BASE" && cfg.cicloAtivo ? await activeCycle(tx, base.id, now) : null;
  return { cicloAte: c?.blockedUntil ?? null, jaFez: false, emAndamento: await pedidoEmAndamento(tx, base.id) };
}

/** Quanto a base já pediu do produto no período do limite. */
async function usedInPeriod(tx: Tx, baseId: string, p: Produto, revokedAt: Date | null, now: Date) {
  const r = await tx.solicitacaoItem.aggregate({
    _sum: { requested: true },
    where: { produtoId: p.id, cancelledAt: null, solicitacao: { baseId, status: { in: COUNTED }, createdAt: { gte: periodStart(now, p.limitBlockDays, revokedAt) } } },
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
  // S20: lacre e insumo não vão no mesmo pedido da franquia (vale também para quem aprova).
  if (base.type === "FRANQUIA" && !tipoPedidoFranquia(produtos)) throw new DomainError("Lacre e insumo não vão no mesmo pedido da franquia: faça um pedido de insumos e outro de lacres.");
  if (isExempt(user)) return;
  if (base.type === "BASE") {
    if (!peopleCount) throw new DomainError("Informe o número de pessoas na base.");
    const c = cfg.cicloAtivo ? await activeCycle(tx, base.id, now) : null;
    if (c) throw new DomainError(`Esta base está no ciclo e poderá fazer uma nova solicitação após ${fmtDateTime(c.blockedUntil)}.`);
  }
  // S20: franquia, duas vagas por ciclo (insumos e lacres); só bloqueia depois das duas.
  const tipo = base.type === "FRANQUIA" ? tipoPedidoFranquia(produtos) : null;
  if (tipo && cfg.cicloAtivo) {
    const st = await estadoFranquia(tx, base.id, now);
    if (st.bloqueada) throw new DomainError(`Esta franquia já fez as duas solicitações do ciclo (insumos e lacres) e poderá fazer novas após ${fmtDateTime(st.ciclo!.blockedUntil)}.`);
    if (tipo === "INSUMOS" && st.insumos) throw new DomainError("Esta franquia já fez a solicitação de insumos deste ciclo. Falta só a de lacres.");
    if (tipo === "LACRES" && st.lacres) throw new DomainError("Esta franquia já fez a solicitação de lacres deste ciclo. Falta só a de insumos.");
  }
  // S16: um pedido por vez (na franquia, um por tipo). A base já travada em criar() garante que dois envios ao mesmo tempo não passam.
  const aberto = await pedidoEmAndamento(tx, base.id, tipo ?? undefined);
  if (aberto) throw new DomainError(`A solicitação ${aberto} de ${base.code} ainda está em andamento. Só dá para fazer outra depois que ela for recebida, recusada ou cancelada.`);
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
  if (base.type === "FRANQUIA" && cfg.cicloAtivo) {
    const tipo = tipoPedidoFranquia(produtos);
    const row = await tx.cicloBase.findUnique({ where: { baseId: base.id } });
    const atual = row && !cicloFranquiaAcabou({ insumosId: row.insumosSolicitacaoId, lacresId: row.lacresSolicitacaoId, blockedUntil: row.blockedUntil, revokedAt: row.revokedAt }, now) ? row : null;
    // Ciclo novo começa sem vagas; ciclo aberto mantém a vaga do outro tipo e troca a deste.
    const insumosId = tipo === "INSUMOS" ? solicitacaoId : (atual?.insumosSolicitacaoId ?? null);
    const lacresId = tipo === "LACRES" ? solicitacaoId : (atual?.lacresSolicitacaoId ?? null);
    const vivas = await vagasVivas(tx, { insumosSolicitacaoId: insumosId, lacresSolicitacaoId: lacresId });
    const completo = vivas.insumos && vivas.lacres;
    const data = {
      insumosSolicitacaoId: insumosId,
      lacresSolicitacaoId: lacresId,
      // Só bloqueia com as duas vagas feitas; antes disso o ciclo fica aberto (blockedUntil = agora, sem bloquear).
      blockedUntil: completo ? addMonths(now, cfg.cicloMeses) : now,
      sourceSolicitacaoId: completo ? solicitacaoId : null,
      reason: completo ? `Franquia fez insumos e lacres: bloqueada por ${meses(cfg.cicloMeses)}.` : `Franquia fez ${tipo === "INSUMOS" ? "insumos" : "lacres"}; falta ${tipo === "INSUMOS" ? "lacres" : "insumos"} para fechar o ciclo.`,
      revokedAt: null,
      updatedById: user.id,
    };
    await tx.cicloBase.upsert({ where: { baseId: base.id }, update: data, create: { ...data, baseId: base.id } });
  }
  if (base.type === "BASE" && cfg.cicloAtivo) {
    const data = { blockedUntil: addMonths(now, cfg.cicloMeses), sourceSolicitacaoId: solicitacaoId, reason: `Ciclo automático de ${meses(cfg.cicloMeses)} iniciado após a solicitação.`, revokedAt: null, updatedById: user.id };
    await tx.cicloBase.upsert({ where: { baseId: base.id }, update: data, create: { ...data, baseId: base.id } });
  }
}

/** Enviado: o ciclo que este pedido começou (ou fechou, na franquia) passa a contar a partir do envio. */
export async function onShipped(tx: Tx, solicitacaoId: string, baseId: string, shippedAt: Date) {
  const cfg = await getPedidoSettings();
  if (!cfg.cicloAtivo) return;
  await tx.cicloBase.updateMany({
    where: { baseId, sourceSolicitacaoId: solicitacaoId, revokedAt: null },
    data: { blockedUntil: addMonths(shippedAt, cfg.cicloMeses), reason: `Ciclo de ${meses(cfg.cicloMeses)} contado a partir da confirmação do envio.` },
  });
}

/** Recusado/cancelado: bloqueios automáticos deste pedido caem (o ciclo cai sozinho pelo status). */
export async function onDropped(tx: Tx, solicitacaoId: string, actorId: string) {
  await tx.bloqueioProduto.updateMany({ where: { sourceSolicitacaoId: solicitacaoId, revokedAt: null }, data: { revokedAt: new Date(), updatedById: actorId } });
}
