"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form-field";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useServerMessage, useT } from "@/i18n/client";
import { inventarioAction, type LancamentoState } from "../actions";

type Linha = { produtoId: string; code: string; name: string; unit: string; atual: number; reservado: number };

/**
 * Contagem de inventário. Só os produtos com contagem preenchida entram no ajuste:
 * dá para fazer o inventário por partes (ex.: um corredor por vez).
 */
export function InventarioForm({ baseId, baseLabel, linhas }: { baseId: string; baseLabel: string; linhas: Linha[] }) {
  const t = useT();
  const tm = useServerMessage();
  const [state, action, pending] = useActionState<LancamentoState, FormData>(inventarioAction, {});
  const [contagem, setContagem] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState("");

  const itens = Object.entries(contagem)
    .filter(([, v]) => v !== "")
    .map(([produtoId, v]) => ({ produtoId, quantity: Number(v) }));
  const diferencas = itens.filter((i) => i.quantity !== linhas.find((l) => l.produtoId === i.produtoId)?.atual).length;
  const visiveis = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return f ? linhas.filter((l) => l.code.toLowerCase().includes(f) || l.name.toLowerCase().includes(f)) : linhas;
  }, [filtro, linhas]);

  if (state.ok) {
    return (
      <div className="space-y-4">
        <Alert className="border-success/40 bg-success/5">
          <CircleCheck className="text-success" />
          <AlertDescription className="font-medium text-foreground">{tm(state.message ?? "")}</AlertDescription>
        </Alert>
        {!!state.warnings?.length && (
          <Alert variant="destructive">
            <AlertTitle>{t("inventario.abaixoReservado")}</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {state.warnings.map((w) => (
                  <li key={w}>{tm(w)}</li>
                ))}
              </ul>
              {t("inventario.revise")}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>{t("inventario.novaContagem")}</Button>
          {state.batchId && (
            <Button asChild variant="outline">
              <Link href={`/estoque/movimentacoes?lote=${state.batchId}`}>{t("inventario.verAjustes")}</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="baseId" value={baseId} />
      <input type="hidden" name="itens" value={JSON.stringify(itens)} />
      <p className="text-sm text-muted-foreground">
        {t("inventario.almox")} <span className="font-medium text-foreground">{baseLabel}</span>. {t("inventario.deixeBranco")}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("inventario.motivo")} htmlFor="reason">
          <Input id="reason" name="reason" required minLength={3} maxLength={300} placeholder={t("inventario.motivoExemplo")} />
        </Field>
        <Field label={t("inventario.filtrar")} htmlFor="filtro">
          <Input id="filtro" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder={t("inventario.filtrarDica")} />
        </Field>
      </div>

      <div className="max-h-[60vh] overflow-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
            <tr className="text-left">
              <th className="p-2.5 font-semibold">{t("inventario.colProduto")}</th>
              <th className="p-2.5 text-right font-semibold">{t("inventario.colSistema")}</th>
              <th className="p-2.5 text-right font-semibold">{t("inventario.colReservado")}</th>
              <th className="p-2.5 text-right font-semibold">{t("inventario.colContado")}</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => {
              const v = contagem[l.produtoId] ?? "";
              const diff = v !== "" ? Number(v) - l.atual : 0;
              return (
                <tr key={l.produtoId} className="border-t transition-colors hover:bg-muted/40">
                  <td className="p-2">
                    <span className="font-medium">{l.code}</span> {l.name} <span className="text-xs text-muted-foreground">({l.unit})</span>
                  </td>
                  <td className="p-2 text-right tabular-nums">{l.atual}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{l.reservado || "—"}</td>
                  <td className="p-2 text-right">
                    <div className="inline-flex items-center gap-2">
                      {v !== "" && diff !== 0 && (
                        <span className={`text-xs tabular-nums ${diff < 0 ? "text-destructive" : "text-success"}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      )}
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={v}
                        aria-label={t("inventario.contagemAria", { code: l.code })}
                        onChange={(e) => setContagem((c) => ({ ...c, [l.produtoId]: e.target.value }))}
                        className={`h-8 w-24 rounded-md border border-input bg-card px-2 text-right tabular-nums outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30 ${
                          v !== "" && Number(v) < l.reservado ? "border-destructive" : ""
                        }`}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {state.error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{tm(state.error)}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending || itens.length === 0}>
          {pending ? t("comum.registrando") : t("inventario.registrar")}
        </Button>
        <span className="text-sm text-muted-foreground">
          {t("inventario.resumo", { n: itens.length, d: diferencas })}
        </span>
      </div>
    </form>
  );
}
