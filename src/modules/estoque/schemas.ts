import { z } from "zod";
import { optionalText } from "@/lib/form";
import { MAX_UNIT_COST } from "./rules";

const item = z.object({
  produtoId: z.string().min(1, "Escolha o produto."),
  quantity: z.coerce.number({ error: "Quantidade inválida." }).int("Quantidade precisa ser inteira."),
  /** Valor unitário (R$) da NF. Opcional; vazio = sem valor. */
  unitCost: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number({ error: "Valor unitário inválido." }).min(0, "Valor unitário não pode ser negativo.").max(MAX_UNIT_COST, "Valor unitário muito alto.").optional(),
  ),
});

/** Linhas vêm do formulário como JSON num campo hidden "itens". */
const itens = z
  .string()
  .transform((s, ctx) => {
    try {
      return JSON.parse(s) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "Itens inválidos." });
      return z.NEVER;
    }
  })
  .pipe(z.array(item).min(1, "Informe ao menos um produto.").max(500, "Máximo de 500 produtos por lançamento."));

export const entradaSchema = z.object({
  baseId: z.string().min(1, "Escolha o almoxarifado."),
  document: z.string().trim().min(1, "Informe o número da nota fiscal ou documento.").max(60),
  reason: optionalText,
  itens,
});

export const saidaSchema = z.object({
  baseId: z.string().min(1, "Escolha o almoxarifado."),
  reason: z.string().trim().min(3, "Informe o motivo da saída.").max(300),
  document: optionalText,
  itens,
});

export const transferenciaSchema = z.object({
  origemId: z.string().min(1, "Escolha o almoxarifado de origem."),
  destinoId: z.string().min(1, "Escolha o almoxarifado de destino."),
  reason: optionalText,
  document: optionalText,
  itens,
});

export const inventarioSchema = z.object({
  baseId: z.string().min(1, "Escolha o almoxarifado."),
  reason: z.string().trim().min(3, "Informe o motivo ou a referência do inventário.").max(300),
  /** Mesmo formato: quantity = quantidade CONTADA. */
  itens,
});

export const minimoSchema = z.object({
  baseId: z.string().min(1),
  produtoId: z.string().min(1),
  minimum: z.coerce.number().int().min(0, "Mínimo não pode ser negativo.").max(1_000_000),
});

export type EntradaInput = z.infer<typeof entradaSchema>;
export type SaidaInput = z.infer<typeof saidaSchema>;
export type TransferenciaInput = z.infer<typeof transferenciaSchema>;
export type InventarioInput = z.infer<typeof inventarioSchema>;
export type MinimoInput = z.infer<typeof minimoSchema>;

export const MOVEMENT_LABEL = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  TRANSFERENCIA_SAIDA: "Transferência (saída)",
  TRANSFERENCIA_ENTRADA: "Transferência (entrada)",
  INVENTARIO: "Inventário",
  RESERVA: "Reserva",
  LIBERACAO: "Liberação de reserva",
  BAIXA: "Baixa (envio)",
} as const;
