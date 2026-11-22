import { describe, expect, it } from "vitest";
import { codigoBase, codigoRegional, comSufixo, detectar, detectarTodas, loginSugerido, mesmoNome, siglaCortada, tipoBase, type Dept, desceNoOrganograma, estruturaDoOrganograma } from "./feishu-rules";

// Cadeias como o Feishu devolve: do setor da pessoa até a raiz. Nomes do organograma real.
const d = (name: string, id = name) => ({ id: `od-${id}`, name });
const MN = d("Subsidiária MN");
const SPN = d("Subsidiária São Paulo Norte", "spn");
const MG = d("Subsidiária Minas Gerais", "mg");
const GR_SPN = d("Gestão Regional", "gr-spn");
const GR_MG = d("Gestão Regional", "gr-mg");

const chain = (...xs: Dept[]) => xs;

describe("detectar", () => {
  it("SPN: a unidade abaixo de Gestão Regional é a base", () => {
    const r = detectar(chain(d("SJP SP"), GR_SPN, SPN, MN));
    expect(r).toEqual({
      regional: { feishuId: "od-spn", name: "São Paulo Norte", code: "SPN" },
      base: { feishuId: "od-SJP SP", name: "SJP SP", code: "SJP-SP", type: "BASE" },
    });
  });

  it("MG: cada CD é uma base (dois níveis abaixo de Gestão Regional)", () => {
    const r = detectar(chain(d("CD CTG 001"), d("DC MNH 001"), GR_MG, MG, MN));
    expect(r?.base).toMatchObject({ name: "CD CTG 001", code: "CD-CTG-001" });
    expect(r?.regional).toMatchObject({ name: "Minas Gerais", code: "MG" });
  });

  it("MG: quem está direto no DC cai na base do DC", () => {
    expect(detectar(chain(d("DC MNH 001"), GR_MG, MG, MN))?.base.code).toBe("DC-MNH-001");
  });

  it("subsetor dentro da unidade não vira base", () => {
    expect(detectar(chain(d("Operação"), d("CD CTG 001"), d("DC MNH 001"), GR_MG, MG, MN))?.base.code).toBe("CD-CTG-001");
  });

  it("SPN: subsetor dentro da unidade não vira base", () => {
    expect(detectar(chain(d("Expedição"), d("SJP SP"), GR_SPN, SPN, MN))?.base.code).toBe("SJP-SP");
  });

  it("franquia pelo prefixo F", () => {
    expect(detectar(chain(d("F ORLN SP"), GR_SPN, SPN, MN))?.base.type).toBe("FRANQUIA");
  });

  it("administrativo, Gestão Regional em si, ou fora de subsidiária: sem base", () => {
    expect(detectar(chain(d("Gestão Administrativa"), d("Gestão Integrada"), MN))).toBeNull();
    expect(detectar(chain(GR_SPN, SPN, MN))).toBeNull();
    expect(detectar(chain(d("SP RAO"), d("SC de Regional"), SPN, MN))).toBeNull();
    expect(detectar(chain(d("X"), d("Gestão Regional"), d("Outra coisa")))).toBeNull();
    expect(detectar([])).toBeNull();
  });

  it("duas cadeias para a mesma base contam uma vez", () => {
    const c = chain(d("SJP SP"), GR_SPN, SPN, MN);
    expect(detectarTodas([c, c, chain(d("Gestão Integrada"), MN)])).toHaveLength(1);
  });
});

describe("siglas e login", () => {
  it("siglas", () => {
    expect(codigoRegional("Subsidiária São Paulo Norte")).toBe("SPN");
    expect(codigoRegional("Subsidiária Minas Gerais")).toBe("MG");
    expect(codigoBase("DC  DIQ 001")).toBe("DC-DIQ-001");
    expect(codigoBase("PA SHOPEE CRV SP")).toBe("PA-SHOPEE-CRV-SP");
    expect(tipoBase("FRC SP")).toBe("BASE");
  });

  it("login sugerido", () => {
    expect(loginSugerido({ name: "João da Silva", openId: "ou_1" })).toBe("joao.da.silva");
    expect(loginSugerido({ name: "X", email: "Maria.Souza@jtexpress.com.br", openId: "ou_1" })).toBe("maria.souza");
    expect(loginSugerido({ name: "李", openId: "ou_abcdef123456" })).toBe("feishu.ef123456");
  });
});

describe("desempate de sigla", () => {
  it("mesmoNome ignora acento, caixa e espaços", () => {
    expect(mesmoNome("São  Paulo Norte", "sao paulo norte")).toBe(true);
    expect(mesmoNome("Minas Gerais", "Mato Grosso")).toBe(false);
  });

  it("comSufixo desempata sem passar de 20 caracteres", () => {
    expect(comSufixo("MG", 2)).toBe("MG-2");
    expect(comSufixo("ABCDEFGHIJ-KLMNOPQRS", 12)).toBe("ABCDEFGHIJ-KLMNOP-12");
    expect(comSufixo("ABCDEFGHIJ-KLMNOPQRS", 12)).toHaveLength(20);
    expect(comSufixo("ABCDEFGHIJKLMNOPQ-RS", 3)).toBe("ABCDEFGHIJKLMNOPQ-3");
  });

  it("siglaCortada só quando o nome passa de 20 caracteres de sigla", () => {
    expect(siglaCortada("CD MNH 001")).toBe(false);
    expect(siglaCortada("Centro de Distribuição Contagem 001")).toBe(true);
  });
});

describe("estruturaDoOrganograma (importação de todas as bases)", () => {
  const dep = (id: string, name: string, parentId?: string) => ({ id, name, parentId });
  const org = [
    dep("mn", "Subsidiária MN"),
    dep("gi", "Gestão Integrada", "mn"),
    dep("rh", "RH", "gi"),
    dep("spn", "Subsidiária São Paulo Norte", "mn"),
    dep("gr1", "Gestão Regional", "spn"),
    dep("sjp", "SJP SP", "gr1"),
    dep("exp", "Expedição", "sjp"),
    dep("forl", "F ORLN SP", "gr1"),
    dep("mg", "Subsidiária Minas Gerais", "mn"),
    dep("gr2", "Gestão Regional", "mg"),
    dep("dc1", "DC MNH 001", "gr2"),
    dep("cd1", "CD MNH 001", "dc1"),
    dep("cd2", "CD CTG 001", "dc1"),
    dep("dc2", "DC BHZ 002", "gr2"),
  ];

  it("SPN: cada unidade; MG: cada CD; DC sem CD vira base; administrativo e subsetores ficam de fora", () => {
    const r = estruturaDoOrganograma(org);
    expect(r.map((d) => `${d.regional.code}/${d.base.code}/${d.base.type}`)).toEqual([
      "MG/CD-CTG-001/BASE",
      "MG/CD-MNH-001/BASE",
      "MG/DC-BHZ-002/BASE",
      "SPN/F-ORLN-SP/FRANQUIA",
      "SPN/SJP-SP/BASE",
    ]);
  });

  it("desceNoOrganograma: só Subsidiária, Gestão Regional e DC logo abaixo dela", () => {
    const by = new Map(org.map((d) => [d.id, d]));
    const desce = (id: string) => desceNoOrganograma(by.get(id)!, by.get(by.get(id)!.parentId ?? ""));
    expect(["mn", "spn", "gr1", "dc1"].map(desce)).toEqual([true, true, true, true]);
    expect(["gi", "sjp", "cd1", "exp"].map(desce)).toEqual([false, false, false, false]);
  });
});
