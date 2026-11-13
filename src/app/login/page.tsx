import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { getT } from "@/i18n/server";
import { BrasilMapa } from "@/components/brasil-mapa";
import { LanguageSwitch, ThemeToggle } from "@/components/preferences";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("login.entrar") };
}

export default async function LoginPage() {
  const t = await getT();
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]">
      {/* Formulário */}
      <section className="flex flex-col px-5 py-6 sm:px-10 lg:px-14">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <Image src="/jt-coelho.png" alt="" width={36} height={36} className="size-9 rounded-[11px]" priority />
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
        <div className="m-auto flex w-full max-w-[390px] flex-col gap-8 py-12">
          <div className="space-y-2">
            <h1 className="text-[34px] leading-[1.1] font-semibold tracking-tight">{t("login.titulo")}</h1>
            <p className="text-[15px] text-muted-foreground">{t("login.subtitulo")}</p>
          </div>
          <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
            <LoginForm />
          </Suspense>
        </div>
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <p>{t("login.rodape")}</p>
          <p>{t("app.creditos")}</p>
        </div>
      </section>

      {/* Painel da marca (telas grandes): vermelho J&T com as rotas das bases. */}
      <section
        aria-hidden
        className="relative isolate m-4 hidden overflow-hidden rounded-[28px] bg-primary p-12 text-primary-foreground lg:block dark:bg-[color-mix(in_oklab,var(--primary),black_24%)]"
      >
        <div className="relative z-10 max-w-[470px] space-y-4">
          <p className="text-[44px] leading-[1.08] font-semibold tracking-tight text-balance break-keep">{t("login.destaque")}</p>
          <p className="max-w-[420px] text-lg text-primary-foreground/90">{t("login.detalhe")}</p>
        </div>
        <BrasilMapa className="pointer-events-none absolute right-[3%] bottom-[3%] -z-0 w-[80%] text-primary-foreground" />
        <p className="absolute bottom-10 left-12 z-10 text-sm font-medium text-primary-foreground/90">{t("app.empresa")}</p>
      </section>
    </main>
  );
}
