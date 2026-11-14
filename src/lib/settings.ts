import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { DEFAULT_BUSINESS_HOURS, type BusinessHours } from "@/lib/sla";

/**
 * Configurações editáveis pela tela (Administração → Configurações), guardadas na tabela Setting.
 * Sem nada gravado, valem os padrões (iguais aos do sistema antigo de insumos).
 */

const hours = z.coerce.number().min(0.5, "Prazo mínimo: 0,5 hora.").max(720, "Prazo máximo: 720 horas.");
const target = z.object({ normal: hours, urgente: hours });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido. Use HH:MM.");

export const slaSettingsSchema = z
  .object({
    /** Prazos em horas ÚTEIS de cada etapa, contados a partir de quando a etapa passa a ser responsabilidade de alguém. */
    targets: z.object({ aprovacao: target, separacao: target, expedicao: target }),
    businessHours: z.object({
      start: hhmm,
      end: hhmm,
      days: z.array(z.number().int().min(0).max(6)).min(1, "Escolha ao menos um dia útil."),
      holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Feriado inválido. Use AAAA-MM-DD.")).max(200),
    }),
  })
  .refine((s) => s.businessHours.start < s.businessHours.end, { message: "O fim do expediente precisa ser depois do início.", path: ["businessHours"] });

export type SlaSettings = z.infer<typeof slaSettingsSchema>;
export type SlaStageKey = keyof SlaSettings["targets"];

export const DEFAULT_SLA_SETTINGS: SlaSettings = {
  targets: {
    aprovacao: { normal: 8, urgente: 2 },
    separacao: { normal: 24, urgente: 4 },
    expedicao: { normal: 8, urgente: 2 },
  },
  businessHours: DEFAULT_BUSINESS_HOURS as BusinessHours,
};

const KEY = "sla";

// ------------------------------------------------------------------ Pedidos (ciclo de 3 meses, S1)

export const pedidoSettingsSchema = z.object({
  /** Ciclo da base ligado? (decisão do Eduardo: manter, com opção de tirar) */
  cicloAtivo: z.boolean(),
  cicloMeses: z.coerce.number().int("Use um número inteiro de meses.").min(1, "Ciclo mínimo: 1 mês.").max(24, "Ciclo máximo: 24 meses."),
});
export type PedidoSettings = z.infer<typeof pedidoSettingsSchema>;
export const DEFAULT_PEDIDO_SETTINGS: PedidoSettings = { cicloAtivo: true, cicloMeses: 3 };
const PEDIDO_KEY = "pedidos";

export async function getPedidoSettings(): Promise<PedidoSettings> {
  const row = await db.setting.findUnique({ where: { key: PEDIDO_KEY } });
  const parsed = row ? pedidoSettingsSchema.safeParse(row.value) : null;
  return parsed?.success ? parsed.data : DEFAULT_PEDIDO_SETTINGS;
}

export async function savePedidoSettings(actor: CurrentUser, value: PedidoSettings) {
  await db.$transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { key: PEDIDO_KEY } });
    await tx.setting.upsert({ where: { key: PEDIDO_KEY }, update: { value, updatedById: actor.id }, create: { key: PEDIDO_KEY, value, updatedById: actor.id } });
    await audit(
      {
        actorId: actor.id,
        action: "configuracao.pedidos",
        entity: "Setting",
        entityId: PEDIDO_KEY,
        summary: value.cicloAtivo ? `Ciclo da base ligado (${value.cicloMeses} meses)` : "Ciclo da base desligado",
        data: { de: (before?.value ?? DEFAULT_PEDIDO_SETTINGS) as object, para: value },
      },
      tx,
    );
  });
}

export async function getSlaSettings(): Promise<SlaSettings> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  const parsed = row ? slaSettingsSchema.safeParse(row.value) : null;
  return parsed?.success ? parsed.data : DEFAULT_SLA_SETTINGS;
}

export async function saveSlaSettings(actor: CurrentUser, value: SlaSettings) {
  await db.$transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { key: KEY } });
    await tx.setting.upsert({ where: { key: KEY }, update: { value, updatedById: actor.id }, create: { key: KEY, value, updatedById: actor.id } });
    await audit(
      {
        actorId: actor.id,
        action: "configuracao.sla",
        entity: "Setting",
        entityId: KEY,
        summary: "Alterou os prazos de SLA e o horário comercial",
        data: { de: (before?.value ?? DEFAULT_SLA_SETTINGS) as object, para: value },
      },
      tx,
    );
  });
}
