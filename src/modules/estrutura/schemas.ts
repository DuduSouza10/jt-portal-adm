import { z } from "zod";
import { checkbox, codeField, optionalText } from "@/lib/form";

// Grupo da regional no Feishu: link do webhook do bot do grupo (https://open.feishu.cn/open-apis/bot/v2/hook/...) ou chat_id oc_...
const chatId = optionalText.pipe(
  z
    .string()
    .regex(/^(oc_[A-Za-z0-9_-]{6,80}|https:\/\/open\.(feishu\.cn|larksuite\.com)\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9-]{8,80})$/, "Cole o link do webhook do bot do grupo (https://open.feishu.cn/open-apis/bot/v2/hook/...) ou o chat_id oc_....")
    .nullable()
    .optional(),
);

export const regionalSchema = z.object({
  code: codeField,
  name: z.string().trim().min(2, "Informe o nome."),
  feishuStaffChatId: chatId,
  feishuShippingChatId: chatId,
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
  feishuChatId: chatId,
  active: checkbox,
});
export type BaseInput = z.infer<typeof baseSchema>;

export const BASE_TYPE_LABEL = { BASE: "Base", FRANQUIA: "Franquia", ALMOXARIFADO: "Almoxarifado" } as const;
