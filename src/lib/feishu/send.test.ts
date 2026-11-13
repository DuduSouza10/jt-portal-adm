import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { card, cardTitle, escapeMd } from "./cards";
import { _resetTenantCache } from "./client";
import { deliver, webhookSign } from "./send";

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

beforeEach(() => {
  process.env.FEISHU_BASE_URL = "https://open.feishu.cn";
  process.env.FEISHU_APP_ID = "cli_test";
  process.env.FEISHU_APP_SECRET = "segredo";
  process.env.FEISHU_WEBHOOK_URL = "https://open.feishu.cn/open-apis/bot/v2/hook/equipe";
  process.env.FEISHU_WEBHOOK_SECRET = "s3gredo";
  process.env.FEISHU_SHIPPING_WEBHOOK_URL = "https://open.feishu.cn/open-apis/bot/v2/hook/expedicao";
  _resetTenantCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ["FEISHU_APP_ID", "FEISHU_APP_SECRET", "FEISHU_WEBHOOK_URL", "FEISHU_WEBHOOK_SECRET", "FEISHU_SHIPPING_WEBHOOK_URL"]) delete process.env[k];
});

const c = card("Nova solicitação SOL-000001", "blue", ["**Base:** BHZ01"], "https://portal/solicitacoes/x", "Abrir");

describe("cartões", () => {
  it("título, linhas e botão", () => {
    expect(cardTitle(c)).toBe("Nova solicitação SOL-000001");
    expect(JSON.stringify(c)).toContain("https://portal/solicitacoes/x");
  });

  it("texto digitado não vira menção nem formatação", () => {
    expect(escapeMd('<at user_id="all">*oi*</at> [x]')).not.toMatch(/[<>*[\]]/);
  });
});

describe("envio", () => {
  it("webhook da equipe vai assinado", async () => {
    const calls = mockFetch(() => ({ code: 0 }));
    await deliver("webhook", null, c);
    expect(calls[0].url).toBe(process.env.FEISHU_WEBHOOK_URL);
    expect(calls[0].body).toMatchObject({ msg_type: "interactive", card: c });
    expect(calls[0].body.sign).toBe(webhookSign(Number(calls[0].body.timestamp), "s3gredo"));
  });

  it("webhook da expedição usa a URL própria", async () => {
    const calls = mockFetch(() => ({ code: 0 }));
    await deliver("webhook", "expedicao", c);
    expect(calls[0].url).toBe(process.env.FEISHU_SHIPPING_WEBHOOK_URL);
  });

  it("mensagem direta pelo app: pega o token e manda para o open_id", async () => {
    const calls = mockFetch((url) => (url.includes("tenant_access_token") ? { code: 0, tenant_access_token: "t-1", expire: 7200 } : { code: 0 }));
    await deliver("user", "ou_abc", c);
    expect(calls.map((x) => new URL(x.url).pathname)).toEqual(["/open-apis/auth/v3/tenant_access_token/internal", "/open-apis/im/v1/messages"]);
    expect(calls[1].url).toContain("receive_id_type=open_id");
    expect(calls[1].body).toMatchObject({ receive_id: "ou_abc", msg_type: "interactive" });
  });

  it("erro do Feishu vira exceção (a fila tenta de novo)", async () => {
    mockFetch(() => ({ code: 19021, msg: "sign match fail" }));
    await expect(deliver("webhook", null, c)).rejects.toThrow(/sign match fail/);
  });
});
