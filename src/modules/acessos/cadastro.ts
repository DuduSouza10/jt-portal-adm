import { z } from "zod";
import { PASSWORD_MIN } from "@/lib/auth/password";

/** Chave do tipo de acesso que toda conta criada pela tela pública recebe (ver default-profiles.ts). */
export const CADASTRO_PROFILE_KEY = "franquia";

/**
 * Criar conta (E20): a própria franquia cria o acesso, sem passar pelo administrador.
 * Só franquia: o tipo de acesso não vem do formulário, é sempre o da franquia.
 */
export const cadastroSchema = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^\S+(\s+\S+)+$/, "Informe o nome completo."),
    regionalId: z.string().min(1, "Escolha a regional."),
    // Franquia da lista (baseId) OU, se não estiver na lista, o nome digitado (novaFranquia): ela é criada (E20).
    baseId: z.string().optional().transform((v) => v || undefined),
    novaFranquia: z
      .string()
      .optional()
      .transform((v) => v?.trim().replace(/\s+/g, " ") || undefined)
      .refine((v) => !v || (v.length >= 2 && v.length <= 60), "Nome da franquia: de 2 a 60 caracteres."),
    login: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,40}$/, "Login: 3 a 40 caracteres, só letras, números, ponto, hífen ou _."),
    password: z.string().min(PASSWORD_MIN, `A senha precisa ter ao menos ${PASSWORD_MIN} caracteres.`),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "A confirmação não confere." })
  .refine((v) => !!v.baseId || !!v.novaFranquia, { path: ["baseId"], message: "Escolha a franquia ou escreva o nome dela." });
export type CadastroInput = z.infer<typeof cadastroSchema>;
