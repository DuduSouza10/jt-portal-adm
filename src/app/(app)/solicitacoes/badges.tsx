import type { Prioridade, SolicitacaoStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL } from "@/modules/solicitacoes/rules";

const STATUS_CLASS: Record<SolicitacaoStatus, string> = {
  PENDENTE: "border-amber-500 text-amber-700",
  APROVADA: "border-sky-500 text-sky-700",
  EM_SEPARACAO: "border-indigo-500 text-indigo-700",
  SEPARADA: "border-violet-500 text-violet-700",
  ENVIADA: "border-emerald-500 text-emerald-700",
  RECEBIDA: "border-emerald-700 text-emerald-800",
  RECUSADA: "border-red-500 text-red-700",
  CANCELADA: "text-muted-foreground",
};

export function StatusBadge({ status }: { status: SolicitacaoStatus }) {
  return (
    <Badge variant="outline" className={STATUS_CLASS[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Prioridade }) {
  if (priority !== "URGENTE") return null;
  return <Badge variant="destructive">Urgente</Badge>;
}
