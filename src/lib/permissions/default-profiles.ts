import type { Permission } from "./catalog";

/**
 * Tipos de acesso padrão (criados/atualizados pelo seed).
 * Mudar as permissões padrão: edite aqui → `npm run db:seed`.
 * O teste default-profiles.test.ts garante que o Administrador consegue conceder todos os outros (exceto Dev).
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
      "usuarios.ver", "usuarios.editar", "estrutura.ver", "estrutura.editar", "auditoria.ver",
      "estoque.ver", "estoque.movimentar", "estoque.inventario",
      "produtos.ver", "produtos.editar", "produtos.precos",
      "solicitacoes.criar", "solicitacoes.ver", "solicitacoes.aprovar", "solicitacoes.excluir",
      "expedicao.separar", "expedicao.enviar", "relatorios.ver",
    ],
  },
  {
    key: "gestor-regional",
    name: "Gestor regional",
    description: "Acompanha e aprova as solicitações das bases da sua regional.",
    scope: "REGIONAL",
    permissions: ["estrutura.ver", "produtos.ver", "solicitacoes.ver", "solicitacoes.aprovar", "estoque.ver", "relatorios.ver"],
  },
  {
    key: "almoxarifado",
    name: "Almoxarifado",
    description: "Separa, envia e controla o estoque.",
    scope: "REGIONAL",
    permissions: ["produtos.ver", "solicitacoes.ver", "expedicao.separar", "expedicao.enviar", "estoque.ver", "estoque.movimentar"],
  },
  {
    key: "base",
    name: "Base",
    description: "Solicita insumos para a própria base (sujeita ao ciclo de 3 meses).",
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
