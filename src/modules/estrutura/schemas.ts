import { z } from "zod";
import { checkbox, codeField, optionalText } from "@/lib/form";

export const regionalSchema = z.object({
  code: codeField,
  name: z.string().trim().min(2, "Informe o nome."),
  active: checkbox,
});
export type RegionalInput = z.infer<typeof regionalSchema>;

export const baseSchema = z.object({
  code: codeField,
  name: z.string().trim().min(2, "Informe o nome."),
  type: z.enum(["BASE", "FRANQUIA", "ALMOXARIFADO"]),
  regionalId: z.string().min(1, "Escolha a regional."),
  cnpj: optionalText,
  city: optionalText,
  state: optionalText.transform((v) => v?.toUpperCase() ?? null),
  address: optionalText,
  feishuChatId: optionalText.pipe(z.string().regex(/^oc_[A-Za-z0-9_-]{6,80}$/, "chat_id do grupo do Feishu começa com oc_.").nullable().optional()),
  active: checkbox,
});
export type BaseInput = z.infer<typeof baseSchema>;

export const BASE_TYPE_LABEL = { BASE: "Base", FRANQUIA: "Franquia", ALMOXARIFADO: "Almoxarifado" } as const;
