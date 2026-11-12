import { z } from "zod";

/** Texto opcional de formulário: "" vira null. */
export const optionalText = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()
  .optional();

/** Checkbox HTML: marcado envia "on", desmarcado não envia nada. */
export const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.undefined(), z.null()])
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
