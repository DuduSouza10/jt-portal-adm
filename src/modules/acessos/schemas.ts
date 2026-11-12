import { z } from "zod";
import { checkbox, optionalText } from "@/lib/form";

export const userSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome."),
  login: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,40}$/, "Login: 3 a 40 caracteres, só letras, números, ponto, hífen ou _."),
  // Minúsculo: o login procura o e-mail digitado em minúsculas.
  email: optionalText
    .transform((v) => v?.toLowerCase() ?? v)
    .pipe(z.email("E-mail inválido.").nullable().optional()),
  phone: optionalText,
  profileId: z.string().min(1, "Escolha o tipo de acesso."),
  active: checkbox,
  baseIds: z.array(z.string()).default([]),
  regionalIds: z.array(z.string()).default([]),
});
export type UserInput = z.infer<typeof userSchema>;

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome."),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{2,30}$/, "Chave: 2 a 30 caracteres, só letras minúsculas, números, - ou _."),
  description: optionalText,
  scope: z.enum(["GLOBAL", "REGIONAL", "BASE"]),
  permissions: z.array(z.string()).default([]),
});
export type ProfileInput = z.infer<typeof profileSchema>;
