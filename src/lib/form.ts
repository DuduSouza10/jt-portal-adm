import { z } from "zod";

/** Texto opcional de formulário: "" vira null. */
export const optionalText = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()
  .optional();

/**
 * Checkbox HTML: marcado envia "on", desmarcado não envia nada (o campo some do formulário).
 * O `.optional()` é obrigatório: no zod 4.6, `z.undefined()` dentro do union não aceita o campo AUSENTE,
 * e desmarcar "ativo" em qualquer formulário dava "expected nonoptional" (Issue #18).
 */
export const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.null()])
  .optional()
  .transform((v) => v === "on" || v === "true");

/** Sigla (código) sempre maiúscula: BHZ01, MG, SPN. */
export const codeField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{2,20}$/, "Sigla: 2 a 20 caracteres, só letras, números, - ou _.");

/** FormData → objeto, juntando campos repetidos (checkbox múltiplo) em array. */
export function formToObject(form: FormData, arrayFields: string[] = []) {
  const obj: Record<string, unknown> = Object.fromEntries(form);
  for (const f of arrayFields) obj[f] = form.getAll(f).map(String);
  return obj;
}
