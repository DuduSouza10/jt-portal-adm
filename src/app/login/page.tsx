import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { getT } from "@/i18n/server";
import { LanguageSwitch, ThemeToggle } from "@/components/preferences";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("login.entrar") };
}

export default async function LoginPage() {
  const t = await getT();
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Formulário */}
      <section className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <Image src="/jt-coelho.png" alt="" width={34} height={34} className="size-[34px] rounded-[10px]" priority />
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold tracking-tight">{t("app.nome")}</span>
              <span className="block text-xs text-muted-foreground">{t("app.empresa")}</span>
            </span>
          </span>
          <div className="flex items-center gap-1.5">
            <LanguageSwitch tone="plain" />
            <ThemeToggle className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-ring" />
          </div>
        </div>
        <div className="m-auto flex w-full max-w-[380px] flex-col gap-6 py-12">
          <div className="space-y-1.5">
            <h1 className="text-3xl font-semibold tracking-tight">{t("login.titulo")}</h1>
            <p className="text-muted-foreground">{t("login.subtitulo")}</p>
          </div>
          <Suspense fallback={<div className="h-56 animate-pulse rounded-xl bg-muted" />}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="text-xs text-muted-foreground">{t("login.rodape")}</p>
      </section>

      {/* Painel da marca (telas grandes) */}
      <section aria-hidden className="m-4 hidden flex-col justify-between rounded-3xl border bg-card p-11 lg:flex">
        <Image src="/jt-coelho.png" alt="" width={88} height={88} className="size-22 rounded-3xl shadow-[0_18px_40px_-16px_rgb(230_0_18/0.45)]" />
        <div className="max-w-md space-y-4">
          <p className="text-4xl leading-[1.15] font-semibold tracking-tight text-balance">{t("login.destaque")}</p>
          <p className="text-lg text-muted-foreground">{t("login.detalhe")}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-primary" />
          {t("app.empresa")}
        </div>
      </section>
    </main>
  );
}
