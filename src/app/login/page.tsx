import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-gradient-to-b from-primary to-[oklch(0.45_0.19_27)] p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center">
          <Image
            src="/jt-coelho.png"
            alt="J&T Express"
            width={96}
            height={96}
            priority
            className="mx-auto mb-2 size-24 rounded-2xl shadow-md"
          />
          <CardTitle className="text-xl">Portal ADM</CardTitle>
          <CardDescription>Entre com seu usuário e senha</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-muted" />}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
