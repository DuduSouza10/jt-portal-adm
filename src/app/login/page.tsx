import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getT } from "@/i18n/server";
import { AuthShell } from "@/components/auth-shell";
import { isFeishuLoginEnabled } from "@/lib/feishu/config";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("login.entrar") };
}

export default async function LoginPage() {
  const t = await getT();
  return (
    <AuthShell title={t("login.titulo")} subtitle={t("login.subtitulo")}>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" />}>
        <LoginForm feishu={isFeishuLoginEnabled()} />
      </Suspense>
      <p className="-mt-3 text-center text-sm text-muted-foreground">
        {t("login.semConta")}{" "}
        <Link href="/cadastro" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("login.criarConta")}
        </Link>
      </p>
    </AuthShell>
  );
}
