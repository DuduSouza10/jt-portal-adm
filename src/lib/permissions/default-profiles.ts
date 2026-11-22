import type { Permission } from "./catalog";

/**
 * Tipos de acesso padrão (criados/atualizados pelo seed).
 * Mudar as permissões padrão: edite aqui → `npm run db:seed`.
 * O teste default-profiles.test.ts garante que o Administrador consegue conceder todos os outros (exceto Dev)
 * e que os perfis operacionais (Base, Franquia, Expedição) ficam só na sua parte (regra E9).
 */
export type DefaultProfile = {
  key: string;
  name: string;
  description: string;
  scope: "GLOBAL" | "REGIONAL" | "BASE";
  permissions: (Permission | "*")[];
};

export const DEFAULT_PROFILES: DefaultProfile[] = [
  {
    key: "dev",
    name: "Dev",
    description: "Controle total do portal, inclusive de módulos futuros.",
    scope: "GLOBAL",
    permissions: ["*"],
  },
  {
    key: "admin",
    name: "Administrador",
    description: "Administração geral: usuários, estrutura, estoque e operação.",
    scope: "GLOBAL",
    permissions: [
      "usuarios.ver", "usuarios.editar", "perfis.gerenciar", "estrutura.ver", "estrutura.editar", "auditoria.ver", "integracoes.gerenciar", "configuracoes.editar",
      "estoque.ver", "estoque.movimentar", "estoque.inventario",
      "produtos.ver", "produtos.editar", "produtos.precos",
      "solicitacoes.criar", "solicitacoes.ver", "solicitacoes.aprovar", "solicitacoes.excluir", "solicitacoes.liberar",
      "expedicao.separar", "expedicao.enviar", "relatorios.ver",
    ],
  },
  {
    key: "gestor-regional",
    name: "Gestor regional",
    description: "Acompanha e aprova as solicitações das bases da sua regional.",
    scope: "REGIONAL",
    // produtos.precos: vê os valores (R$) nos relatórios (decisão do Diogo, 2026-11-13; igual ao protótipo).
    permissions: ["estrutura.ver", "produtos.ver", "produtos.precos", "solicitacoes.ver", "solicitacoes.aprovar", "estoque.ver", "relatorios.ver"],
  },
  {
    key: "almoxarifado",
    name: "Almoxarifado",
    description: "Separa, envia e controla o estoque.",
    scope: "REGIONAL",
    permissions: ["produtos.ver", "solicitacoes.ver", "expedicao.separar", "expedicao.enviar", "estoque.ver", "estoque.movimentar", "estoque.inventario"],
  },
  {
    // Só a expedição: vê o que já foi separado e está aguardando envio, e confirma o envio (E9).
    // Sem solicitacoes.ver de propósito: a fila da expedição é liberada por expedicao.enviar.
    key: "expedicao",
    name: "Expedição",
    description: "Vê os pedidos separados aguardando envio e confirma o envio. Não acessa outras áreas.",
    scope: "REGIONAL",
    permissions: ["expedicao.enviar"],
  },
  {
    key: "base",
    name: "Base",
    description: "Só pede insumos para a própria base e acompanha o andamento (separado, na expedição, enviado).",
    scope: "BASE",
    permissions: ["produtos.ver", "solicitacoes.criar", "solicitacoes.ver"],
  },
  {
    key: "franquia",
    name: "Franquia",
    description: "Solicita insumos e vê os valores.",
    scope: "BASE",
    permissions: ["produtos.ver", "produtos.precos", "solicitacoes.criar", "solicitacoes.ver"],
  },
];
