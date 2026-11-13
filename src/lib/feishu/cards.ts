// Cartões interativos (message cards) do Feishu. Funções puras (testadas em cards.test.ts).
// Genéricos: cada módulo monta o conteúdo (título, linhas, link) e usa `card()`.

export type Card = Record<string, unknown>;

/** Cores de cabeçalho aceitas pelo Feishu. */
export type Template = "blue" | "wathet" | "turquoise" | "green" | "yellow" | "orange" | "red" | "carmine" | "violet" | "purple" | "indigo" | "grey";

const md = (content: string) => ({ tag: "div", text: { tag: "lark_md", content } });

/**
 * Texto digitado pelo usuário: troca o que o lark_md interpretaria como tag/menção (<at>) ou
 * ênfase por caracteres parecidos, já que o Feishu não garante escape com barra invertida.
 */
export const escapeMd = (s: string) =>
  s.replace(/</g, "‹").replace(/>/g, "›").replace(/\*/g, "∗").replace(/~/g, "∼").replace(/\[/g, "［").replace(/]/g, "］");

export function card(title: string, template: Template, lines: string[], url?: string, buttonLabel = "Abrir"): Card {
  const elements: unknown[] = lines.filter(Boolean).map(md);
  if (url) {
    elements.push({
      tag: "action",
      actions: [{ tag: "button", text: { tag: "plain_text", content: buttonLabel }, type: "primary", url }],
    });
  }
  return {
    config: { wide_screen_mode: true },
    header: { template, title: { tag: "plain_text", content: title } },
    elements,
  };
}

/** Título do cartão (para a lista de mensagens no admin). */
export const cardTitle = (c: Card) => (c as { header?: { title?: { content?: string } } }).header?.title?.content;

export function testCard(appUrl: string, who: string) {
  return card(
    "✅ Teste do Portal ADM",
    "green",
    [`Mensagem de teste enviada por **${escapeMd(who)}**. Se você está lendo isto, a integração com o Feishu está funcionando.`],
    appUrl,
    "Abrir portal",
  );
}
