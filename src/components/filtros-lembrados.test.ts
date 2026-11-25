import { describe, expect, it } from "vitest";
import { chaveFiltros, contarFiltros, filtrosParaLembrar, restaurarFiltros } from "./filtros-lembrados";

const campos = ["q", "perfil", "status"];

describe("filtros lembrados", () => {
  it("a chave é por tela", () => {
    expect(chaveFiltros("/admin/usuarios")).not.toBe(chaveFiltros("/solicitacoes"));
  });

  it("guarda só os campos do filtro, sem página e sem vazios", () => {
    expect(filtrosParaLembrar(new URLSearchParams("q=ana&p=3&aba=pendentes&status="), campos)).toBe("q=ana");
    expect(filtrosParaLembrar(new URLSearchParams(""), campos)).toBe("");
  });

  it("restaura ao entrar sem filtro na URL e mantém os outros parâmetros (aba)", () => {
    expect(restaurarFiltros("", "q=ana&status=ATIVO", campos)).toBe("q=ana&status=ATIVO");
    expect(restaurarFiltros("?aba=pendentes", "q=ana", campos)).toBe("aba=pendentes&q=ana");
  });

  it("não restaura quando a URL já traz filtro ou não há nada guardado", () => {
    expect(restaurarFiltros("?status=INATIVO", "q=ana", campos)).toBeNull();
    expect(restaurarFiltros("", null, campos)).toBeNull();
    expect(restaurarFiltros("", "", campos)).toBeNull();
  });

  it("ignora o que não é campo do filtro nem a página guardada", () => {
    expect(restaurarFiltros("", "p=4&outro=1", campos)).toBeNull();
  });

  it("conta filtros (valores repetidos do mesmo campo contam uma vez)", () => {
    expect(contarFiltros("q=a&status=X&status=Y")).toBe(2);
    expect(contarFiltros("")).toBe(0);
  });
});
