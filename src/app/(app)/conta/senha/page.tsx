import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Trocar senha" };

export default async function PasswordPage() {
  const user = await requireUser({ allowPendingPasswordChange: true });
  return (
    <div className="mx-auto max-w-md space-y-4">
      {user.mustChangePassword && (
        <Alert>
          <AlertDescription>Sua senha foi redefinida. Crie uma nova senha para continuar.</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Trocar senha</CardTitle>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
