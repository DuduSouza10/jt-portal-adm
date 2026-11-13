"use client";

import type { Prioridade, SolicitacaoStatus } from "@/generated/prisma/enums";
import { useT } from "@/i18n/client";
import { statusText } from "@/i18n/labels";
import { Badge } from "@/components/ui/badge";

/** Só tokens do tema (claro e escuro). O texto já diz o status; a cor só reforça. Componente de cliente para servir às telas do servidor e do quadro da expedição. */
const STATUS_CLASS: Record<SolicitacaoStatus, string> = {
  PENDENTE: "border-warning/50 bg-warning/10 text-warning",
  APROVADA: "border-border bg-muted text-foreground",
  EM_SEPARACAO: "border-primary/30 bg-accent text-accent-foreground",
  SEPARADA: "border-primary/60 bg-accent text-accent-foreground",
  ENVIADA: "border-success/40 bg-success/10 text-success",
  RECEBIDA: "border-success bg-success/15 text-success",
  RECUSADA: "border-destructive/40 bg-destructive/10 text-destructive",
  CANCELADA: "border-border text-muted-foreground",
};

export function StatusBadge({ status }: { status: SolicitacaoStatus }) {
  const t = useT();
  return (
    <Badge variant="outline" className={STATUS_CLASS[status]}>
      {statusText(t, status)}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Prioridade }) {
  const t = useT();
  if (priority !== "URGENTE") return null;
  return <Badge variant="destructive">{t("solicitacoes.prioridade.URGENTE")}</Badge>;
}
