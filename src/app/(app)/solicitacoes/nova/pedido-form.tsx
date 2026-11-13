"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, selectClass } from "@/components/form-field";
import { useServerMessage, useT } from "@/i18n/client";
import type { FormState } from "@/lib/action-result";
import { criarAction } from "../actions";

type Produto = { id: string; code: string; name: string; unit: string };
type Base = { id: string; code: string; name: string };
type Linha = { key: number; produtoId: string; texto: string; quantity: string };

export function PedidoForm({ bases, produtos }: { bases: Base[]; produtos: Produto[] }) {
  const t = useT();
  const tm = useServerMessage();
  const [state, action, pending] = useActionState<FormState, FormData>(criarAction, {});
  const nextKey = useRef(1);
  const [linhas, setLinhas] = useState<Linha[]>([{ key: 0, produtoId: "", texto: "", quantity: "" }]);

  // Busca por "CÓDIGO — nome": o datalist do navegador filtra conforme digita.
  const byLabel = useMemo(() => new Map(produtos.map((p) => [`${p.code} — ${p.name}`, p])), [produtos]);
  const byId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  const update = (key: number, patch: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLinha = () => setLinhas((ls) => [...ls, { key: nextKey.current++, produtoId: "", texto: "", quantity: "" }]);
  const itens = linhas.filter((l) => l.produtoId || l.quantity).map((l) => ({ produtoId: l.produtoId, quantity: Number(l.quantity) }));
  const invalid = itens.length === 0 || itens.some((i) => !i.produtoId || !(i.quantity > 0));

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="itens" value={JSON.stringify(itens)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("solicitacoes.nova.base")} htmlFor="baseId">
          {bases.length === 1 ? (
            <>
              <input type="hidden" name="baseId" value={bases[0].id} />
              <p id="baseId" className="pt-2 text-sm font-medium">
                {bases[0].code} · {bases[0].name}
              </p>
            </>
          ) : (
            <select id="baseId" name="baseId" required className={selectClass} defaultValue="">
              <option value="" disabled>
                {t("solicitacoes.nova.escolhaBase")}
              </option>
              {bases.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t("solicitacoes.nova.prioridade")} htmlFor="priority">
          <select id="priority" name="priority" className={selectClass} defaultValue="NORMAL">
            <option value="NORMAL">{t("solicitacoes.prioridade.NORMAL")}</option>
            <option value="URGENTE">{t("solicitacoes.prioridade.URGENTE")}</option>
          </select>
        </Field>
      </div>

      <datalist id="produtos-list">
        {produtos.map((p) => (
          <option key={p.id} value={`${p.code} — ${p.name}`} />
        ))}
      </datalist>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("solicitacoes.nova.insumos")}</p>
        {linhas.map((l, i) => {
          const p = byId.get(l.produtoId);
          return (
            <div key={l.key} className="flex items-start gap-2">
              <div className="flex-1">
                <Input
                  list="produtos-list"
                  value={l.texto}
                  placeholder={t("solicitacoes.nova.buscaPh")}
                  aria-label={t("solicitacoes.nova.produtoN", { n: i + 1 })}
                  onChange={(e) => {
                    const found = byLabel.get(e.target.value);
                    update(l.key, { texto: e.target.value, produtoId: found?.id ?? "" });
                  }}
                  className={l.texto && !l.produtoId ? "border-destructive" : ""}
                />
                {l.texto && !l.produtoId && <p className="mt-1 text-xs text-destructive">{t("solicitacoes.nova.escolhaLista")}</p>}
              </div>
              <Input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={l.quantity}
                placeholder={t("solicitacoes.nova.qtd")}
                aria-label={t("solicitacoes.nova.quantidadeN", { n: i + 1 })}
                onChange={(e) => update(l.key, { quantity: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && i === linhas.length - 1) {
                    e.preventDefault();
                    addLinha();
                  }
                }}
                className="w-28"
              />
              <span className="w-10 pt-2 text-xs text-muted-foreground">{p?.unit}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("solicitacoes.nova.remover")}
                disabled={linhas.length === 1}
                onClick={() => setLinhas((ls) => ls.filter((x) => x.key !== l.key))}
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}
        <Button type="button" variant="outline" size="sm" onClick={addLinha}>
          <Plus /> {t("solicitacoes.nova.adicionar")}
        </Button>
      </div>

      <Field label={t("solicitacoes.nova.observacao")} htmlFor="notes">
        <Textarea id="notes" name="notes" maxLength={500} rows={2} />
      </Field>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{tm(state.error)}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" disabled={pending || invalid}>
        {pending ? t("solicitacoes.nova.enviando") : t("solicitacoes.nova.enviar")}
      </Button>
    </form>
  );
}
