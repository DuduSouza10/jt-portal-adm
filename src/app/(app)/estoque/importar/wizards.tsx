"use client";

import { ImportWizard, type ImportOption } from "@/components/import-wizard";
import { ESTOQUE_TEMPLATE_CSV, parseEstoque } from "@/modules/estoque/importacao";
import { parseProdutos, PRODUTOS_TEMPLATE_CSV } from "@/modules/produtos/importacao";
import { aplicarEstoqueAction, aplicarProdutosAction, validarEstoqueAction, validarProdutosAction } from "./actions";

// Lotes iguais aos do servidor (estoque/importacao.service.ts e produtos/importacao.service.ts).

export function EstoqueImportWizard({ instructions, options }: { instructions: React.ReactNode; options: ImportOption[] }) {
  return (
    <ImportWizard
      instructions={instructions}
      template={{ filename: "modelo-importacao-estoque.csv", csv: ESTOQUE_TEMPLATE_CSV }}
      parse={parseEstoque}
      options={options}
      validar={(rows, o) => validarEstoqueAction(rows, o)}
      aplicar={(rows, o) => aplicarEstoqueAction(rows, o)}
      validateBatch={500}
      applyBatch={200}
    />
  );
}

export function ProdutosImportWizard({ instructions }: { instructions: React.ReactNode }) {
  return (
    <ImportWizard
      instructions={instructions}
      template={{ filename: "modelo-importacao-produtos.csv", csv: PRODUTOS_TEMPLATE_CSV }}
      parse={parseProdutos}
      validar={(rows) => validarProdutosAction(rows)}
      aplicar={(rows) => aplicarProdutosAction(rows)}
      validateBatch={500}
      applyBatch={100}
    />
  );
}
