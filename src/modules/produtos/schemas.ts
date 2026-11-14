import { z } from "zod";
import { checkbox } from "@/lib/form";
import { PRODUTO_CODE_RE } from "./importacao";

/** Limite (S3): vazio = sem limite; senão, inteiro de 0 a 1.000.000. */
const limite = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const n = Number(v);
    if (!/^\d+$/.test(v) || n > 1_000_000) {
      ctx.addIssue({ code: "custom", message: "Limite: use um número inteiro de 0 a 1.000.000 (vazio = sem limite)." });
      return z.NEVER;
    }
    return n;
  })
  .nullable()
  .optional()
  .transform((v) => v ?? null);

/** Dias do período do limite: vazio = 60 (padrão); senão, inteiro de 1 a 3650. */
const dias = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return 60;
    const n = Number(v);
    if (!/^\d+$/.test(v) || n < 1 || n > 3650) {
      ctx.addIssue({ code: "custom", message: "Dias de bloqueio: use um número inteiro de 1 a 3650." });
      return z.NEVER;
    }
    return n;
  })
  .optional()
  .transform((v) => v ?? 60);

export const produtoSchema = z.object({
  /** Na edição o código não muda: a action ignora este campo. */
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(PRODUTO_CODE_RE, "Código: até 40 caracteres, só letras, números, ponto, barra, hífen ou _."),
  name: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(z.string().min(2, "Nome do produto: de 2 a 200 caracteres.").max(200, "Nome do produto: de 2 a 200 caracteres.")),
  unit: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Unidade: de 1 a 10 caracteres.")
    .max(10, "Unidade: de 1 a 10 caracteres."),
  // Caixa desmarcada não envia o campo. `checkbox` sozinho recusa o campo ausente no zod 4.6 (ver Issue #18), então aceitamos ausente aqui.
  active: checkbox.optional().transform((v) => v ?? false),
  limitBase: limite,
  limitFranquia: limite,
  limitBlockDays: dias,
});
export type ProdutoInput = z.infer<typeof produtoSchema>;

/** Unidades mais comuns (sugestão no formulário; o campo aceita qualquer uma). */
export const UNIDADES_COMUNS = ["un", "cx", "pct", "kit", "rolo", "resma", "par"] as const;
