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
    <main className="grid flex-1 lg:grid-cols-[1.1fr_1fr]">
      {/* Painel da marca (telas grandes) */}
      <section className="hero-panel brand-stripes relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Image src="/jt-coelho.png" alt="" width={44} height={44} className="size-11 rounded-xl shadow-md ring-2 ring-white/40" priority />
          <span className="leading-none">
            <span className="block text-lg font-bold">{t("app.nome")}</span>
            <span className="mt-1 block text-xs text-white/75">{t("app.empresa")}</span>
          </span>
        </div>
        <div className="max-w-lg space-y-4">
          <p className="text-4xl leading-tight font-bold tracking-tight text-balance xl:text-5xl">{t("login.destaque")}</p>
          <p className="text-lg text-white/85">{t("login.detalhe")}</p>
        </div>
        <p className="text-sm text-white/70">{t("login.rodape")}</p>
        <div aria-hidden className="absolute -right-24 -bottom-24 size-96 rounded-full bg-white/10" />
        <div aria-hidden className="absolute -right-8 -bottom-8 size-56 rounded-full bg-white/10" />
      </section>

      {/* Formulário */}
      <section className="relative flex flex-col">
        <div className="flex items-center justify-between gap-2 p-4 sm:p-6">
          <span className="flex items-center gap-2 lg:invisible">
            <Image src="/jt-coelho.png" alt="" width={32} height={32} className="size-8 rounded-lg shadow-sm" priority />
            <span className="font-bold">{t("app.nome")}</span>
          </span>
          <div className="flex items-center gap-1.5">
            <LanguageSwitch tone="plain" />
            <ThemeToggle className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-ring" />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16">
          <div className="w-full max-w-sm space-y-8">
            <div className="space-y-2">
              <span aria-hidden className="block h-1.5 w-12 rounded-full bg-primary" />
              <h1 className="text-3xl font-bold tracking-tight">{t("login.titulo")}</h1>
              <p className="text-muted-foreground">{t("login.subtitulo")}</p>
            </div>
            <Suspense fallback={<div className="h-56 animate-pulse rounded-xl bg-muted" />}>
              <LoginForm />
            </Suspense>
            <p className="text-center text-xs text-muted-foreground lg:hidden">{t("login.rodape")}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
