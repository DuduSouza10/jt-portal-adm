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
  // ---- Operação: solicitações, separação e expedição
  { href: "/solicitacoes/nova", label: "Solicitar insumos", description: "Montar e enviar um pedido", permissions: ["solicitacoes.criar"], section: "operacao" },
  { href: "/solicitacoes", label: "Solicitações", description: "Acompanhar pedidos e aprovar", permissions: ["solicitacoes.ver"], section: "operacao" },
  { href: "/separacao", label: "Separação", description: "Separar os pedidos aprovados", permissions: ["expedicao.separar"], section: "operacao" },
  { href: "/expedicao", label: "Expedição", description: "Carregar e confirmar o envio", permissions: ["expedicao.enviar"], section: "operacao" },
  { href: "/produtos", label: "Produtos", description: "Catálogo de insumos e limites por período", permissions: ["produtos.ver"], section: "gestao" },

  // ---- Estoque (Diogo)
  { href: "/estoque", label: "Estoque", description: "Saldos, entradas, saídas e inventário", permissions: ["estoque.ver"], section: "gestao" },
  { href: "/relatorios", label: "Relatórios", description: "SLA das solicitações, valores e gasto por base", permissions: ["relatorios.ver"], section: "gestao" },

  // ---- Administração (núcleo)
  { href: "/admin/usuarios", label: "Usuários", description: "Contas, bases e redefinição de senha", permissions: ["usuarios.ver"], section: "admin" },
  { href: "/admin/perfis", label: "Tipos de acesso", description: "Permissões e alcance de cada perfil", permissions: ["perfis.gerenciar"], section: "admin" },
  { href: "/admin/estrutura", label: "Regionais e bases", description: "Estrutura organizacional", permissions: ["estrutura.ver"], section: "admin" },
  { href: "/admin/auditoria", label: "Auditoria", description: "Quem alterou o quê e quando", permissions: ["auditoria.ver"], section: "admin" },
  { href: "/admin/feishu", label: "Feishu", description: "Avisos no Feishu: teste e mensagens enviadas", permissions: ["integracoes.gerenciar"], section: "admin" },
  { href: "/admin/configuracoes", label: "Configurações", description: "Prazos de SLA e horário comercial", permissions: ["configuracoes.editar"], section: "admin" },
];

export const SECTION_LABEL: Record<NavItem["section"], string> = {
  operacao: "Operação",
  gestao: "Gestão",
  admin: "Administração",
};

export function navFor(user: { permissions: readonly string[] }) {
  return NAV_ITEMS.filter((i) => canAny(user, i.permissions));
}
