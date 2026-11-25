/** Regras puras dos avisos de dúvida no navegador (testadas em duvidas-avisos-rules.test.ts). */

export const MAX_VISTOS = 30;

/** Separa o que ainda não foi mostrado e devolve a lista de ids já mostrados (só os últimos MAX_VISTOS). */
export function semRepetir<T extends { id: string }>(itens: T[], vistos: string[]): { novos: T[]; vistos: string[] } {
  const ja = new Set(vistos);
  const novos = itens.filter((i) => !ja.has(i.id));
  return { novos, vistos: [...vistos, ...novos.map((n) => n.id)].slice(-MAX_VISTOS) };
}

/** Lê uma lista de ids guardada como texto, sem quebrar com lixo no armazenamento do navegador. */
export function lerIds(raw: string | null): string[] {
  try {
    const v: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
