import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ptBR } from "./messages/pt-BR";
import { zhCN } from "./messages/zh-CN";
import { translateServerMessage } from "./server-messages";
import { createTranslator, interpolate } from "./translate";

// ------------------------------------------------------------------ utilidades

type Tree = { [k: string]: string | Tree };
function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) => (typeof v === "string" ? [[prefix + k, v] as [string, string]] : leaves(v, `${prefix}${k}.`)));
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

function files(dir: string, test: (f: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "generated" ? [] : files(p, test);
    return test(p) && !p.includes(".test.") ? [p] : [];
  });
}
const SRC = join(process.cwd(), "src");

// ------------------------------------------------------------------ tradutor

describe("tradutor", () => {
  it("troca {campos} e deixa intacto o que não foi passado", () => {
    expect(interpolate("Página {page} de {pages}", { page: 2, pages: 5 })).toBe("Página 2 de 5");
    expect(interpolate("Olá, {nome}", {})).toBe("Olá, {nome}");
  });

  it("traduz pelo idioma e cai no português quando a chave não existe", () => {
    const zh = createTranslator("zh-CN");
    expect(zh("comum.salvar")).toBe("保存");
    expect(zh("usuarios.total", { n: 3 })).toBe("共 3 个用户");
    expect(zh.maybe("chave.que.nao.existe")).toBeUndefined();
    expect(createTranslator("pt-BR")("comum.salvar")).toBe("Salvar");
  });
});

// ------------------------------------------------------------------ dicionários

describe("dicionário zh-CN", () => {
  const pt = new Map(leaves(ptBR as unknown as Tree));
  const zh = new Map(leaves(zhCN as unknown as Tree));

  it("tem exatamente as mesmas chaves do português", () => {
    expect([...zh.keys()].sort()).toEqual([...pt.keys()].sort());
  });

  it("usa os mesmos {campos} e não deixa texto vazio onde o português tem texto", () => {
    for (const [k, v] of pt) {
      expect(placeholders(zh.get(k)!), k).toEqual(placeholders(v));
      if (v) expect(zh.get(k), k).not.toBe("");
    }
  });
});

// ------------------------------------------------------------------ mensagens do servidor

/** Valor de exemplo para cada ${...} de uma template string. */
const sample = (tpl: string) => {
  let i = 0;
  return tpl.replace(/\$\{[^}]+\}/g, () => `X${++i}`);
};

describe("mensagens do servidor", () => {
  const ts = files(SRC, (f) => f.endsWith(".ts"));

  it("todo DomainError tem tradução em chinês", () => {
    const msgs = new Set<string>();
    for (const f of ts) {
      const code = readFileSync(f, "utf8");
      for (const m of code.matchAll(/DomainError\(\s*"([^"]+)"/g)) msgs.add(m[1]);
      for (const m of code.matchAll(/DomainError\(\s*`([^`]+)`/g)) {
        const s = sample(m[1]);
        // "${label}: ${e.message}" só repassa outra mensagem: nada a traduzir.
        if (/^(X\d+)(: X\d+)?$/.test(s)) continue;
        msgs.add(s);
      }
    }
    expect(msgs.size).toBeGreaterThan(20);
    const faltando = [...msgs].filter((m) => translateServerMessage(m, "zh-CN") === m);
    expect(faltando, "Acrescente em src/i18n/server-messages.ts").toEqual([]);
  });

  it("toda mensagem de validação e de action tem tradução em chinês", () => {
    const alvo = ts.filter((f) => /schemas\.ts$|actions\.ts$|lib[\\/]form\.ts$|lib[\\/]action-result\.ts$/.test(f));
    const msgs = new Set<string>();
    for (const f of alvo) {
      const code = readFileSync(f, "utf8");
      // Frases para o usuário: começam com maiúscula e terminam com ponto.
      for (const m of code.matchAll(/"([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^"]*\.)"/g)) msgs.add(m[1]);
      for (const m of code.matchAll(/(?:error|message): `([^`]+)`/g)) msgs.add(sample(m[1]));
    }
    expect(msgs.size).toBeGreaterThan(20);
    const faltando = [...msgs].filter((m) => translateServerMessage(m, "zh-CN") === m);
    expect(faltando, "Acrescente em src/i18n/server-messages.ts").toEqual([]);
  });

  it("traduz mensagens com prefixo e valores", () => {
    expect(translateServerMessage("LUVA-M Luva M: Saldo disponível insuficiente (disponível: 3).", "zh-CN")).toBe(
      "LUVA-M Luva M：可用库存不足（可用：3）。",
    );
    expect(translateServerMessage("Muitas tentativas. Aguarde 15 minutos e tente de novo.", "zh-CN")).toBe(
      "尝试次数过多，请等待 15 分钟后再试。",
    );
    expect(translateServerMessage("Usuário ou senha inválidos.", "pt-BR")).toBe("Usuário ou senha inválidos.");
    expect(translateServerMessage("Mensagem que ninguém traduziu.", "zh-CN")).toBe("Mensagem que ninguém traduziu.");
  });
});
