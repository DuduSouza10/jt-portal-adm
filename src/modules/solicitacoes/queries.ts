import "server-only";
import { TZDate } from "@date-fns/tz";
import { startOfDay } from "date-fns";
import type { Prisma, SolicitacaoStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { TZ } from "@/lib/format";
import { baseScopeWhere, can, type Actor } from "@/lib/permissions/check";
import { almoxarifadosWhere } from "@/modules/estoque/queries";

/** Consultas de leitura de solicitações, separação e expedição. Sempre dentro do alcance do usuário. */

export const PAGE_SIZE = 50;

/** Bases para as quais o usuário pode pedir (não almoxarifado). */
export function basesParaPedir(actor: Actor) {
  const scope = baseScopeWhere(actor);
  return db.base.findMany({
    where: { active: true, type: { not: "ALMOXARIFADO" }, ...(scope && { AND: [scope] }) },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { code: "asc" },
  });
}

/** Produtos que podem ser pedidos: insumos (padrão) ou só os lacres, conforme a aba. */
export function produtosParaPedir({ lacres = false }: { lacres?: boolean } = {}) {
  return db.produto.findMany({
    where: { active: true, lacre: lacres },
    select: { id: true, code: true, name: true, unit: true },
    orderBy: { code: "asc" },
  });
}

/** Almoxarifados que podem atender: todos os ativos; o da regional da base vem primeiro na tela. */
export function almoxarifadosAtivos() {
  return db.base.findMany({
    where: { type: "ALMOXARIFADO", active: true },
    select: { id: true, code: true, name: true, regionalId: true },
    orderBy: { code: "asc" },
  });
}

export type ListFilter = { status?: SolicitacaoStatus; abertas?: boolean; baseId?: string; q?: number; page: number; soFranquias?: boolean };

export async function listSolicitacoes(actor: Actor, f: ListFilter) {
  const scope = baseScopeWhere(actor);
  const where: Prisma.SolicitacaoWhereInput = {
    ...((scope || f.soFranquias) && { base: { AND: [...(scope ? [scope] : []), ...(f.soFranquias ? [{ type: "FRANQUIA" as const }] : [])] } }),
    ...(f.status ? { status: f.status } : f.abertas ? { status: { in: ["PENDENTE", "APROVADA", "EM_SEPARACAO", "SEPARADA", "ENVIADA"] } } : {}),
    ...(f.baseId && { baseId: f.baseId }),
    ...(f.q && { number: f.q }),
  };
  const [rows, total] = await Promise.all([
    db.solicitacao.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (f.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        number: true,
        status: true,
        priority: true,
        partial: true,
        createdAt: true,
        statusChangedAt: true,
        base: { select: { code: true, name: true } },
        almoxarifado: { select: { code: true } },
        _count: { select: { itens: true } },
      },
    }),
    db.solicitacao.count({ where }),
  ]);
  return { rows, total };
}

export function getSolicitacao(id: string) {
  return db.solicitacao.findUnique({
    where: { id },
    include: {
      base: true,
      almoxarifado: true,
      createdBy: { select: { name: true } },
      itens: { include: { produto: true }, orderBy: { produto: { code: "asc" } } },
      eventos: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
}

/** Saldo disponível dos produtos do pedido em cada almoxarifado (ajuda a escolher quem atende). */
export async function disponivelPorAlmox(produtoIds: string[]) {
  const rows = await db.stockBalance.findMany({
    where: { produtoId: { in: produtoIds }, base: { type: "ALMOXARIFADO", active: true } },
    select: { baseId: true, produtoId: true, quantity: true, reserved: true },
  });
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.baseId] ??= {})[r.produtoId] = r.quantity - r.reserved;
  return out;
}

/** Almoxarifados do alcance de quem separa/envia (o filtro das filas). */
function almoxScope(actor: Actor): Prisma.BaseWhereInput {
  return almoxarifadosWhere(actor);
}

/** Fila do almoxarifado: aprovadas e em separação. Urgentes primeiro, depois as mais antigas. */
export function filaSeparacao(actor: Actor) {
  return db.solicitacao.findMany({
    where: { status: { in: ["APROVADA", "EM_SEPARACAO"] }, almoxarifado: almoxScope(actor) },
    orderBy: [{ priority: "desc" }, { approvedAt: "asc" }],
    take: 300,
    select: {
      id: true,
      number: true,
      status: true,
      priority: true,
      approvedAt: true,
      separationAt: true,
      base: { select: { code: true, name: true, city: true } },
      almoxarifado: { select: { code: true } },
      _count: { select: { itens: true } },
    },
  });
}

/** Fila da expedição: separadas aguardando envio + o que já saiu hoje. */
export async function filaExpedicao(actor: Actor) {
  const todayStart = startOfDay(new TZDate(new Date(), TZ));
  const almoxarifado = almoxScope(actor);
  const [ready, shipped] = await Promise.all([
    db.solicitacao.findMany({
      where: { status: "SEPARADA", almoxarifado },
      orderBy: [{ priority: "desc" }, { separatedAt: "asc" }],
      take: 300,
      select: {
        id: true,
        number: true,
        priority: true,
        partial: true,
        separatedAt: true,
        base: { select: { code: true, name: true, city: true } },
        _count: { select: { itens: true } },
      },
    }),
    db.solicitacao.findMany({
      where: { shippedAt: { gte: todayStart }, almoxarifado },
      orderBy: { shippedAt: "desc" },
      take: 100,
      select: { id: true, number: true, shippedAt: true, tripId: true, volumes: true, base: { select: { code: true } } },
    }),
  ]);
  return { ready, shipped };
}

/** Contadores para o início (badge no menu). */
export async function contadores(actor: Actor) {
  const scope = baseScopeWhere(actor);
  const almoxarifado = almoxScope(actor);
  const [pendentes, separar, enviar] = await Promise.all([
    can(actor, "solicitacoes.aprovar") ? db.solicitacao.count({ where: { status: "PENDENTE", ...(scope && { base: scope }) } }) : 0,
    can(actor, "expedicao.separar") ? db.solicitacao.count({ where: { status: { in: ["APROVADA", "EM_SEPARACAO"] }, almoxarifado } }) : 0,
    can(actor, "expedicao.enviar") ? db.solicitacao.count({ where: { status: "SEPARADA", almoxarifado } }) : 0,
  ]);
  return { pendentes, separar, enviar };
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Chave "aaaa-mm-dd" do dia no fuso do portal, para agrupar por dia. */
function diaKey(d: Date) {
  const z = new TZDate(d, TZ);
  return `${z.getFullYear()}-${z.getMonth() + 1}-${z.getDate()}`;
}

/** Contagem por dia dos últimos 7 dias (o último é hoje), para os mini-gráficos do início. */
function ultimos7(datas: (Date | null)[], hoje: Date) {
  const por = new Map<string, number>();
  for (const d of datas) if (d) por.set(diaKey(d), (por.get(diaKey(d)) ?? 0) + 1);
  return Array.from({ length: 7 }, (_, i) => por.get(diaKey(new Date(hoje.getTime() - (6 - i) * DIA_MS))) ?? 0);
}

/** Números do início: aguardando aprovação, em separação e enviadas no mês, com série dos últimos 7 dias. */
export async function resumoSolicitacoes(actor: Actor) {
  const scope = baseScopeWhere(actor);
  const base = scope ? { base: scope } : {};
  const agora = TZDate.tz(TZ);
  const inicioHoje = startOfDay(agora);
  const inicioMes = new TZDate(agora.getFullYear(), agora.getMonth(), 1, TZ);
  const inicioMesAnt = new TZDate(agora.getFullYear(), agora.getMonth() - 1, 1, TZ);
  const desde = new Date(inicioHoje.getTime() - 6 * DIA_MS);
  const [pendentes, separacao, enviadasMes, enviadasMesAnt, criadas, separadas, enviadas] = await Promise.all([
    db.solicitacao.count({ where: { ...base, status: "PENDENTE" } }),
    db.solicitacao.count({ where: { ...base, status: { in: ["APROVADA", "EM_SEPARACAO"] } } }),
    db.solicitacao.count({ where: { ...base, shippedAt: { gte: inicioMes } } }),
    db.solicitacao.count({ where: { ...base, shippedAt: { gte: inicioMesAnt, lt: inicioMes } } }),
    db.solicitacao.findMany({ where: { ...base, createdAt: { gte: desde } }, select: { createdAt: true } }),
    db.solicitacao.findMany({ where: { ...base, separationAt: { gte: desde } }, select: { separationAt: true } }),
    db.solicitacao.findMany({ where: { ...base, shippedAt: { gte: desde } }, select: { shippedAt: true } }),
  ]);
  const serieCriadas = ultimos7(criadas.map((s) => s.createdAt), agora);
  const serieSep = ultimos7(separadas.map((s) => s.separationAt), agora);
  const serieEnv = ultimos7(enviadas.map((s) => s.shippedAt), agora);
  return {
    pendentes: { total: pendentes, hoje: serieCriadas[6]!, serie: serieCriadas },
    separacao: { total: separacao, hoje: serieSep[6]!, serie: serieSep },
    enviadas: {
      total: enviadasMes,
      hoje: serieEnv[6]!,
      serie: serieEnv,
      // Variação sobre o mês anterior; sem base de comparação (mês anterior vazio) fica null.
      variacao: enviadasMesAnt > 0 ? Math.round(((enviadasMes - enviadasMesAnt) / enviadasMesAnt) * 1000) / 10 : null,
    },
  };
}

/** As últimas solicitações dentro do alcance, para o painel do início. */
export function solicitacoesRecentes(actor: Actor, take = 6) {
  const scope = baseScopeWhere(actor);
  return db.solicitacao.findMany({
    where: scope ? { base: scope } : {},
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, number: true, status: true, createdAt: true, base: { select: { code: true, name: true } } },
  });
}
