import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/auth/session";
import { can, canAccessBase, canAny } from "@/lib/permissions/check";
import { baixarReserva, entradaFranquia, liberarReserva, reservar, STOCK_TX } from "@/modules/estoque/api";
import { formatNumber, planQuantities, TO, transitionError, type Acao } from "./rules";
import type { AprovarInput, CriarInput, EnvioInput, SepararInput } from "./schemas";
import { notificar } from "./notify";
import * as limites from "./limites.service";
import { getPedidoSettings } from "@/lib/settings";

type Tx = Prisma.TransactionClient;
type BaseRef = { id: string; regionalId: string };

const withBases = {
  base: true,
  almoxarifado: true,
  itens: { include: { produto: true }, orderBy: { produtoId: "asc" } },
} as const satisfies Prisma.SolicitacaoInclude;
type Loaded = Prisma.SolicitacaoGetPayload<{ include: typeof withBases }>;

/** Pode ver a solicitação? Pela base (quem pede/aprova) ou pelo almoxarifado que atende (separação/expedição). */
export function canSee(user: CurrentUser, s: { base: BaseRef; almoxarifado: BaseRef | null }) {
  if (can(user, "solicitacoes.ver") && canAccessBase(user, s.base)) return true;
  return !!s.almoxarifado && canAny(user, ["expedicao.separar", "expedicao.enviar"]) && canAccessBase(user, s.almoxarifado);
}

/** Quem pode executar cada ação (além de o status permitir). */
export function allowed(user: CurrentUser, acao: Acao, s: { base: BaseRef; almoxarifado: BaseRef | null; createdById: string }) {
  const naBase = canAccessBase(user, s.base);
  const noAlmox = !!s.almoxarifado && canAccessBase(user, s.almoxarifado);
  switch (acao) {
    case "aprovar":
    case "recusar":
      return can(user, "solicitacoes.aprovar") && naBase;
    case "cancelar":
      return naBase && (can(user, "solicitacoes.aprovar") || s.createdById === user.id);
    case "iniciarSeparacao":
    case "separar":
      return can(user, "expedicao.separar") && noAlmox;
    case "enviar":
      return can(user, "expedicao.enviar") && noAlmox;
    case "receber":
      return can(user, "solicitacoes.criar") && naBase;
  }
}

async function load(tx: Tx, user: CurrentUser, id: string, acao: Acao) {
  const s = await tx.solicitacao.findUnique({ where: { id }, include: withBases });
  if (!s || !canSee(user, s)) throw new DomainError("Solicitação não encontrada.");
  if (!allowed(user, acao, s)) throw new DomainError("Você não tem permissão para isso.");
  const err = transitionError(acao, s.status, formatNumber(s.number));
  if (err) throw new DomainError(err);
  return s;
}

/**
 * Muda o status só se ninguém mudou antes (clique duplo, duas pessoas ao mesmo tempo):
 * o UPDATE confere o status lido. Grava o evento da linha do tempo e a auditoria na mesma transação.
 */
async function transition(
  tx: Tx,
  user: CurrentUser,
  s: Loaded,
  acao: Acao,
  data: Prisma.SolicitacaoUncheckedUpdateManyInput,
  note?: string | null,
) {
  const to = TO[acao];
  const r = await tx.solicitacao.updateMany({
    where: { id: s.id, status: s.status },
    data: { ...data, status: to, statusChangedAt: new Date() },
  });
  if (r.count !== 1) throw new DomainError(`${formatNumber(s.number)} acabou de ser alterada por outra pessoa. Recarregue a página.`);
  await tx.solicitacaoEvento.create({
    data: { solicitacaoId: s.id, type: "STATUS", fromStatus: s.status, toStatus: to, note: note ?? null, actorId: user.id },
  });
  await audit(
    {
      actorId: user.id,
      action: `solicitacao.${acao}`,
      entity: "Solicitacao",
      entityId: s.id,
      summary: `${formatNumber(s.number)} (${s.base.code}): ${s.status} → ${to}${note ? ` · ${note}` : ""}`,
    },
    tx,
  );
  // Sino + Feishu para "a outra parte" (S7). Na mesma transação: se a mudança falhar, nenhum aviso sai.
  await notificar(tx, s.id, { tipo: "status", from: s.status, to, nota: note, parcial: data.partial === true }, user);
}

/** Pedido com itens digitados fora do cadastro (texto livre). */
const temOutros = (s: { outrosItens: unknown }) => Array.isArray(s.outrosItens) && s.outrosItens.length > 0;

function plan(linhas: Parameters<typeof planQuantities>[0], informado: Record<string, number>, etapa: string, permitirVazio = false) {
  try {
    return planQuantities(linhas, informado, { etapa, permitirVazio });
  } catch (e) {
    throw new DomainError((e as Error).message);
  }
}

// ------------------------------------------------------------------ Base

export async function criar(user: CurrentUser, dados: Omit<CriarInput, "outros"> & { outros?: CriarInput["outros"] }) {
  const input = { ...dados, outros: dados.outros ?? [] };
  const cfg = await getPedidoSettings();
  return db.$transaction(async (tx) => {
    const base = await tx.base.findUnique({ where: { id: input.baseId } });
    if (!base || !canAccessBase(user, base)) throw new DomainError("Base não encontrada.");
    await limites.lockBase(tx, base.id);
    if (!base.active) throw new DomainError(`A base ${base.code} está inativa.`);
    if (base.type === "ALMOXARIFADO") throw new DomainError("Almoxarifado não faz pedido de insumos.");

    const ids = [...new Set(input.itens.map((i) => i.produtoId))];
    if (ids.length !== input.itens.length) throw new DomainError("O mesmo produto aparece duas vezes. Junte as quantidades numa linha só.");
    const produtos = await tx.produto.findMany({ where: { id: { in: ids } } });
    if (produtos.length !== ids.length) throw new DomainError("Produto não encontrado.");
    const inativo = produtos.find((p) => !p.active);
    if (inativo) throw new DomainError(`${inativo.code} não está mais disponível para pedido.`);
    // S11: só pede o que o almoxarifado da regional da base tem disponível agora.
    const disp = await tx.stockBalance.findMany({
      where: { produtoId: { in: ids }, base: { type: "ALMOXARIFADO", active: true, regionalId: base.regionalId } },
      select: { produtoId: true, quantity: true, reserved: true },
    });
    for (const it of input.itens) {
      const tem = disp.filter((d) => d.produtoId === it.produtoId).reduce((s, d) => s + Math.max(0, d.quantity - d.reserved), 0);
      if (it.quantity > tem) {
        const p = produtos.find((x) => x.id === it.produtoId)!;
        // Não diz quanto há: base e franquia não veem a quantidade em estoque.
        throw new DomainError(tem > 0 ? `${p.code}: quantidade acima do disponível no almoxarifado da sua regional.` : `${p.code}: sem estoque no almoxarifado da sua regional.`);
      }
    }
    // S1–S3 (regras do portal do Eduardo): ciclo de 3 meses, nº de pessoas e limite por produto.
    await limites.checkBeforeCreate(tx, user, base, input.itens, produtos, input.peopleCount, cfg);

    const s = await tx.solicitacao.create({
      data: {
        baseId: base.id,
        createdById: user.id,
        priority: input.priority,
        notes: input.notes,
        peopleCount: input.peopleCount ?? null,
        outrosItens: input.outros.length > 0 ? input.outros : undefined,
        itens: { create: input.itens.map((i) => ({ produtoId: i.produtoId, requested: i.quantity })) },
        eventos: { create: { type: "CRIADA", toStatus: "PENDENTE", actorId: user.id, note: input.notes } },
      },
    });
    await audit(
      {
        actorId: user.id,
        action: "solicitacao.criar",
        entity: "Solicitacao",
        entityId: s.id,
        summary: `${formatNumber(s.number)} criada para ${base.code}: ${ids.length} produto(s)${input.outros.length > 0 ? ` + ${input.outros.length} fora do cadastro` : ""}${input.priority === "URGENTE" ? " · URGENTE" : ""}`,
      },
      tx,
    );
    await limites.afterCreate(tx, user, base, s.id, produtos, cfg);
    await notificar(tx, s.id, { tipo: "criada" }, user);
    return s;
  });
}

export async function receber(user: CurrentUser, id: string, note: string | null | undefined) {
  return db.$transaction(async (tx) => {
    const s = await load(tx, user, id, "receber");
    await transition(tx, user, s, "receber", { receivedAt: new Date() }, note);
    // Franquia controla o estoque dela (K7): o que recebeu entra no estoque da franquia.
    if (s.base.type === "FRANQUIA") await entradaFranquia(tx, { solicitacaoId: s.id, franquiaId: s.baseId, actorId: user.id });
  }, STOCK_TX);
}

export async function cancelar(user: CurrentUser, id: string, reason: string) {
  return db.$transaction(async (tx) => {
    const s = await load(tx, user, id, "cancelar");
    await transition(tx, user, s, "cancelar", { decisionNote: reason }, reason);
    await limites.onDropped(tx, s.id, user.id);
    if (s.status === "APROVADA") await liberarReserva(tx, { solicitacaoId: s.id, actorId: user.id });
  }, STOCK_TX);
}

export async function comentar(user: CurrentUser, id: string, text: string) {
  const s = await db.solicitacao.findUnique({ where: { id }, include: { base: true, almoxarifado: true } });
  if (!s || !canSee(user, s)) throw new DomainError("Solicitação não encontrada.");
  await db.$transaction(async (tx) => {
    await tx.solicitacaoEvento.create({ data: { solicitacaoId: id, type: "COMENTARIO", note: text, actorId: user.id } });
    await notificar(tx, id, { tipo: "comentario", texto: text }, user);
  });
}

// ------------------------------------------------------------------ Aprovação

export async function aprovar(user: CurrentUser, input: AprovarInput) {
  return db.$transaction(async (tx) => {
    const s = await load(tx, user, input.id, "aprovar");
    const almox = await tx.base.findUnique({ where: { id: input.almoxarifadoId } });
    if (!almox || almox.type !== "ALMOXARIFADO" || !almox.active) throw new DomainError("Almoxarifado inválido.");

    const { quantities } = plan(
      s.itens.map((i) => ({ produtoId: i.produtoId, label: i.produto.code, max: i.requested })),
      input.quantidades,
      "aprovado",
      temOutros(s),
    );
    for (const it of s.itens) await tx.solicitacaoItem.update({ where: { id: it.id }, data: { approved: quantities.get(it.produtoId)! } });

    await transition(
      tx,
      user,
      s,
      "aprovar",
      { almoxarifadoId: almox.id, approvedAt: new Date(), decisionNote: input.note },
      [`Atendida por ${almox.code}`, input.note].filter(Boolean).join(" · "),
    );
    const reservas = [...quantities].filter(([, q]) => q > 0).map(([produtoId, quantity]) => ({ produtoId, quantity }));
    // Pedido só com itens digitados (fora do cadastro) não tem estoque a reservar.
    if (reservas.length > 0) await reservar(tx, { solicitacaoId: s.id, almoxarifadoId: almox.id, actorId: user.id, itens: reservas });
  }, STOCK_TX);
}

export async function recusar(user: CurrentUser, id: string, reason: string) {
  return db.$transaction(async (tx) => {
    const s = await load(tx, user, id, "recusar");
    await transition(tx, user, s, "recusar", { decisionNote: reason }, reason);
    await limites.onDropped(tx, s.id, user.id);
  });
}

// ------------------------------------------------------------------ Separação (almoxarifado)

export async function iniciarSeparacao(user: CurrentUser, id: string) {
  return db.$transaction(async (tx) => {
    const s = await load(tx, user, id, "iniciarSeparacao");
    await transition(tx, user, s, "iniciarSeparacao", { separationAt: new Date() });
  });
}

export async function separar(user: CurrentUser, input: SepararInput) {
  return db.$transaction(async (tx) => {
    const s = await load(tx, user, input.id, "separar");
    const linhas = s.itens
      .filter((i) => (i.approved ?? 0) > 0)
      .map((i) => ({ produtoId: i.produtoId, label: i.produto.code, max: i.approved! }));
    const { quantities, partial } = plan(linhas, input.quantidades, "separado", temOutros(s));
    for (const it of s.itens) await tx.solicitacaoItem.update({ where: { id: it.id }, data: { separated: quantities.get(it.produtoId) ?? 0 } });
    const now = new Date();
    await transition(
      tx,
      user,
      s,
      "separar",
      { separatedAt: now, separationAt: s.separationAt ?? now, partial },
      partial ? "Separada com menos itens que o aprovado (parcial)." : null,
    );
  });
}

// ------------------------------------------------------------------ Expedição

/** Bipou a guia: acha o pedido e diz se ele pode ser enviado agora. */
export async function lookupParaEnvio(user: CurrentUser, code: { id: string } | { number: number }) {
  const s = await db.solicitacao.findFirst({
    where: "id" in code ? { id: code.id } : { number: code.number },
    include: { base: true, almoxarifado: true },
  });
  if (!s || !canSee(user, s)) throw new DomainError("Pedido não encontrado.");
  if (!s.almoxarifado || !canAccessBase(user, s.almoxarifado)) throw new DomainError(`${formatNumber(s.number)} é de outro almoxarifado.`);
  const err = transitionError("enviar", s.status, formatNumber(s.number));
  if (err) throw new DomainError(err);
  return s.id;
}

/** Envio de UM pedido do lote. Baixa do estoque o que foi separado e libera o resto da reserva. */
async function enviarUm(user: CurrentUser, id: string, data: EnvioInput & { photoId: string; volumesDeste?: number }) {
  return db.$transaction(async (tx) => {
    const s = await load(tx, user, id, "enviar");
    const info = [`Viagem: ${data.tripId}`, data.volumesDeste && `${data.volumesDeste} volume(s)`, data.shippingNotes]
      .filter(Boolean)
      .join(" · ");
    const shippedAt = new Date();
    await limites.onShipped(tx, s.id, s.baseId, shippedAt);
    await transition(
      tx,
      user,
      s,
      "enviar",
      {
        shippedAt,
        tripId: data.tripId,
        shipmentPhotoId: data.photoId,
        volumes: data.volumesDeste ?? null,
        shippingNotes: data.shippingNotes,
      },
      info,
    );
    // Sem itens do cadastro (pedido só com texto livre) não há reserva para baixar.
    if (s.itens.some((i) => (i.approved ?? 0) > 0)) {
      await baixarReserva(tx, {
        solicitacaoId: s.id,
        actorId: user.id,
        enviados: s.itens.filter((i) => (i.approved ?? 0) > 0).map((i) => ({ produtoId: i.produtoId, quantity: i.separated ?? 0 })),
      });
    }
    // Custo de cada item no envio (custo médio do almoxarifado, gravado na baixa): base do gasto por base.
    const baixas = await tx.stockMovement.findMany({
      where: { refType: "solicitacao", refId: s.id, type: "BAIXA" },
      select: { produtoId: true, unitCost: true },
    });
    for (const b of baixas) {
      const item = s.itens.find((i) => i.produtoId === b.produtoId);
      if (item && b.unitCost != null) await tx.solicitacaoItem.update({ where: { id: item.id }, data: { unitCost: b.unitCost } });
    }
    return formatNumber(s.number);
  }, STOCK_TX);
}

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Confirma o envio de um ou mais pedidos que foram juntos na mesma viagem: grava a foto uma vez
 * e marca cada pedido como enviado. Um pedido que falhar (ex.: já enviado por outra pessoa) não trava os outros.
 */
export async function enviarLote(user: CurrentUser, input: EnvioInput, photo: { mime: string; data: Uint8Array }) {
  if (!PHOTO_TYPES.includes(photo.mime)) throw new DomainError("A foto precisa ser JPG, PNG ou WEBP.");
  if (photo.data.byteLength > MAX_PHOTO_BYTES) throw new DomainError("Foto grande demais (máximo 3 MB).");
  const ids = [...new Set(input.ids)];
  const saved = await db.shipmentPhoto.create({ data: { mime: photo.mime, data: Buffer.from(photo.data) }, select: { id: true } });
  const shipped: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const id of ids) {
    try {
      shipped.push(await enviarUm(user, id, { ...input, photoId: saved.id, volumesDeste: ids.length === 1 ? input.volumes : undefined }));
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
      failed.push({ id, error: e.message });
    }
  }
  if (!shipped.length) await db.shipmentPhoto.delete({ where: { id: saved.id } });
  return { shipped, failed };
}

/** Foto do envio: só para quem pode ver algum pedido daquela viagem. */
export async function loadPhoto(user: CurrentUser, id: string) {
  const photo = await db.shipmentPhoto.findUnique({
    where: { id },
    include: { solicitacoes: { include: { base: true, almoxarifado: true } } },
  });
  if (!photo || !photo.solicitacoes.some((s) => canSee(user, s))) return null;
  return { mime: photo.mime, data: photo.data };
}
