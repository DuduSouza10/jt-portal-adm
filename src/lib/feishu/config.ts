// Configuração do Feishu/Lark vinda do .env (ver .env.example e docs/arquitetura.md → "Notificações").
// Feishu (China): open.feishu.cn | Lark (internacional): open.larksuite.com

export function feishuConfig() {
  return {
    baseUrl: (process.env.FEISHU_BASE_URL || "https://open.feishu.cn").replace(/\/$/, ""),
    appId: process.env.FEISHU_APP_ID || "",
    appSecret: process.env.FEISHU_APP_SECRET || "",
    appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
  };
}
