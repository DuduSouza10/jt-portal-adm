"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerMessage, useT } from "@/i18n/client";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const t = useT();
  const tm = useServerMessage();
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="login">{t("login.usuario")}</Label>
        <Input id="login" name="login" autoComplete="username" autoCapitalize="none" required className="h-11" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("login.senha")}</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" />
      </div>
      {state.error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{tm(state.error)}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="h-11 w-full text-base" disabled={pending}>
        {pending ? t("login.entrando") : t("login.entrar")}
        {!pending && <ArrowRight />}
      </Button>
    </form>
  );
}
