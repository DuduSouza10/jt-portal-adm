"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/action-result";

/**
 * Formulário padrão do portal: mostra erro/mensagem da action e desabilita o botão enquanto salva.
 * Os campos vêm como children (podem ser renderizados no servidor).
 */
export function ActionForm({
  action,
  submitLabel = "Salvar",
  children,
  className = "space-y-4",
  variant = "default",
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submitLabel?: string;
  children?: React.ReactNode;
  className?: string;
  variant?: "default" | "outline" | "destructive";
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.message && (
        <Alert>
          <AlertDescription className="font-medium text-foreground">{state.message}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" variant={variant} disabled={pending}>
        {pending ? "Salvando..." : submitLabel}
      </Button>
    </form>
  );
}
