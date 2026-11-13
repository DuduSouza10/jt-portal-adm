import type { Locale } from "./config";

/**
 * Tradução das mensagens que o SERVIDOR devolve prontas, em português: DomainError dos services,
 * validações Zod e mensagens das actions. Assim os módulos continuam lançando
 * um DomainError com o texto em português, sem saber de idioma.
 *
 * Cada linha é [texto em português, texto em chinês]. `{x}` casa com qualquer valor e é repetido
 * na tradução. O teste i18n.test.ts falha se aparecer DomainError ou mensagem de
 * validação nova sem tradução aqui.
 *
 * Mensagens com prefixo ("LUVA-M Luva de látex M: Saldo disponível insuficiente...") são
 * traduzidas pela parte depois de ": ".
 */
const ZH: [string, string][] = [
  // ------------------------------------------------------------- Gerais
  ["Erro inesperado. Tente novamente.", "发生意外错误，请重试。"],
  ["O sistema está ocupado agora. Nada foi alterado; tente de novo em alguns segundos.", "系统繁忙，未做任何更改，请几秒后重试。"],
  ["Dados inválidos.", "数据无效。"],

  // ------------------------------------------------------------- Login e senha
  ["Usuário ou senha inválidos.", "用户名或密码错误。"],
  ["Informe o usuário.", "请输入用户名。"],
  ["Informe a senha.", "请输入密码。"],
  ["Muitas tentativas. Aguarde {n} minutos e tente de novo.", "尝试次数过多，请等待 {n} 分钟后再试。"],
  ["A nova senha precisa ter ao menos {n} caracteres.", "新密码至少需要 {n} 个字符。"],
  ["A confirmação não confere.", "两次输入的密码不一致。"],
  ["A nova senha deve ser diferente da atual.", "新密码不能与当前密码相同。"],
  ["Senha atual incorreta.", "当前密码不正确。"],

  // ------------------------------------------------------------- Usuários e tipos de acesso
  ["Usuário não encontrado.", "未找到该用户。"],
  ["Tipo de acesso não encontrado.", "未找到该权限角色。"],
  ["Informe o nome.", "请输入名称。"],
  ["E-mail inválido.", "邮箱格式不正确。"],
  ["Escolha o tipo de acesso.", "请选择权限角色。"],
  ["Login: 3 a 40 caracteres, só letras, números, ponto, hífen ou _.", "登录名：3 到 40 个字符，只能包含字母、数字、点、连字符或下划线。"],
  ["Chave: 2 a 30 caracteres, só letras minúsculas, números, - ou _.", "标识：2 到 30 个字符，只能包含小写字母、数字、- 或 _。"],
  ["Já existe um usuário com esse login ou e-mail.", "该登录名或邮箱已被使用。"],
  ["Já existe um tipo de acesso com essa chave.", "该标识的权限角色已存在。"],
  ["Você não pode gerenciar usuários com mais permissões do que você.", "你不能管理权限比你更多的用户。"],
  ["Você não pode gerenciar usuários com alcance maior que o seu.", "你不能管理数据范围比你更大的用户。"],
  ["Você não pode desativar o próprio usuário.", "你不能停用自己的账号。"],
  ["Você não pode mudar o próprio tipo de acesso.", "你不能修改自己的权限角色。"],
  ["Você não pode mudar as próprias bases e regionais.", "你不能修改自己所属的网点和区域。"],
  ["Você não pode conceder permissões que você mesmo não tem.", "你不能授予自己没有的权限。"],
  ["Você não pode criar um tipo de acesso com alcance maior que o seu.", "你不能创建数据范围比你更大的权限角色。"],
  ["Você não pode editar um tipo de acesso com alcance maior que o seu.", "你不能编辑数据范围比你更大的权限角色。"],
  ["Você não pode editar um tipo de acesso com mais permissões do que o seu.", "你不能编辑权限比你更多的权限角色。"],
  ["O curinga (*) do perfil Dev não pode ser removido por aqui.", "Dev 角色的通配权限（*）不能在此移除。"],
  [
    "Usuário criado. Senha temporária: {senha} (anote e passe para a pessoa; ela troca no primeiro acesso).",
    "用户已创建。临时密码：{senha}（请记下并告知本人，首次登录时需修改）。",
  ],
  ["Nova senha temporária de {login}: {senha}. As sessões abertas foram encerradas.", "{login} 的新临时密码：{senha}。其所有已登录会话已结束。"],

  // ------------------------------------------------------------- Regionais e bases
  ["Regional não encontrada.", "未找到该区域。"],
  ["Base não encontrada.", "未找到该网点。"],
  ["Escolha a regional.", "请选择区域。"],
  ["Sigla: 2 a 20 caracteres, só letras, números, - ou _.", "代码：2 到 20 个字符，只能包含字母、数字、- 或 _。"],
  ["Já existe uma regional com essa sigla.", "该代码的区域已存在。"],
  ["Já existe uma base com essa sigla.", "该代码的网点已存在。"],

  // ------------------------------------------------------------- Estoque
  ["Almoxarifado não encontrado.", "未找到该仓库。"],
  ["Almoxarifado inválido.", "仓库无效。"],
  ["Almoxarifado de destino inválido.", "目标仓库无效。"],
  ["{code} não é um almoxarifado.", "{code} 不是仓库。"],
  ["O almoxarifado {code} está inativo.", "仓库 {code} 已停用。"],
  ["Origem e destino precisam ser diferentes.", "调出仓库和调入仓库不能相同。"],
  ["Produto não encontrado.", "未找到该产品。"],
  ["Produto não informado.", "未填写产品。"],
  ["produto inativo.", "产品已停用。"],
  ["Informe ao menos um produto.", "请至少填写一个产品。"],
  ["Escolha o produto.", "请选择产品。"],
  ["Escolha o almoxarifado.", "请选择仓库。"],
  ["Escolha o almoxarifado de origem.", "请选择调出仓库。"],
  ["Escolha o almoxarifado de destino.", "请选择调入仓库。"],
  ["Informe o número da nota fiscal ou documento.", "请填写发票号或单据号。"],
  ["Informe o motivo da saída.", "请填写出库原因。"],
  ["Informe o motivo ou a referência do inventário.", "请填写盘点原因或参考信息。"],
  ["Itens inválidos.", "明细无效。"],
  ["Máximo de 500 produtos por lançamento.", "每张单据最多 500 个产品。"],
  ["Quantidade inválida.", "数量无效。"],
  ["Quantidade precisa ser inteira.", "数量必须为整数。"],
  ["Quantidade precisa ser um número inteiro.", "数量必须为整数。"],
  ["Quantidade precisa ser maior que zero.", "数量必须大于零。"],
  ["Quantidade acima do limite de {max}.", "数量超过上限 {max}。"],
  ["Mínimo não pode ser negativo.", "最低库存不能为负数。"],
  ["Estoque insuficiente.", "库存不足。"],
  ["Saldo disponível insuficiente (disponível: {n}).", "可用库存不足（可用：{n}）。"],
  ["Saldo disponível insuficiente para reservar (disponível: {n}).", "可用库存不足，无法预留（可用：{n}）。"],
  ["Saldo físico insuficiente para o envio (físico: {n}).", "实物库存不足，无法发货（实物：{n}）。"],
  ["Liberação maior que o reservado.", "释放数量大于预留数量。"],
  ["Baixa maior que o reservado.", "扣减数量大于预留数量。"],
  ["Envio maior que o reservado ({n}).", "发货数量大于预留数量（{n}）。"],
  ["Quantidade enviada inválida.", "发货数量无效。"],
  ["Esta solicitação já tem reserva ativa.", "该申领单已有生效中的预留。"],
  ["Esta solicitação já foi enviada; não pode ser reservada de novo.", "该申领单已发货，不能再次预留。"],
  ["Esta solicitação não tem reserva ativa para enviar.", "该申领单没有可发货的预留。"],
  ["Produto enviado sem reserva nesta solicitação.", "发货的产品不在该申领单的预留中。"],
  ["Tipo de lançamento inválido.", "单据类型无效。"],
  ["Lançamento registrado.", "单据已登记。"],
  ["Inventário registrado: {n} produto(s) com diferença.", "盘点已登记：{n} 个产品存在差异。"],
  [
    "{produto}: contado {contado}, mas {reservado} já reservado(s) para solicitações aprovadas.",
    "{produto}：盘点数量 {contado}，但已有 {reservado} 预留给已批准的申领单。",
  ],
];

type Rule = { re: RegExp; names: string[]; out: string };

/** "Envio maior que o reservado ({n})." → /^Envio maior que o reservado \((.+?)\)\.$/ */
function compile([pt, out]: [string, string]): Rule {
  const names: string[] = [];
  const source = pt
    .split(/(\{\w+\})/)
    .map((part) => {
      const m = /^\{(\w+)\}$/.exec(part);
      if (m) {
        names.push(m[1]);
        return "(.+?)";
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return { re: new RegExp(`^${source}$`), names, out };
}

const RULES: Record<Exclude<Locale, "pt-BR">, Rule[]> = { "zh-CN": ZH.map(compile) };

function translateWhole(msg: string, rules: Rule[]): string | null {
  for (const r of rules) {
    const m = r.re.exec(msg);
    if (!m) continue;
    return r.out.replace(/\{(\w+)\}/g, (all, k: string) => {
      const i = r.names.indexOf(k);
      return i >= 0 ? m[i + 1] : all;
    });
  }
  return null;
}

/** Traduz uma mensagem do servidor. Sem tradução conhecida, devolve o original. */
export function translateServerMessage(msg: string, locale: Locale): string {
  if (locale === "pt-BR" || !msg) return msg;
  const rules = RULES[locale];
  const whole = translateWhole(msg, rules);
  if (whole !== null) return whole;
  // "PREFIXO: mensagem" (ex.: código do produto + erro da regra)
  const i = msg.indexOf(": ");
  if (i > 0) {
    const rest = translateWhole(msg.slice(i + 2), rules);
    if (rest !== null) return `${msg.slice(0, i)}：${rest}`;
  }
  return msg;
}
