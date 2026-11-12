"use client";

import { useActionState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerMessage, useT } from "@/i18n/client";
import { changePasswordAction, type PasswordState } from "./actions";

export function PasswordForm() {
  const t = useT();
  const tm = useServerMessage();
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="current">{t("senha.atual")}</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="next">{t("senha.nova", { min: 8 })}</Label>
        <Input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">{t("senha.confirmar")}</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state.error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{tm(state.error)}</AlertDescription>
        </Alert>
      )}
      {state.ok && (
        <Alert className="border-success/40 bg-success/5">
          <CircleCheck className="text-success" />
          <AlertDescription className="text-foreground">{t("senha.sucesso")}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? t("comum.salvando") : t("senha.salvar")}
      </Button>
    </form>
  );
}
