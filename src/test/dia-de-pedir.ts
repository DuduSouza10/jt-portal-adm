import { vi } from "vitest";

/**
 * S22: as bases só pedem às segundas e terças, mas os testes de integração criam pedidos de base em qualquer dia
 * em que o CI rodar. Aqui a regra do dia fica sempre liberada, a menos que o teste peça a regra de verdade
 * (`globalThis.__regraDoDiaDePedir = true`, como faz o teste do S22). O relógio não é mexido: outros testes
 * comparam datas do banco com as do código.
 */
vi.mock("@/modules/solicitacoes/limites", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/modules/solicitacoes/limites")>();
  return {
    ...real,
    baseNoDiaDePedir: (now: Date) => ((globalThis as { __regraDoDiaDePedir?: boolean }).__regraDoDiaDePedir ? real.baseNoDiaDePedir(now) : true),
  };
});
