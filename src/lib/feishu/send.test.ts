import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { card, cardTitle, escapeMd } from "./cards";
import { _resetTenantCache } from "./client";
import { deliver, podeEditar } from "./send";

type Call = { url: string; body: Record<string, unknown> };

function mockFetch(reply: (url: string) => unknown) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify(reply(url)));
    }),
  );
  return calls;
}

const KEYS = ["FEISHU_APP_ID", "FEISHU_APP_SECRET", "FEISHU_BOT_APP_ID", "FEISHU_BOT_APP_SECRET"];
beforeEach(() => {
  process.env.FEISHU_BASE_URL = "https://open.feishu.cn";
  process.env.FEISHU_APP_ID = "cli_login";
  process.env.FEISHU_APP_SECRET = "segredo-login";
  process.env.FEISHU_BOT_APP_ID = "cli_bot";
  process.env.FEISHU_BOT_APP_SECRET = "segredo-bot";
  _resetTenantCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of KEYS) delete process.env[k];
});

const c = card("SOL-000001 · Pendente", "blue", ["**Base:** BHZ01"], "https://portal/solicitacoes/x", "Abrir");

/** Responde token (de qualquer app), envio (devolve message_id) e edição. */
const api = (url: string) => {
  const p = new URL(url).pathname;
  if (p.includes("tenant_access_token")) return { code: 0, tenant_access_token: "t-1", expire: 7200 };
  if (p.startsWith("/open-apis/contact/v3/users/")) return { code: 0, data: { user: { union_id: "on_union" } } };
  return { code: 0, data: { message_id: "om_novo" } };
};

describe("cartões", () => {
  it("título, linhas e botão", () => {
    expect(cardTitle(c)).toBe("SOL-000001 · Pendente");
    expect(JSON.stringify(c)).toContain("https://portal/solicitacoes/x");
  });

  it("o cartão é compartilhado (update_multi), senão o Feishu não deixa editar depois", () => {
    expect((c as { config: { update_multi?: boolean } }).config.update_multi).toBe(true);
  });

  it("texto digitado não vira menção nem formatação", () => {
    expect(escapeMd('<at user_id="all">*oi*</at> [x]')).not.toMatch(/[<>*[\]]/);
  });
});

describe("envio pelo app do bot", () => {
  it("grupo: usa o token do APP DO BOT, manda para o chat_id e devolve o message_id", async () => {
    const calls = mockFetch(api);
    const r = await deliver("chat", "oc_grupo", c);
    expect(r).toEqual({ messageId: "om_novo", acao: "enviado" });
    expect(calls[0].body).toMatchObject({ app_id: "cli_bot", app_secret: "segredo-bot" });
    expect(calls[1].url).toContain("/open-apis/im/v1/messages?receive_id_type=chat_id");
    expect(calls[1].body).toMatchObject({ receive_id: "oc_grupo", msg_type: "interactive" });
  });

  it("mensagem direta: o open_id do login vira union_id (o open_id é por app) e a mensagem sai pelo bot", async () => {
    const calls = mockFetch(api);
    await deliver("user", "ou_abc", c);
    const caminhos = calls.map((x) => new URL(x.url).pathname);
    expect(caminhos).toEqual([
      "/open-apis/auth/v3/tenant_access_token/internal", // app do login (para achar o union_id)
      "/open-apis/contact/v3/users/ou_abc",
      "/open-apis/auth/v3/tenant_access_token/internal", // app do bot
      "/open-apis/im/v1/messages",
    ]);
    const envio = calls[3];
    expect(envio.url).toContain("receive_id_type=union_id");
    expect(envio.body).toMatchObject({ receive_id: "on_union" });
  });

  it("já tem cartão enviado: edita o MESMO cartão (PATCH) em vez de mandar outro", async () => {
    const chamadas: { url: string; method?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        chamadas.push({ url, method: init?.method });
        return new Response(JSON.stringify(api(url)));
      }),
    );
    const r = await deliver("chat", "oc_grupo", c, { messageId: "om_antigo", enviadoEm: new Date() });
    expect(r).toEqual({ messageId: "om_antigo", acao: "editado" });
    const edicao = chamadas.find((x) => x.method === "PATCH");
    expect(edicao?.url).toContain("/open-apis/im/v1/messages/om_antigo");
    expect(chamadas.some((x) => x.url.includes("/im/v1/messages?receive_id_type"))).toBe(false);
  });

  it("cartão com mais de 13 dias não dá para editar: manda um novo", async () => {
    mockFetch(api);
    const velho = new Date(Date.now() - 14 * 86_400_000);
    expect(podeEditar(velho)).toBe(false);
    const r = await deliver("chat", "oc_grupo", c, { messageId: "om_antigo", enviadoEm: velho });
    expect(r).toEqual({ messageId: "om_novo", acao: "enviado" });
  });

  it("edição que falha sobe o erro (a fila tenta de novo); na última tentativa manda um cartão novo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        new Response(JSON.stringify(init?.method === "PATCH" ? { code: 230011, msg: "message recalled" } : api(url))),
      ),
    );
    const anterior = { messageId: "om_antigo", enviadoEm: new Date() };
    await expect(deliver("chat", "oc_grupo", c, anterior)).rejects.toThrow(/message recalled/);
    await expect(deliver("chat", "oc_grupo", c, anterior, { enviarSeFalharEdicao: true })).resolves.toEqual({ messageId: "om_novo", acao: "enviado" });
  });

  it("sem o app do bot configurado, não envia", async () => {
    delete process.env.FEISHU_BOT_APP_ID;
    mockFetch(api);
    await expect(deliver("chat", "oc_grupo", c)).rejects.toThrow(/FEISHU_BOT_APP_ID/);
  });

  it("erro do Feishu vira exceção (a fila tenta de novo)", async () => {
    mockFetch((url) => (url.includes("tenant_access_token") ? api(url) : { code: 230002, msg: "bot not in chat" }));
    await expect(deliver("chat", "oc_grupo", c)).rejects.toThrow(/bot not in chat/);
  });
});
