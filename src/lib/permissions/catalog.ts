/**
 * Catálogo de permissões do portal — fonte única da verdade.
 *
 * Cada módulo declara aqui suas permissões (página e ação). A tela de perfis lista este catálogo,
 * e o código checa com `can(user, "chave")` / `requirePermission("chave")`.
 *
 * Convenção de chave: "<modulo>.<acao>" em minúsculas, sem acento.
 * Para adicionar uma permissão: inclua aqui, use no código e, se for padrão de algum perfil,
 * atualize prisma/seed.ts. Ver docs/arquitetura.md → "Permissões".
 */

export type PermissionDef = { key: string; label: string; description?: string };
export type PermissionGroup = { module: string; label: string; owner: string; permissions: PermissionDef[] };

export const PERMISSION_GROUPS = [
  // --------------------------------------------------------------- Núcleo (Diogo)
  {
    module: "usuarios",
    label: "Usuários e acessos",
    owner: "núcleo",
    permissions: [
      { key: "usuarios.ver", label: "Ver usuários" },
      { key: "usuarios.editar", label: "Criar e editar usuários", description: "Inclui redefinir senha e desativar." },
      { key: "perfis.gerenciar", label: "Gerenciar tipos de acesso", description: "Criar perfis e mudar permissões." },
    ],
  },
  {
    module: "estrutura",
    label: "Regionais e bases",
    owner: "núcleo",
    permissions: [
      { key: "estrutura.ver", label: "Ver regionais e bases" },
      { key: "estrutura.editar", label: "Criar e editar regionais e bases" },
    ],
  },
  {
    module: "auditoria",
    label: "Auditoria",
    owner: "núcleo",
    permissions: [{ key: "auditoria.ver", label: "Ver o histórico de alterações" }],
  },
  {
    module: "integracoes",
    label: "Integrações",
    owner: "núcleo",
    permissions: [
      { key: "integracoes.gerenciar", label: "Feishu: ver mensagens, testar e reenviar", description: "Página Administração → Feishu." },
    ],
  },
  {
    module: "configuracoes",
    label: "Configurações",
    owner: "núcleo",
    permissions: [
      { key: "configuracoes.editar", label: "Editar prazos de SLA e horário comercial", description: "Página Administração → Configurações." },
    ],
  },

  // --------------------------------------------------------------- Estoque (Diogo)
  {
    module: "estoque",
    label: "Estoque",
    owner: "Diogo",
    permissions: [
      { key: "estoque.ver", label: "Ver saldos e movimentações" },
      { key: "estoque.movimentar", label: "Lançar entradas, saídas e ajustes" },
      { key: "estoque.inventario", label: "Fazer inventário" },
    ],
  },

  // --------------------------------------------------------------- Operação (Eduardo)
  {
    module: "produtos",
    label: "Produtos (catálogo de insumos)",
    owner: "Eduardo",
    permissions: [
      { key: "produtos.ver", label: "Ver catálogo" },
      { key: "produtos.editar", label: "Criar e editar produtos" },
      { key: "produtos.precos", label: "Ver e editar preços" },
    ],
  },
  {
    module: "solicitacoes",
    label: "Solicitações",
    owner: "Eduardo",
    permissions: [
      { key: "solicitacoes.criar", label: "Solicitar insumos", description: "Para as bases do usuário." },
      { key: "solicitacoes.ver", label: "Ver solicitações", description: "Dentro do alcance do perfil." },
      { key: "solicitacoes.aprovar", label: "Aprovar, recusar e editar itens" },
      { key: "solicitacoes.excluir", label: "Excluir solicitações" },
      { key: "solicitacoes.liberar", label: "Liberar ciclo de 3 meses e produtos bloqueados", description: "Tela Solicitações → Ciclos e bloqueios." },
    ],
  },
  {
    module: "expedicao",
    label: "Separação e expedição",
    owner: "Eduardo",
    permissions: [
      { key: "expedicao.separar", label: "Separar pedidos" },
      { key: "expedicao.enviar", label: "Confirmar envio e rastreio" },
    ],
  },
  {
    module: "relatorios",
    label: "Relatórios",
    owner: "Eduardo",
    permissions: [{ key: "relatorios.ver", label: "Ver e exportar relatórios" }],
  },
] as const satisfies readonly PermissionGroup[];

type Groups = typeof PERMISSION_GROUPS;
export type Permission = Groups[number]["permissions"][number]["key"];

/** Curinga: o perfil tem todas as permissões (perfil Dev). */
export const ALL = "*";

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

const KNOWN = new Set<string>([...ALL_PERMISSIONS, ALL]);

/** Remove chaves desconhecidas (ex.: permissão que foi apagada do catálogo). */
export function sanitizePermissions(keys: readonly string[]): string[] {
  return [...new Set(keys.filter((k) => KNOWN.has(k)))];
}
