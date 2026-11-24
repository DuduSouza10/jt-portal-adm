"use client";

import { ImportWizard } from "@/components/import-wizard";
import { parseBases } from "@/modules/estrutura/importacao";
import { aplicarBasesAction, validarBasesAction } from "./actions";

// Lotes iguais aos do servidor (estrutura/importacao.service.ts).
export function BasesImportWizard({ instructions }: { instructions: React.ReactNode }) {
  return (
    <ImportWizard
      instructions={instructions}
      template={{ filename: "modelo-importacao-bases.xlsx", href: "/api/modelos/bases" }}
      parse={parseBases}
      validar={(rows) => validarBasesAction(rows)}
      aplicar={(rows) => aplicarBasesAction(rows)}
      validateBatch={500}
      applyBatch={50}
    />
  );
}
