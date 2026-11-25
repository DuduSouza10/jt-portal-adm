import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { card, escapeMd } from "@/lib/feishu/cards";
import { feishuConfig } from "@/lib/feishu/config";
import { destinations, enqueue } from "@/lib/feishu/outbox";
import type { Permission } from "@/lib/permissions/catalog";
import { avisos, cartaoPedido, ROTA, type EntradaHistorico, type Evento, type Publico } from "./notify-rules";
import { formatNumber, type OutroItem } from "./rules";

type Tx = Prisma.TransactionClient;

/**
 * Usuários ativos que têm a permissão (explícita: o curinga do Dev não entra, para o Dev não receber tudo)
 * e cujo alcance cobre a base: GLOBAL, ou vinculado à base, ou à regional dela (e, na expedição/separação, a uma base da regional).
 */
async function usuariosCom(tx: Tx, permission: Permission, base: { id: string; regionalId: string; type?: string }, { viaBaseDaRegional = false } = {}) {
  const rows = await tx.user.findMany({
    where: {
      active: true,
      profile: { permissions: { has: permission } },
      OR: [
        { profile: { scope: "GLOBAL" } },
        { bases: { some: { baseId: base.id } } },
        { profile: { scope: "REGIONAL" }, regionals: { some: { regionalId: base.regionalId } } },
        ...(base.type === "FRANQUIA" ? [{ profile: { scope: "FRANQUIAS" as const } }] : []),
        // Expedição/separação são da regional (E22): quem tem uma base vinculada na regional do almoxarifado também recebe.
        ...(viaBaseDaRegional ? [{ bases: { some: { base: { regionalId: base.regionalId } } } }] : []),
      ],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

type GruposRegional = { feishuStaffChatId: string | null; feishuShippingChatId: string | null };
const GRUPOS = { feishuStaffChatId: true, feishuShippingChatId: true } as const;

type Solic = {
  id: string;
  number: number;
  priority: "NORMAL" | "URGENTE";
  createdById: string;
  base: { id: string; code: string; name: string; regionalId: string; feishuChatId: string | null; regional: GruposRegional };
  almoxarifado: { id: string; regionalId: string; regional: GruposRegional } | null;
};

async function publico(tx: Tx, p: Publico, s: Solic): Promise<string[]> {
  switch (p) {
    case "aprovadores":
      return usuariosCom(tx, "solicitacoes.aprovar", s.base);
    case "base": {
      // Quem fez o pedido + quem pede por essa base (vínculo direto com a base).
      const rows = await tx.user.findMany({
        where: { active: true, profile: { permissions: { has: "solicitacoes.criar" } }, bases: { some: { baseId: s.base.id } } },
        select: { id: true },
      });
      return [s.createdById, ...rows.map((r) => r.id)];
    }
    case "separacao":
      return s.almoxarifado ? usuariosCom(tx, "expedicao.separar", s.almoxarifado, { viaBaseDaRegional: true }) : [];
    case "expedicao":
      return s.almoxarifado ? usuariosCom(tx, "expedicao.enviar", s.almoxarifado, { viaBaseDaRegional: true }) : [];
  }
}

/**
 * Grupos do Feishu da regional que recebe o aviso: aguardando aprovação vai à regional da base (o almoxarifado ainda
 * não foi escolhido); separação e expedição vão à regional do almoxarifado. Sem regional: grupo geral.
 */
function grupoDaRegional(p: Publico, s: Solic): GruposRegional | null {
  if (p === "aprovadores") return s.base.regional;
  if (p === "separacao" || p === "expedicao") return s.almoxarifado?.regional ?? null;
  return null;
}

/**
 * Avisa o evento: sino de cada destinatário + cartão no Feishu (fila de saída).
 * Chame DENTRO da transação do evento. Quem fez a ação não é avisado.
 * Depois da transação, a action chama `flushFeishuSoon()` para o Feishu sair na hora.
 */
export async function notificar(tx: Tx, solicitacaoId: string, evento: Evento, ator: { id: string; name: string; scope: string; baseIds: readonly string[] }) {
  const s = await tx.solicitacao.findUniqueOrThrow({
    where: { id: solicitacaoId },
    select: {
      id: true,
      number: true,
      priority: true,
      status: true,
      createdById: true,
      createdAt: true,
      outrosItens: true,
      itens: { select: { requested: true, approved: true, separated: true, cancelledAt: true, produto: { select: { code: true, name: true, unit: true } } }, orderBy: { produto: { name: "asc" } } },
      base: { select: { id: true, code: true, name: true, type: true, regionalId: true, feishuChatId: true, regional: { select: GRUPOS } } },
      almoxarifado: { select: { id: true, regionalId: true, regional: { select: GRUPOS } } },
    },
  });
  const number = formatNumber(s.number);
  const lista = avisos(evento, {
    number,
    baseCode: s.base.code,
    baseName: s.base.name,
    urgente: s.priority === "URGENTE",
    temAlmoxarifado: !!s.almoxarifado,
    naExpedicao: s.status === "SEPARADA" || s.status === "ENVIADA",
    atorDaBase: ator.id === s.createdById || ((ator.scope === "BASE" || ator.scope === "FRANQUIA") && ator.baseIds.includes(s.base.id)),
    atorNome: ator.name,
  });

  const outros = (Array.isArray(s.outrosItens) ? (s.outrosItens as OutroItem[]) : []).filter((o) => !o.cancelado);
  // Andamento do pedido (criação e mudanças de status) para o cartão. O evento atual já está gravado.
  const eventos = await tx.solicitacaoEvento.findMany({
    where: { solicitacaoId: s.id, type: { in: ["CRIADA", "STATUS"] } },
    orderBy: { createdAt: "asc" },
    select: { type: true, toStatus: true, note: true, createdAt: true, actor: { select: { name: true } } },
  });
  const historico: EntradaHistorico[] = eventos.map((e) => ({ status: e.type === "STATUS" ? e.toStatus : null, quando: e.createdAt, quem: e.actor?.name ?? null, nota: e.note }));
  // O cartão mostra o pedido AGORA: o que foi pedido, as quantidades, quando, o status de agora e o andamento.
  const cartao = (ultima: { titulo: string; corpo: string } | null) =>
    cartaoPedido(
      {
        numero: number,
        urgente: s.priority === "URGENTE",
        status: s.status,
        baseCode: s.base.code,
        baseName: s.base.name,
        criadaEm: s.createdAt,
        itens: s.itens.map((i) => ({ codigo: i.produto.code, nome: i.produto.name, unidade: i.produto.unit, pedido: i.requested, aprovado: i.approved, separado: i.separated, cancelado: !!i.cancelledAt })),
        outros: outros.map((o) => ({ nome: o.nome, quantity: o.quantity })),
        historico,
        ultima,
      },
      escapeMd,
    );
  // Comentário não muda o pedido: vai como aviso à parte, sem mexer no cartão do pedido.
  const mudaOCartao = evento.tipo !== "comentario";

  const { appUrl } = feishuConfig();
  const avisados = new Set<string>([ator.id]); // cada pessoa recebe um aviso por evento
  const gruposAvisados = new Set<string>();
  const comCartaoNovo = new Set<string>(); // destinos que já recebem o cartão atualizado neste evento
  for (const a of lista) {
    const ids = (await publico(tx, a.publico, s)).filter((id) => !avisados.has(id));
    ids.forEach((id) => avisados.add(id));
    const link = a.link === "pedido" ? `/solicitacoes/${s.id}` : `/${a.link}`;
    if (ids.length) {
      await tx.notification.createMany({
        data: [...new Set(ids)].map((userId) => ({ userId, title: a.titulo, body: a.corpo, link, refType: "solicitacao", refId: s.id })),
      });
    }
    // Grupo (webhook/chat) que já recebeu um cartão deste evento não recebe outro igual.
    const dest = (await destinations(tx, ROTA[a.publico], ids, a.publico === "base" ? s.base.feishuChatId : null, grupoDaRegional(a.publico, s))).filter((d) => {
      const key = `${d.channel}:${d.target}`;
      if (d.channel === "user") return true;
      if (gruposAvisados.has(key)) return false;
      gruposAvisados.add(key);
      return true;
    });
    const botao = a.link === "pedido" ? "Abrir solicitação" : a.link === "expedicao" ? "Abrir expedição" : "Abrir separação";
    const evt = `solicitacao.${evento.tipo === "status" ? evento.to.toLowerCase() : evento.tipo}.${a.publico}`;
    if (mudaOCartao) {
      // Mesmo cartão por destino: se este destino já tem o cartão do pedido, ele é editado em vez de chegar outro.
      const c = cartao({ titulo: a.titulo, corpo: a.corpo });
      await enqueue(tx, evt, dest, card(c.titulo, c.cor, c.linhas, `${appUrl}${link}`, botao), { refId: s.id });
      for (const d of dest) comCartaoNovo.add(`${d.channel}:${d.target}`);
    } else {
      await enqueue(tx, evt, dest, card(a.titulo, a.cor, [`**Base:** ${escapeMd(s.base.code)} — ${escapeMd(s.base.name)}`, a.corpo ? escapeMd(a.corpo) : ""], `${appUrl}${link}`, botao));
    }
  }

  // Quem já tem o cartão deste pedido e não é avisado deste evento (ex.: a equipe depois do envio) também vê o status
  // novo: o cartão é editado em silêncio (não gera aviso nem cria cartão onde não havia).
  if (mudaOCartao) {
    const existentes = await tx.feishuCartao.findMany({ where: { solicitacaoId: s.id }, select: { channel: true, target: true } });
    const restantes = existentes.filter((c) => !comCartaoNovo.has(`${c.channel}:${c.target}`));
    if (restantes.length) {
      const c = cartao(null);
      await enqueue(tx, `solicitacao.${evento.tipo === "status" ? evento.to.toLowerCase() : evento.tipo}.atualiza`, restantes.map((r) => ({ channel: r.channel as "chat" | "user", target: r.target })), card(c.titulo, c.cor, c.linhas, `${appUrl}/solicitacoes/${s.id}`, "Abrir solicitação"), { refId: s.id, soAtualiza: true });
    }
  }
}
