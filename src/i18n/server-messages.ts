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
  // ------------------------------------------------------------- Importação de usuários
  ["Já existe um usuário com esse login, e-mail ou matrícula.", "该登录名、邮箱或工号已被使用。"],
  ["Dados da planilha inválidos. Recarregue o arquivo.", "表格数据无效，请重新上传文件。"],
  ["Erro ao processar este lote. Tente de novo.", "处理此批次时出错，请重试。"],

  // ------------------------------------------------------------- Solicitações, separação e expedição
  ["Solicitação não encontrada.", "未找到该申领单。"],
  ["Pedido não encontrado.", "未找到该申领单。"],
  ["Você não tem permissão para isso.", "你没有执行此操作的权限。"],
  ["Almoxarifado não faz pedido de insumos.", "仓库不能提交申领单。"],
  ["O mesmo produto aparece duas vezes. Junte as quantidades numa linha só.", "同一产品出现了两次，请合并为一行。"],
  ["A foto precisa ser JPG, PNG ou WEBP.", "照片必须是 JPG、PNG 或 WEBP 格式。"],
  ["Foto grande demais (máximo 3 MB).", "照片过大（最大 3 MB）。"],
  ["{x} acabou de ser alterada por outra pessoa. Recarregue a página.", "{x} 刚被其他人修改，请刷新页面。"],
  ["A base {x} está inativa.", "网点 {x} 已停用。"],
  ["{x} não está mais disponível para pedido.", "{x} 已不可申领。"],
  ["{x} é de outro almoxarifado.", "{x} 属于其他仓库。"],
  ["Código não reconhecido. Bipe o QR da guia ou digite o nº do pedido (SOL-000123).", "无法识别该编码。请扫描单据上的二维码，或输入申领单号（SOL-000123）。"],
  ["Aprovada. O estoque foi reservado.", "已批准，库存已预留。"],
  ["Separada. Já aparece na fila da expedição.", "已拣货，已进入发货队列。"],
  ["Escolha a base.", "请选择网点。"],
  ["Quantidade mínima: 1.", "最小数量：1。"],
  ["Adicione ao menos um produto.", "请至少添加一个产品。"],
  ["Máximo de 200 produtos por pedido.", "每个申领单最多 200 个产品。"],
  ["Quantidade não pode ser negativa.", "数量不能为负数。"],
  ["Escolha o almoxarifado que vai atender.", "请选择负责发货的仓库。"],
  ["Informe o motivo.", "请填写原因。"],
  ["Escreva o comentário.", "请填写评论。"],
  ["Bipe ou marque ao menos um pedido.", "请扫描或勾选至少一个申领单。"],
  ["Máximo de 100 pedidos por envio.", "每次发货最多 100 个申领单。"],
  ["Informe o ID da viagem.", "请输入车次 ID。"],
  // ------------------------------------------------------------- Feishu (admin) e notificações
  ["Falta configurar o app do Feishu (FEISHU_APP_ID e FEISHU_APP_SECRET).", "尚未配置飞书应用（FEISHU_APP_ID 和 FEISHU_APP_SECRET）。"],
  ["Seu usuário não tem o open_id do Feishu. Preencha em Usuários → seu cadastro.", "你的账号没有飞书 open_id，请在「用户 → 你的资料」中填写。"],
  ["Nenhum destino para a expedição: configure o webhook do grupo da expedição ou o da equipe.", "发货没有可用的接收方：请配置发货群或团队群的 Webhook。"],
  ["Nenhum destino para a equipe: configure o webhook do grupo, o chat do grupo ou o app do Feishu.", "团队没有可用的接收方：请配置群 Webhook、群 chat_id 或飞书应用。"],
  ["O Feishu recusou a mensagem. Veja o erro na lista abaixo.", "飞书拒绝了该消息，请查看下方列表中的错误。"],
  ["Mensagem de teste enviada ({x} destino(s)).", "测试消息已发送（{x} 个接收方）。"],
  ["Executado: {x}", "已执行：{x}"],
  ["open_id do Feishu começa com ou_.", "飞书 open_id 以 ou_ 开头。"],
  ["chat_id do grupo do Feishu começa com oc_.", "飞书群 chat_id 以 oc_ 开头。"],
  // ------------------------------------------------------------- Importação por planilha (estrutura, produtos, estoque)
  ["Nome vazio ou muito curto.", "名称为空或太短。"],
  ['Valor de "ativo" não reconhecido: "{v}". Use sim/não.', "无法识别“是否启用”的值：“{v}”。请填 sim/não。"],
  ["A planilha tem {n} linhas; o máximo por importação é {max}.", "表格共有 {n} 行；每次最多导入 {max} 行。"],
  ['Sigla "{v}" inválida: 2 a 20 caracteres, só letras, números, - ou _.', "代码“{v}”无效：2 到 20 个字符，只能包含字母、数字、- 或 _。"],
  ['Tipo "{v}" não reconhecido. Use base, franquia ou almoxarifado.', "无法识别类型“{v}”。请填 base、franquia 或 almoxarifado。"],
  ['Regional "{v}" inválida: informe a sigla da regional.', "区域“{v}”无效：请填写区域代码。"],
  ['UF "{v}" inválida: use a sigla com 2 letras.', "州“{v}”无效：请使用 2 个字母的缩写。"],
  ['Sigla "{v}" repetida (já está na linha {n}).', "代码“{v}”重复（已在第 {n} 行）。"],
  ['Código "{v}" inválido: até 40 caracteres, só letras, números, ponto, barra, hífen ou _.', "代码“{v}”无效：最多 40 个字符，只能包含字母、数字、点、斜杠、连字符或 _。"],
  ["Nome vazio, muito curto ou muito longo.", "名称为空、太短或太长。"],
  ['Unidade "{v}" muito longa (máximo 10 caracteres).', "单位“{v}”太长（最多 10 个字符）。"],
  ['Código "{v}" repetido (já está na linha {n}).', "代码“{v}”重复（已在第 {n} 行）。"],
  ["Informe o código do produto.", "请填写产品代码。"],
  ['Quantidade "{v}" inválida: use um número inteiro de 0 a {max}.', "数量“{v}”无效：请填写 0 到 {max} 的整数。"],
  ['Mínimo "{v}" inválido: use um número inteiro de 0 a {max}.', "最低库存“{v}”无效：请填写 0 到 {max} 的整数。"],
  ['Produto "{v}" repetido para o mesmo almoxarifado (já está na linha {n}).', "同一仓库的产品“{v}”重复（已在第 {n} 行）。"],
  ["Novo almoxarifado em {r}", "在 {r} 新增仓库"],
  ["Nova franquia em {r}", "在 {r} 新增加盟商"],
  ["Nova base em {r}", "在 {r} 新增网点"],
  // ------------------------------------------------------------- Importação de usuários
  ['Login "{v}" inválido: 3 a 40 caracteres, só letras minúsculas, números, ponto, hífen ou _.', "登录名“{v}”无效：3 到 40 个字符，只能包含小写字母、数字、点、连字符或下划线。"],
  ['E-mail "{v}" inválido.', "邮箱“{v}”无效。"],
  ['Matrícula "{v}" repetido (já está na linha {n}).', "工号“{v}”重复（已在第 {n} 行）。"],
  ['E-mail "{v}" repetido (já está na linha {n}).', "邮箱“{v}”重复（已在第 {n} 行）。"],
  ['Login "{v}" repetido (já está na linha {n}).', "登录名“{v}”重复（已在第 {n} 行）。"],
  ['Tipo de acesso "{v}" não existe.', "权限角色“{v}”不存在。"],
  ["Tipo de acesso não informado (nem na planilha, nem o padrão).", "未指定权限角色（表格和默认值中都没有）。"],
  ["Base(s) inexistente(s) ou inativa(s): {v}.", "网点不存在或已停用：{v}。"],
  ["Regional(is) inexistente(s) ou inativa(s): {v}.", "区域不存在或已停用：{v}。"],
  ['Você não pode conceder o tipo de acesso "{v}".', "你不能授予权限角色“{v}”。"],
  ['O tipo "{v}" tem alcance maior que o seu.', "角色“{v}”的数据范围大于你的范围。"],
  ['O login "{v}" já é de outra pessoa ({n}). Informe outro login na planilha.', "登录名“{v}”已属于另一个人（{n}）。请在表格中填写其他登录名。"],
  ['O login "{v}" já é de {n}, com outra matrícula ({m}).', "登录名“{v}”已属于 {n}，其工号不同（{m}）。"],
  ["O e-mail {v} já é de outra pessoa ({n}).", "邮箱 {v} 已属于另一个人（{n}）。"],
  ["O seu próprio usuário não pode ser alterado pela importação.", "不能通过导入修改你自己的账号。"],
  ["Você não pode alterar {n} ({v}): está fora do seu alcance.", "你不能修改 {n}（{v}）：超出你的数据范围。"],
  ["Não foi possível gravar esta linha (conflito com outro cadastro). Tente de novo.", "无法保存此行（与其他记录冲突）。请重试。"],
  ["Este tipo de acesso exige ao menos uma base.", "该权限角色至少需要关联一个网点。"],
  ["Este tipo de acesso exige ao menos uma regional.", "该权限角色至少需要关联一个区域。"],
  ["Você não pode vincular regionais.", "你不能关联区域。"],
  ["Você só pode vincular regionais do seu alcance.", "你只能关联自己数据范围内的区域。"],
  ["Você só pode vincular bases do seu alcance.", "你只能关联自己数据范围内的网点。"],
  ["cria a regional {r}", "新建区域 {r}"],
  ["regional {a} → {b}", "区域 {a} → {b}"],
  ["{v} é almoxarifado e tem estoque: o tipo não pode mudar pela planilha.", "{v} 是仓库且有库存：不能通过表格修改类型。"],
  ["Sem mudança.", "无变化。"],
  ["Não foi possível gravar esta linha. Tente de novo.", "这一行保存失败，请重试。"],
  ["Não foi possível gravar este lote. Tente de novo.", "这一批保存失败，请重试。"],
  ["Novo produto ({u})", "新产品（{u}）"],
  ["reativa", "重新启用"],
  ["desativa", "停用"],
  ["unidade {a} → {b}", "单位 {a} → {b}"],
  ["nome", "名称"],
  ["tipo", "类型"],
  ["CNPJ", "CNPJ"],
  ["cidade", "城市"],
  ["UF", "州"],
  ["endereço", "地址"],
  ["ativo", "启用状态"],
  ['Almoxarifado "{v}" não encontrado.', "未找到仓库“{v}”。"],
  ["Escolha o almoxarifado na tela ou informe a coluna almoxarifado.", "请在页面上选择仓库，或在表格中填写仓库列。"],
  ["O almoxarifado {v} está fora do seu alcance.", "仓库 {v} 不在你的数据范围内。"],
  ['Produto "{v}" não encontrado. Importe o produto antes.', "未找到产品“{v}”。请先导入该产品。"],
  ["{v} está inativo: não recebe entrada.", "{v} 已停用：不能入库。"],
  ["Na entrada, a quantidade precisa ser maior que zero.", "入库数量必须大于零。"],
  ["Você não tem permissão para mudar o estoque mínimo.", "你没有修改最低库存的权限。"],
  ["+{q} (saldo {a} → {b})", "+{q}（库存 {a} → {b}）"],
  ["Saldo {a} → {b}", "库存 {a} → {b}"],
  ["mínimo {a} → {b}", "最低库存 {a} → {b}"],
  ["atenção: {n} já reservado(s) para solicitações aprovadas", "注意：已有 {n} 个预留给已审批的申领单"],
  ["O saldo foi gravado, mas o mínimo não. Ajuste o mínimo na tela de saldos.", "库存已保存，但最低库存未保存。请在库存页面调整最低库存。"],
  ["Você não tem permissão para fazer inventário.", "你没有盘点权限。"],
  ["Você não tem permissão para lançar entradas.", "你没有入库权限。"],
  ['Valor unitário "{v}" inválido.', "单价“{v}”无效。"],
  ["valor unitário R$ {v}", "单价 R$ {v}"],
  ["Valor unitário inválido.", "单价无效。"],
  ["Valor unitário não pode ser negativo.", "单价不能为负数。"],
  ["Valor unitário muito alto.", "单价过高。"],
  // ------------------------------------------------------------- Configurações (SLA)
  ["Prazo mínimo: 0,5 hora.", "最短时限：0.5 小时。"],
  ["Prazo máximo: 720 horas.", "最长时限：720 小时。"],
  ["Horário inválido. Use HH:MM.", "时间无效，请使用 HH:MM。"],
  ["Escolha ao menos um dia útil.", "请至少选择一个工作日。"],
  ["Feriado inválido. Use AAAA-MM-DD.", "节假日无效，请使用 AAAA-MM-DD。"],
  ["O fim do expediente precisa ser depois do início.", "下班时间必须晚于上班时间。"],
  ["Configurações salvas.", "设置已保存。"],
  // ------------------------------------------------------------- Ciclo e limites (S1–S3, regras do portal do Eduardo)
  ["Informe o número de pessoas na base.", "请填写网点人数。"],
  ["Informe um número de pessoas válido.", "请填写有效的人数。"],
  ["Esta base está no ciclo de {m} meses e poderá fazer uma nova solicitação após {data}.", "该网点处于 {m} 个月周期内，{data} 之后才能再次申领。"],
  ["{p} está bloqueado para nova solicitação até {data}.", "{p} 在 {data} 之前不能再次申领。"],
  ["Limite de insumos excedido para {p}. Limite permitido: {n} {u}.", "{p} 超出申领限额。允许上限：{n} {u}。"],
  ["Você já atingiu o limite de {n} {u} para {p}.", "你已达到 {p} 的限额 {n} {u}。"],
  ["Limite de insumos excedido para {p}. Restam {n} {u} no período de bloqueio.", "{p} 超出申领限额。本周期内还剩 {n} {u}。"],
  ['Limite "{v}" inválido: use um número inteiro (vazio = sem limite).', "限额“{v}”无效：请填写整数（留空 = 不限）。"],
  ['Dias de bloqueio "{v}" inválido: use de 1 a 3650.', "锁定天数“{v}”无效：请填写 1 到 3650。"],
  ["limite base", "网点限额"],
  ["limite franquia", "加盟商限额"],
  ["dias de bloqueio", "锁定天数"],
  ["Use um número inteiro de meses.", "请填写整数月数。"],
  ["Ciclo mínimo: 1 mês.", "周期最短 1 个月。"],
  ["Ciclo máximo: 24 meses.", "周期最长 24 个月。"],
  ["Informe uma data válida.", "请填写有效日期。"],
  ["Registro não encontrado.", "未找到记录。"],
  ["Liberado.", "已解除。"],
  ["Data atualizada.", "日期已更新。"],
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
