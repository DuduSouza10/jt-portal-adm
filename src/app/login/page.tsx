import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { getT } from "@/i18n/server";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
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
      <div className="-mt-3 space-y-3">
        <p className="text-center text-sm text-muted-foreground">{t("login.semConta")}</p>
        <Button asChild variant="outline" className="h-12 w-full rounded-xl text-base font-semibold">
          <Link href="/cadastro">
            <UserPlus aria-hidden />
            {t("login.criarConta")}
          </Link>
        </Button>
      </div>
    </AuthShell>
  );
}
