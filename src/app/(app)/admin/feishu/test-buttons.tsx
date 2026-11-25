"use client";

import { useState, useTransition } from "react";
import { Play, Send } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useServerMessage, useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { runJobsNowAction, sendTestAction, type TestState } from "./actions";

export function TestButtons() {
  const t = useT();
  const tm = useServerMessage();
  const [state, setState] = useState<TestState>({});
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<TestState>) => start(async () => setState(await fn()));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled={pending} onClick={() => run(() => sendTestAction("equipe"))}>
          <Send /> {t("feishu.testarEquipe")}
        </Button>
        <Button size="lg" variant="outline" disabled={pending} onClick={() => run(() => sendTestAction("expedicao"))}>
          <Send /> {t("feishu.testarExpedicao")}
        </Button>
        <Button size="lg" variant="outline" disabled={pending} onClick={() => run(() => sendTestAction("eu"))}>
          <Send /> {t("feishu.testarEu")}
        </Button>
        <Button size="lg" variant="ghost" disabled={pending} onClick={() => run(runJobsNowAction)}>
          <Play /> {t("feishu.rodarLembretes")}
        </Button>
      </div>
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{tm(state.error)}</AlertDescription>
        </Alert>
      )}
      {state.message && (
        <Alert className="border-success/40 bg-success/5">
          <AlertDescription className="break-all text-foreground">{tm(state.message)}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/** Teste do caminho de uma regional: manda o cartão para o grupo que os avisos dela realmente usam. */
export function RegionalTestButtons({ regionalId }: { regionalId: string }) {
  const t = useT();
  const tm = useServerMessage();
  const [state, setState] = useState<TestState>({});
  const [pending, start] = useTransition();
  const run = (alvo: "equipe" | "expedicao") => start(async () => setState(await sendTestAction(alvo, regionalId)));
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run("equipe")}>
        <Send /> {t("feishu.testarInsumos")}
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run("expedicao")}>
        <Send /> {t("feishu.testarExpedicaoCurto")}
      </Button>
      {state.error && <span className="text-xs text-destructive">{tm(state.error)}</span>}
      {state.message && <span className="text-xs text-success">{tm(state.message)}</span>}
    </span>
  );
}
