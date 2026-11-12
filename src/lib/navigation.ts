import type { Permission } from "@/lib/permissions/catalog";
import { canAny } from "@/lib/permissions/check";

/**
 * Menu do portal. Cada módulo adiciona suas entradas aqui.
 * Um item aparece se o usuário tiver QUALQUER uma das permissões listadas.
 * Lembrete: o menu só esconde o link. A página precisa chamar requirePermission() também.
 */
export type NavItem = {
  href: string;
  label: string;
  description: string;
  permissions: Permission[];
  section: "operacao" | "gestao" | "admin";
};

export const NAV_ITEMS: NavItem[] = [
  // ---- Operação (Eduardo): descomente/ajuste quando a página existir
  // { href: "/solicitacoes/nova", label: "Solicitar insumos", description: "Montar e enviar um pedido", permissions: ["solicitacoes.criar"], section: "operacao" },
  // { href: "/solicitacoes", label: "Solicitações", description: "Acompanhar pedidos", permissions: ["solicitacoes.ver"], section: "operacao" },
  // { href: "/expedicao", label: "Expedição", description: "Separar e enviar", permissions: ["expedicao.separar", "expedicao.enviar"], section: "operacao" },
  // { href: "/produtos", label: "Produtos", description: "Catálogo de insumos", permissions: ["produtos.ver"], section: "gestao" },

  // ---- Estoque (Diogo)
  // { href: "/estoque", label: "Estoque", description: "Saldos e movimentações", permissions: ["estoque.ver"], section: "gestao" },

  // ---- Administração (núcleo)
  { href: "/admin/usuarios", label: "Usuários", description: "Contas, bases e redefinição de senha", permissions: ["usuarios.ver"], section: "admin" },
  { href: "/admin/perfis", label: "Tipos de acesso", description: "Permissões e alcance de cada perfil", permissions: ["perfis.gerenciar"], section: "admin" },
  { href: "/admin/estrutura", label: "Regionais e bases", description: "Estrutura organizacional", permissions: ["estrutura.ver"], section: "admin" },
  { href: "/admin/auditoria", label: "Auditoria", description: "Quem alterou o quê e quando", permissions: ["auditoria.ver"], section: "admin" },
];

export const SECTION_LABEL: Record<NavItem["section"], string> = {
  operacao: "Operação",
  gestao: "Gestão",
  admin: "Administração",
};

export function navFor(user: { permissions: readonly string[] }) {
  return NAV_ITEMS.filter((i) => canAny(user, i.permissions));
}
