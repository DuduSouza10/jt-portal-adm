"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CircleAlert, Eye, EyeOff, Lock, TriangleAlert, User } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerMessage, useT } from "@/i18n/client";
import { loginAction, type LoginState } from "./actions";

const campo = "h-12 rounded-xl bg-card pl-11 text-[15px] shadow-xs md:text-[15px]";
const icone = "pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground";

export function LoginForm() {
  const t = useT();
  const tm = useServerMessage();
  const params = useSearchParams();
  const next = params.get("next") ?? "";
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  // O React limpa os campos não controlados depois da action; o usuário fica, só a senha é refeita.
  const [usuario, setUsuario] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [caps, setCaps] = useState(false);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="login">{t("login.usuario")}</Label>
        <div className="relative">
          <User className={icone} aria-hidden />
          <Input
            id="login"
            name="login"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            className={campo}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("login.senha")}</Label>
        <div className="relative">
          <Lock className={icone} aria-hidden />
          <Input
            id="password"
            name="password"
            type={verSenha ? "text" : "password"}
            autoComplete="current-password"
            required
            className={`${campo} pr-12`}
            onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
            onBlur={() => setCaps(false)}
          />
          <button
            type="button"
            onClick={() => setVerSenha((v) => !v)}
            aria-label={verSenha ? t("login.ocultarSenha") : t("login.mostrarSenha")}
            aria-pressed={verSenha}
            className="absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {verSenha ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        </div>
        {caps && (
          <p role="status" className="flex items-center gap-1.5 text-xs text-warning">
            <TriangleAlert className="size-3.5" aria-hidden />
            {t("login.capsLock")}
          </p>
        )}
      </div>
      {state.error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{tm(state.error)}</AlertDescription>
        </Alert>
      )}
      <Button
        type="submit"
        disabled={pending}
        className="group h-12 w-full rounded-xl text-base font-semibold shadow-[0_12px_28px_-12px_var(--primary)] transition-shadow hover:shadow-[0_16px_32px_-12px_var(--primary)]"
      >
        {pending ? t("login.entrando") : t("login.entrar")}
        {!pending && <ArrowRight className="transition-transform group-hover:translate-x-0.5" />}
      </Button>
    </form>
  );
}
