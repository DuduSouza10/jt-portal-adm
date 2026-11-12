import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Fuso de exibição. No banco as datas ficam sempre em UTC. */
export const TZ = "America/Sao_Paulo";

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return format(new TZDate(new Date(d), TZ), "dd/MM/yyyy HH:mm", { locale: ptBR });
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return format(new TZDate(new Date(d), TZ), "dd/MM/yyyy", { locale: ptBR });
}
