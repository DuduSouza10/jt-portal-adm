"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form-field";
import { inventarioAction, type LancamentoState } from "../actions";

type Linha = { produtoId: string; code: string; name: string; unit: string; atual: number; reservado: number };

/**
 * Contagem de inventário. Só os produtos com contagem preenchida entram no ajuste:
 * dá para fazer o inventário por partes (ex.: um corredor por vez).
 */
export function InventarioForm({ baseId, baseLabel, linhas }: { baseId: string; baseLabel: string; linhas: Linha[] }) {
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
        <Alert>
          <AlertDescription className="font-medium text-foreground">{state.message}</AlertDescription>
        </Alert>
        {!!state.warnings?.length && (
          <Alert variant="destructive">
            <AlertTitle>Contagem abaixo do reservado</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {state.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
              Revise essas solicitações aprovadas: o envio delas vai falhar até haver saldo físico.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>Nova contagem</Button>
          {state.batchId && (
            <Button asChild variant="outline">
              <Link href={`/estoque/movimentacoes?lote=${state.batchId}`}>Ver os ajustes</Link>
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
        Almoxarifado: <span className="font-medium text-foreground">{baseLabel}</span>. Deixe em branco o que não foi contado.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Motivo / referência" htmlFor="reason">
          <Input id="reason" name="reason" required minLength={3} maxLength={300} placeholder="Ex.: Inventário mensal de novembro" />
        </Field>
        <Field label="Filtrar produtos" htmlFor="filtro">
          <Input id="filtro" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Código ou nome" />
        </Field>
      </div>

      <div className="max-h-[60vh] overflow-y-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr className="text-left">
              <th className="p-2">Produto</th>
              <th className="p-2 text-right">No sistema</th>
              <th className="p-2 text-right">Reservado</th>
              <th className="p-2 text-right">Contado</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => {
              const v = contagem[l.produtoId] ?? "";
              const diff = v !== "" ? Number(v) - l.atual : 0;
              return (
                <tr key={l.produtoId} className="border-t">
                  <td className="p-2">
                    <span className="font-medium">{l.code}</span> {l.name} <span className="text-xs text-muted-foreground">({l.unit})</span>
                  </td>
                  <td className="p-2 text-right tabular-nums">{l.atual}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{l.reservado || "—"}</td>
                  <td className="p-2 text-right">
                    <div className="inline-flex items-center gap-2">
                      {v !== "" && diff !== 0 && (
                        <span className={`text-xs tabular-nums ${diff < 0 ? "text-destructive" : "text-emerald-700"}`}>
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      )}
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={v}
                        aria-label={`Contagem de ${l.code}`}
                        onChange={(e) => setContagem((c) => ({ ...c, [l.produtoId]: e.target.value }))}
                        className={`h-8 w-24 rounded-md border bg-background px-2 text-right tabular-nums ${
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
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending || itens.length === 0}>
          {pending ? "Registrando..." : "Registrar inventário"}
        </Button>
        <span className="text-sm text-muted-foreground">
          {itens.length} contado(s) · {diferencas} com diferença
        </span>
      </div>
    </form>
  );
}
