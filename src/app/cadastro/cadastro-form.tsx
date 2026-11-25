"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectBox } from "@/components/ui/combobox";
import { Field } from "@/components/form-field";
import { useKeepForm } from "@/components/use-keep-form";
import { useServerMessage, useT } from "@/i18n/client";
import type { FormState } from "@/lib/action-result";
import { cadastroAction } from "./actions";

type Regional = { id: string; code: string; name: string };
type Franquia = { id: string; code: string; name: string; regionalId: string };

const campo = "h-11 rounded-xl bg-card text-[15px] shadow-xs md:text-[15px]";

export function CadastroForm({ regionais, franquias }: { regionais: Regional[]; franquias: Franquia[] }) {
  const t = useT();
  const tm = useServerMessage();
  const { state, pending, formProps } = useKeepForm<FormState>(cadastroAction, {});
  const [regionalId, setRegionalId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [nova, setNova] = useState(false);
  const [verSenha, setVerSenha] = useState(false);

  // Só as franquias da regional escolhida; ao trocar de regional, a franquia escolhida antes sai.
  const opcoes = useMemo(
    () => franquias.filter((f) => f.regionalId === regionalId).map((f) => ({ value: f.id, hint: f.code, label: f.name })),
    [franquias, regionalId],
  );

  return (
    <form {...formProps} className="space-y-4">
      <Field label={t("cadastro.nome")} htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required minLength={5} className={campo} />
      </Field>
      <Field label={t("cadastro.regional")} htmlFor="regionalId">
        <SelectBox
          id="regionalId"
          name="regionalId"
          required
          value={regionalId}
          onValueChange={(v) => {
            setRegionalId(v);
            setBaseId("");
            setNova(false);
          }}
          options={regionais.map((r) => ({ value: r.id, hint: r.code, label: r.name }))}
          placeholder={t("cadastro.escolhaRegional")}
          className="h-11 rounded-xl"
        />
      </Field>
      <Field label={t("cadastro.franquia")} htmlFor="baseId" hint={regionalId ? undefined : t("cadastro.franquiaDica")}>
        {nova ? (
          <Input id="baseId" name="novaFranquia" required minLength={2} maxLength={60} placeholder={t("cadastro.novaFranquiaPh")} className={campo} />
        ) : (
          <SelectBox
            id="baseId"
            name="baseId"
            required
            disabled={!regionalId}
            value={baseId}
            onValueChange={setBaseId}
            options={opcoes}
            placeholder={t("cadastro.escolhaFranquia")}
            className="h-11 rounded-xl"
          />
        )}
        {regionalId && (
          <button
            type="button"
            onClick={() => (setNova((v) => !v), setBaseId(""))}
            className="mt-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {nova ? t("cadastro.voltarLista") : t("cadastro.naoEstaNaLista")}
          </button>
        )}
        {nova && <p className="text-xs text-muted-foreground">{t("cadastro.novaFranquiaDica")}</p>}
      </Field>
      <Field label={t("cadastro.usuario")} htmlFor="login" hint={t("cadastro.usuarioDica")}>
        <Input id="login" name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={40} className={campo} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("cadastro.senha")} htmlFor="password">
          <div className="relative">
            <Input id="password" name="password" type={verSenha ? "text" : "password"} autoComplete="new-password" required minLength={8} className={`${campo} pr-11`} />
            <button
              type="button"
              onClick={() => setVerSenha((v) => !v)}
              aria-label={verSenha ? t("login.ocultarSenha") : t("login.mostrarSenha")}
              aria-pressed={verSenha}
              className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {verSenha ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
            </button>
          </div>
        </Field>
        <Field label={t("cadastro.confirmar")} htmlFor="confirm">
          <Input id="confirm" name="confirm" type={verSenha ? "text" : "password"} autoComplete="new-password" required minLength={8} className={campo} />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{t("cadastro.senhaDica", { n: 8 })}</p>
      {state.error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{tm(state.error)}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} className="group h-12 w-full rounded-xl text-base font-semibold">
        {pending ? t("cadastro.criando") : t("cadastro.criar")}
        {!pending && <ArrowRight className="transition-transform group-hover:translate-x-0.5" />}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {t("cadastro.jaTem")}{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("login.entrar")}
        </Link>
      </p>
    </form>
  );
}
