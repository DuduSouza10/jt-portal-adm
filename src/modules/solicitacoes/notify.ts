import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { card, escapeMd } from "@/lib/feishu/cards";
import { feishuConfig } from "@/lib/feishu/config";
import { destinations, enqueue } from "@/lib/feishu/outbox";
import type { Permission } from "@/lib/permissions/catalog";
import { avisos, ROTA, type Evento, type Publico } from "./notify-rules";
import { formatNumber } from "./rules";

type Tx = Prisma.TransactionClient;

/**
 * Usuários ativos que têm a permissão (explícita: o curinga do Dev não entra, para o Dev não receber tudo)
 * e cujo alcance cobre a base: GLOBAL, ou vinculado à base, ou à regional dela.
 */
async function usuariosCom(tx: Tx, permission: Permission, base: { id: string; regionalId: string }) {
  const rows = await tx.user.findMany({
    where: {
      active: true,
      profile: { permissions: { has: permission } },
      OR: [
        { profile: { scope: "GLOBAL" } },
        { bases: { some: { baseId: base.id } } },
        { profile: { scope: "REGIONAL" }, regionals: { some: { regionalId: base.regionalId } } },
      ],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

type Solic = {
  id: string;
  number: number;
  priority: "NORMAL" | "URGENTE";
  createdById: string;
  base: { id: string; code: string; name: string; regionalId: string; feishuChatId: string | null };
  almoxarifado: { id: string; regionalId: string } | null;
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
      return s.almoxarifado ? usuariosCom(tx, "expedicao.separar", s.almoxarifado) : [];
    case "expedicao":
      return s.almoxarifado ? usuariosCom(tx, "expedicao.enviar", s.almoxarifado) : [];
  }
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
      createdById: true,
      base: { select: { id: true, code: true, name: true, regionalId: true, feishuChatId: true } },
      almoxarifado: { select: { id: true, regionalId: true } },
    },
  });
  const number = formatNumber(s.number);
  const lista = avisos(evento, {
    number,
    baseCode: s.base.code,
    baseName: s.base.name,
    urgente: s.priority === "URGENTE",
    temAlmoxarifado: !!s.almoxarifado,
    atorDaBase: ator.id === s.createdById || (ator.scope === "BASE" && ator.baseIds.includes(s.base.id)),
    atorNome: ator.name,
  });

  const { appUrl } = feishuConfig();
  const avisados = new Set<string>([ator.id]); // cada pessoa recebe um aviso por evento
  const gruposAvisados = new Set<string>();
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
    const dest = (await destinations(tx, ROTA[a.publico], ids, a.publico === "base" ? s.base.feishuChatId : null)).filter((d) => {
      const key = `${d.channel}:${d.target}`;
      if (d.channel === "user") return true;
      if (gruposAvisados.has(key)) return false;
      gruposAvisados.add(key);
      return true;
    });
    const linhas = [`**Base:** ${escapeMd(s.base.code)} — ${escapeMd(s.base.name)}`, a.corpo ? escapeMd(a.corpo) : ""];
    const botao = a.link === "pedido" ? "Abrir solicitação" : a.link === "expedicao" ? "Abrir expedição" : "Abrir separação";
    await enqueue(tx, `solicitacao.${evento.tipo === "status" ? evento.to.toLowerCase() : evento.tipo}.${a.publico}`, dest, card(a.titulo, a.cor, linhas, `${appUrl}${link}`, botao));
  }
}
