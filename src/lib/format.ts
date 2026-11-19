import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { ptBR, zhCN } from "date-fns/locale";

/** Fuso de exibição. No banco as datas ficam sempre em UTC. */
export const TZ = "America/Sao_Paulo";

/** Formato de data por idioma: 12/11/2026 em português, 2026/11/12 em chinês. */
const FORMATS = {
  "pt-BR": { date: "dd/MM/yyyy", locale: ptBR },
  "zh-CN": { date: "yyyy/MM/dd", locale: zhCN },
} as const;
type DateLocale = keyof typeof FORMATS;

/** Passe o idioma do usuário (t.locale) para seguir o formato dele; sem ele, português. */
export function fmtDateTime(d: Date | string | null | undefined, lang: DateLocale = "pt-BR") {
  if (!d) return "—";
  const f = FORMATS[lang];
  return format(new TZDate(new Date(d), TZ), `${f.date} HH:mm`, { locale: f.locale });
}

export function fmtDate(d: Date | string | null | undefined, lang: DateLocale = "pt-BR") {
  if (!d) return "—";
  const f = FORMATS[lang];
  return format(new TZDate(new Date(d), TZ), f.date, { locale: f.locale });
}
