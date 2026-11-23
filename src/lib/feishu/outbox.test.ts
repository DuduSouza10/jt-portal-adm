import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { destinations } from "./outbox";

// destinations() só usa o banco no caminho de mensagem direta; os caminhos de grupo não tocam no tx.
const tx = { user: { findMany: async () => [{ feishuOpenId: "ou_1" }] } } as never;
const SPN = { feishuStaffChatId: "oc_staff_spn", feishuShippingChatId: "oc_ship_spn" };
const MG = { feishuStaffChatId: "oc_staff_mg", feishuShippingChatId: null };

const KEYS = ["FEISHU_APP_ID", "FEISHU_APP_SECRET", "FEISHU_STAFF_CHAT_ID", "FEISHU_WEBHOOK_URL", "FEISHU_SHIPPING_WEBHOOK_URL"];
beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});
const comApp = () => {
  process.env.FEISHU_APP_ID = "cli_x";
  process.env.FEISHU_APP_SECRET = "s";
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

  it("expedição: grupo de expedição da regional > webhook geral da expedição > grupo da equipe da regional", async () => {
    comApp();
    process.env.FEISHU_SHIPPING_WEBHOOK_URL = "https://exemplo.invalid/exp";
    expect(await destinations(tx, "expedicao", [], null, SPN)).toEqual([{ channel: "chat", target: "oc_ship_spn" }]);
    expect(await destinations(tx, "expedicao", [], null, MG)).toEqual([{ channel: "webhook", target: "expedicao" }]);
    delete process.env.FEISHU_SHIPPING_WEBHOOK_URL;
    expect(await destinations(tx, "expedicao", [], null, MG)).toEqual([{ channel: "chat", target: "oc_staff_mg" }]);
  });

  it("sem o app configurado, os grupos da regional são ignorados (não dá para enviar)", async () => {
    process.env.FEISHU_WEBHOOK_URL = "https://exemplo.invalid/equipe";
    expect(await destinations(tx, "equipe", [], null, SPN)).toEqual([{ channel: "webhook", target: null }]);
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
