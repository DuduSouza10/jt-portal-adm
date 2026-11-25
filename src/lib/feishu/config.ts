// Configuração do Feishu/Lark vinda do .env (ver .env.example e docs/arquitetura.md → "Notificações" e "Login pelo Feishu").
// Feishu (China): open.feishu.cn / accounts.feishu.cn | Lark (internacional): open.larksuite.com / accounts.larksuite.com

export function feishuConfig() {
  const baseUrl = (process.env.FEISHU_BASE_URL || "https://open.feishu.cn").replace(/\/$/, "");
  const accountsUrl = (
    process.env.FEISHU_ACCOUNTS_URL || (baseUrl.includes("larksuite") ? "https://accounts.larksuite.com" : "https://accounts.feishu.cn")
  ).replace(/\/$/, "");
  return {
    baseUrl,
    accountsUrl,
    appId: process.env.FEISHU_APP_ID || "",
    appSecret: process.env.FEISHU_APP_SECRET || "",
    appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  };
}

/**
 * App/bot da J&T que manda as mensagens (grupos e pessoas). É OUTRO app do Feishu, diferente do app do login
 * ("Entrar com Feishu"): FEISHU_BOT_APP_ID / FEISHU_BOT_APP_SECRET. O bot precisa estar nos grupos e ter as permissões
 * de mensagem (im:message:send_as_bot e im:message:update).
 */
export function botConfig() {
  return {
    baseUrl: feishuConfig().baseUrl,
    appId: process.env.FEISHU_BOT_APP_ID || "",
    appSecret: process.env.FEISHU_BOT_APP_SECRET || "",
    staffChatId: process.env.FEISHU_STAFF_CHAT_ID || "",
  };
}

export function isBotEnabled() {
  const c = botConfig();
  return !!(c.appId && c.appSecret);
}

/** O botão "Entrar com Feishu" só aparece com o app configurado. */
export function isFeishuLoginEnabled() {
  const c = feishuConfig();
  return !!(c.appId && c.appSecret);
}

export const FEISHU_CALLBACK_PATH = "/api/auth/feishu/callback";
export const FEISHU_STATE_COOKIE = "portal_feishu_state";
