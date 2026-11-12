/**
 * Destino depois do login (?next=). Só aceita caminho interno, para não virar redirecionamento aberto.
 * Recusa "//site" e "/\site": os navegadores tratam "\" como "/", então "/\evil.com" vira "//evil.com".
 */
export function safeNext(n?: string | null): string {
  if (!n || !n.startsWith("/") || n.startsWith("//") || n.includes("\\")) return "/";
  // Caracteres de controle (ex.: tab, quebra de linha) também são ignorados pelos navegadores.
  if (/[\u0000-\u001f\u007f]/.test(n)) return "/";
  return n;
}
