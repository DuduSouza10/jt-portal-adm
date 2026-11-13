import { ptBR, type Messages } from "./messages/pt-BR";
import type { Translator } from "./translate";

/**
 * Traduções de textos que vêm de listas do núcleo (menu e catálogo de permissões).
 * As listas continuam em src/lib (área do Diogo) com o texto em português; aqui só se acha a
 * tradução. Item novo sem tradução aparece com o texto original.
 */

const NAV_KEY: Record<string, keyof Messages["nav"]> = {
  "/": "inicio",
  "/solicitacoes/nova": "solicitarInsumos",
  "/solicitacoes": "solicitacoes",
  "/expedicao": "expedicao",
  "/separacao": "separacao",
  "/produtos": "produtos",
  "/estoque": "estoque",
  "/admin/usuarios": "usuarios",
  "/admin/perfis": "perfis",
  "/admin/estrutura": "estrutura",
  "/admin/auditoria": "auditoria",
};

export function navText(t: Translator, item: { href: string; label: string; description: string }) {
  const k = NAV_KEY[item.href];
  return k ? t.messages.nav[k] : { label: item.label, description: item.description };
}

export function permissionText(t: Translator, p: { key: string; label: string; description?: string }) {
  return {
    label: t.maybe(`permissoes.${p.key}.label`) ?? p.label,
    description: t.maybe(`permissoes.${p.key}.description`) || p.description || "",
  };
}

export function permissionGroupText(t: Translator, g: { module: string; label: string }) {
  return t.maybe(`permissaoGrupos.${g.module}`) ?? g.label;
}

/**
 * Nome e descrição dos tipos de acesso PADRÃO (criados pelo seed), pela chave.
 * Só traduz enquanto o texto no banco é o original: se o administrador renomeou o perfil,
 * vale o que ele digitou. Tipo de acesso criado por ele também mostra o texto dele.
 */
export function profileText(t: Translator, p: { key: string; name: string; description?: string | null }) {
  const original = (ptBR.perfisPadrao as Record<string, { nome: string; descricao: string } | undefined>)[p.key];
  return {
    name: original && p.name === original.nome ? (t.maybe(`perfisPadrao.${p.key}.nome`) ?? p.name) : p.name,
    description:
      original && (p.description ?? "") === original.descricao
        ? (t.maybe(`perfisPadrao.${p.key}.descricao`) ?? original.descricao)
        : (p.description ?? ""),
  };
}

/** Nome do status de uma solicitação no idioma do usuário (E9: o que a base acompanha). */
export function statusText(t: Translator, status: string) {
  return t.maybe(`solicitacoes.status.${status}`) ?? status;
}

export function prioridadeText(t: Translator, priority: string) {
  return t.maybe(`solicitacoes.prioridade.${priority}`) ?? priority;
}
