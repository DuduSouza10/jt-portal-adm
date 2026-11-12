"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="current">Senha atual</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="next">Nova senha (mín. 8 caracteres)</Label>
        <Input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmar nova senha</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.ok && (
        <Alert>
          <AlertDescription>Senha alterada com sucesso.</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        Salvar nova senha
      </Button>
    </form>
  );
}
