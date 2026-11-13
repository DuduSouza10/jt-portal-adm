"use client";

import { useState, useTransition } from "react";
import { Play, Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { runJobsNowAction, sendTestAction, type TestState } from "./actions";

export function TestButtons() {
  const [state, setState] = useState<TestState>({});
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<TestState>) => start(async () => setState(await fn()));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled={pending} onClick={() => run(() => sendTestAction("equipe"))}>
          <Send /> Testar aviso da equipe
        </Button>
        <Button size="lg" variant="outline" disabled={pending} onClick={() => run(() => sendTestAction("expedicao"))}>
          <Send /> Testar aviso da expedição
        </Button>
        <Button size="lg" variant="outline" disabled={pending} onClick={() => run(() => sendTestAction("eu"))}>
          <Send /> Testar mensagem para mim
        </Button>
        <Button size="lg" variant="ghost" disabled={pending} onClick={() => run(runJobsNowAction)}>
          <Play /> Rodar lembretes agora
        </Button>
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state.message && (
        <Alert>
          <AlertDescription className="break-all text-foreground">{state.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
