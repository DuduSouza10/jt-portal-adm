"use client";

import { useActionState } from "react";
import { CircleCheck, CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useServerMessage, useT } from "@/i18n/client";
import type { FormState } from "@/lib/action-result";

/**
 * Formulário padrão do portal: mostra erro/mensagem da action e desabilita o botão enquanto salva.
 * Os campos vêm como children (podem ser renderizados no servidor).
 * As mensagens do servidor chegam em português e são traduzidas aqui (src/i18n/server-messages.ts).
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  className = "space-y-4",
  variant = "default",
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  /** Padrão: "Salvar" no idioma do usuário. */
  submitLabel?: string;
  children?: React.ReactNode;
  className?: string;
  variant?: "default" | "outline" | "destructive";
}) {
  const t = useT();
  const tm = useServerMessage();
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{tm(state.error)}</AlertDescription>
        </Alert>
      )}
      {state.message && (
        <Alert className="border-success/40 bg-success/5">
          <CircleCheck className="text-success" />
          <AlertDescription className="font-medium text-foreground">{tm(state.message)}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" variant={variant} disabled={pending}>
        {pending ? t("comum.salvando") : (submitLabel ?? t("comum.salvar"))}
      </Button>
    </form>
  );
}
