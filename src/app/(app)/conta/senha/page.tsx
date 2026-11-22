import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordForm } from "./password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("senha.titulo") };
}

export default async function PasswordPage() {
  const [user, t] = await Promise.all([requireUser({ allowPendingPasswordChange: true }), getT()]);
  return (
    <div className="mx-auto max-w-md space-y-4">
      {user.mustChangePassword && (
        <Alert className="border-warning/40 bg-warning/10">
          <AlertDescription className="text-foreground">{t("senha.redefinida")}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 text-lg">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
              <KeyRound className="size-4.5" />
            </span>
            {t("senha.titulo")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
