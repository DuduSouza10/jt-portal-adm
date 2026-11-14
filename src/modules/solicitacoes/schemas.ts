import { z } from "zod";
import { optionalText } from "@/lib/form";

/** JSON num campo hidden (mesmo padrão do estoque). */
const json = <T extends z.ZodType>(schema: T) =>
  z
    .string()
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Itens inválidos." });
        return z.NEVER;
      }
    })
    .pipe(schema);

const qty = z.coerce.number({ error: "Quantidade inválida." }).int("Quantidade precisa ser inteira.");

export const criarSchema = z.object({
  baseId: z.string().min(1, "Escolha a base."),
  priority: z.enum(["NORMAL", "URGENTE"]).default("NORMAL"),
  notes: optionalText,
  /** S2: pessoas na base (obrigatório para base; checado no service). */
  peopleCount: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number({ error: "Informe um número de pessoas válido." }).int("Informe um número de pessoas válido.").min(1, "Informe um número de pessoas válido.").max(99_999, "Informe um número de pessoas válido.").optional(),
  ),
  itens: json(
    z
      .array(z.object({ produtoId: z.string().min(1, "Escolha o produto."), quantity: qty.min(1, "Quantidade mínima: 1.") }))
      .min(1, "Adicione ao menos um produto.")
      .max(200, "Máximo de 200 produtos por pedido."),
  ),
});
export type CriarInput = z.infer<typeof criarSchema>;

/** produtoId → quantidade (aprovação e separação). */
const quantidades = json(z.record(z.string(), qty.min(0, "Quantidade não pode ser negativa.")));

export const aprovarSchema = z.object({
  id: z.string().min(1),
  almoxarifadoId: z.string().min(1, "Escolha o almoxarifado que vai atender."),
  quantidades,
  note: optionalText,
});
export type AprovarInput = z.infer<typeof aprovarSchema>;

export const motivoSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(3, "Informe o motivo.").max(300),
});

export const separarSchema = z.object({ id: z.string().min(1), quantidades });
export type SepararInput = z.infer<typeof separarSchema>;

export const textoSchema = z.object({
  id: z.string().min(1),
  text: optionalText,
});

export const comentarioSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1, "Escreva o comentário.").max(1000),
});

export const envioSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Bipe ou marque ao menos um pedido.").max(100, "Máximo de 100 pedidos por envio."),
  tripId: z.string().trim().min(3, "Informe o ID da viagem.").max(60),
  volumes: z.coerce.number().int().min(1).max(10_000).optional(),
  shippingNotes: optionalText,
});
export type EnvioInput = z.infer<typeof envioSchema>;
