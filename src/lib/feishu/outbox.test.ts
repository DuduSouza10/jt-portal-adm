import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { destinations, origemDoGrupo } from "./outbox";

// destinations() só usa o banco no caminho de mensagem direta; os caminhos de grupo não tocam no tx.
const tx = { user: { findMany: async () => [{ feishuOpenId: "ou_1" }] } } as never;
const SPN = { feishuStaffChatId: "oc_staff_spn", feishuShippingChatId: "oc_ship_spn" };
const MG = { feishuStaffChatId: "oc_staff_mg", feishuShippingChatId: null };

const KEYS = ["FEISHU_BOT_APP_ID", "FEISHU_BOT_APP_SECRET", "FEISHU_STAFF_CHAT_ID"];
beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});
const comApp = () => {
  process.env.FEISHU_BOT_APP_ID = "cli_bot";
  process.env.FEISHU_BOT_APP_SECRET = "s";
};

describe("destinations com grupos por regional", () => {
  it("equipe: o grupo da regional vem antes do grupo geral", async () => {
    comApp();
    process.env.FEISHU_STAFF_CHAT_ID = "oc_geral";
    expect(await destinations(tx, "equipe", [], null, SPN)).toEqual([{ channel: "chat", target: "oc_staff_spn" }]);
    expect(await destinations(tx, "equipe", [], null, MG)).toEqual([{ channel: "chat", target: "oc_staff_mg" }]);
  });

  it("equipe: regional sem grupo (ou sem regional) cai no grupo geral", async () => {
    comApp();
    process.env.FEISHU_STAFF_CHAT_ID = "oc_geral";
    const vazia = { feishuStaffChatId: null, feishuShippingChatId: null };
    expect(await destinations(tx, "equipe", [], null, vazia)).toEqual([{ channel: "chat", target: "oc_geral" }]);
    expect(await destinations(tx, "equipe", [], null, null)).toEqual([{ channel: "chat", target: "oc_geral" }]);
    expect(await destinations(tx, "equipe", [])).toEqual([{ channel: "chat", target: "oc_geral" }]);
  });

  it("4 grupos separados: Insumos e Expedição de SP e de MG nunca se misturam", async () => {
    comApp();
    process.env.FEISHU_STAFF_CHAT_ID = "oc_geral";
    const SPN2 = { feishuStaffChatId: "oc_ins_spn", feishuShippingChatId: "oc_exp_spn" };
    const MG2 = { feishuStaffChatId: "oc_ins_mg", feishuShippingChatId: "oc_exp_mg" };
    const alvo = async (rota: "equipe" | "expedicao", r: typeof SPN2) => (await destinations(tx, rota, [], null, r))[0].target;
    expect([await alvo("equipe", SPN2), await alvo("expedicao", SPN2), await alvo("equipe", MG2), await alvo("expedicao", MG2)]).toEqual(["oc_ins_spn", "oc_exp_spn", "oc_ins_mg", "oc_exp_mg"]);
  });

  it("expedição sem grupo próprio NÃO cai no grupo de insumos da regional: vai ao geral", async () => {
    comApp();
    process.env.FEISHU_STAFF_CHAT_ID = "oc_geral";
    expect(await destinations(tx, "expedicao", [], null, SPN)).toEqual([{ channel: "chat", target: "oc_ship_spn" }]);
    expect(await destinations(tx, "expedicao", [], null, MG)).toEqual([{ channel: "chat", target: "oc_geral" }]);
    expect(await destinations(tx, "expedicao", [], null, null)).toEqual([{ channel: "chat", target: "oc_geral" }]);
  });

  it("sem o app do bot configurado, nada é enviado (não há destino)", async () => {
    process.env.FEISHU_STAFF_CHAT_ID = "oc_geral";
    expect(await destinations(tx, "equipe", [], null, SPN)).toEqual([]);
    expect(await destinations(tx, "base", ["u1"], "oc_base", SPN)).toEqual([]);
  });

  it("link de webhook antigo cadastrado na regional não vale: cai no grupo geral", async () => {
    comApp();
    process.env.FEISHU_STAFF_CHAT_ID = "oc_geral";
    const antigo = { feishuStaffChatId: "https://open.feishu.cn/open-apis/bot/v2/hook/aaaaaaaa-1111", feishuShippingChatId: null };
    expect(await destinations(tx, "equipe", [], null, antigo)).toEqual([{ channel: "chat", target: "oc_geral" }]);
  });

  it("o grupo da base não muda", async () => {
    comApp();
    const r = await destinations(tx, "base", ["u1"], "oc_base", SPN);
    expect(r).toEqual([
      { channel: "user", target: "ou_1" },
      { channel: "chat", target: "oc_base" },
    ]);
  });
});

describe("origemDoGrupo (o que a tela do Feishu mostra)", () => {
  it("grupo próprio, expedição só com o de insumos, e cai no geral quando a regional não tem", async () => {
    comApp();
    process.env.FEISHU_STAFF_CHAT_ID = "oc_geral";
    expect(await origemDoGrupo(tx, "equipe", SPN)).toBe("regional");
    expect(await origemDoGrupo(tx, "expedicao", SPN)).toBe("regional");
    const semGrupos = { feishuStaffChatId: null, feishuShippingChatId: null };
    expect(await origemDoGrupo(tx, "equipe", semGrupos)).toBe("geral");
    expect(await origemDoGrupo(tx, "expedicao", semGrupos)).toBe("geral");
    expect(await origemDoGrupo(tx, "expedicao", MG)).toBe("geral"); // MG sem grupo de expedição: geral, não o de insumos
  });

  it("chat_id (oc_...) sem o app do bot não é usado: avisa em vez de parecer que funciona", async () => {
    expect(await origemDoGrupo(tx, "equipe", SPN)).toBe("semApp");
    comApp();
    expect(await origemDoGrupo(tx, "equipe", SPN)).toBe("regional");
  });

  it("nada configurado", async () => {
    comApp();
    expect(await origemDoGrupo(tx, "equipe", { feishuStaffChatId: null, feishuShippingChatId: null })).toBe("nenhum");
  });
});
