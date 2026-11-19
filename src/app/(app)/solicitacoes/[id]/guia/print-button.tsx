"use client";

import { Printer } from "lucide-react";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  const t = useT();
  return (
    <Button size="lg" onClick={() => window.print()}>
      <Printer /> {t("solicitacoes.guia.imprimir")}
    </Button>
  );
}
