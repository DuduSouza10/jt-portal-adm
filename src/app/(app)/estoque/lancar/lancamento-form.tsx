"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/form-field";
import { useServerMessage, useT } from "@/i18n/client";
import { parseMoneyBR } from "@/lib/importacao/csv";
import { lancarAction, type LancamentoState } from "../actions";

type Produto = { id: string; code: string; name: string; unit: string };
type Almox = { id: string; code: string; name: string };
type Linha = { key: number; produtoId: string; texto: string; quantity: string; unitCost: string };

export function LancamentoForm({
  tipo,
  almoxarifados,
  destinos,
  produtos,
}: {
  tipo: "entrada" | "saida" | "transferencia";
  almoxarifados: Almox[];
  destinos: Almox[];
  produtos: Produto[];
}) {
  const t = useT();
  const tm = useServerMessage();
  const [state, action, pending] = useActionState<LancamentoState, FormData>(lancarAction, {});
  const nextKey = useRef(1);
  const [linhas, setLinhas] = useState<Linha[]>([{ key: 0, produtoId: "", texto: "", quantity: "", unitCost: "" }]);

  // Busca por "CÓDIGO — nome": o datalist do navegador filtra conforme digita.
  const byLabel = useMemo(() => new Map(produtos.map((p) => [`${p.code} — ${p.name}`, p])), [produtos]);
  const byId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  const update = (key: number, patch: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLinha = () => setLinhas((ls) => [...ls, { key: nextKey.current++, produtoId: "", texto: "", quantity: "", unitCost: "" }]);
  // Valor unitário só na entrada (vírgula ou ponto como decimal). Vazio = sem valor.
  const custo = (v: string) => (tipo === "entrada" && v.trim() ? (parseMoneyBR(v) ?? -1) : undefined);
  const itens = linhas
    .filter((l) => l.produtoId || l.quantity)
    .map((l) => ({ produtoId: l.produtoId, quantity: Number(l.quantity), ...(custo(l.unitCost) !== undefined && { unitCost: custo(l.unitCost) }) }));

  if (state.ok) {
    return (
      <div className="space-y-4">
        <Alert className="border-success/40 bg-success/5">
          <CircleCheck className="text-success" />
          <AlertDescription className="font-medium text-foreground">{tm(state.message ?? "")}</AlertDescription>
        </Alert>
        <div className="flex gap-2">
          {/* Recarrega a página para começar um formulário limpo. */}
          <Button onClick={() => window.location.reload()}>{t("lancar.novo")}</Button>
          {state.batchId && (
            <Button asChild variant="outline">
              <Link href={`/estoque/movimentacoes?lote=${state.batchId}`}>{t("lancar.verLancamento")}</Link>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="itens" value={JSON.stringify(itens)} />

      {tipo === "transferencia" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("lancar.origem")} htmlFor="origemId">
            <AlmoxSelect id="origemId" name="origemId" list={almoxarifados} placeholder={t("comum.escolha")} />
          </Field>
          <Field label={t("lancar.destino")} htmlFor="destinoId">
            <AlmoxSelect id="destinoId" name="destinoId" list={destinos} placeholder={t("comum.escolha")} />
          </Field>
        </div>
      ) : (
        <Field label={t("lancar.almox")} htmlFor="baseId">
          <AlmoxSelect id="baseId" name="baseId" list={almoxarifados} placeholder={t("comum.escolha")} />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tipo === "entrada" ? t("lancar.notaFiscal") : t("lancar.documento")} htmlFor="document">
          <Input id="document" name="document" required={tipo === "entrada"} maxLength={60} />
        </Field>
        <Field label={tipo === "saida" ? t("lancar.motivoSaida") : t("lancar.observacao")} htmlFor="reason">
          <Input
            id="reason"
            name="reason"
            required={tipo === "saida"}
            maxLength={300}
            placeholder={tipo === "saida" ? t("lancar.motivoExemplo") : ""}
          />
        </Field>
      </div>

      <datalist id="produtos-list">
        {produtos.map((p) => (
          <option key={p.id} value={`${p.code} — ${p.name}`} />
        ))}
      </datalist>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("lancar.produtos")}</p>
        {linhas.map((l, i) => {
          const p = byId.get(l.produtoId);
          return (
            <div key={l.key} className="flex items-start gap-2">
              <div className="flex-1">
                <Input
                  list="produtos-list"
                  value={l.texto}
                  placeholder={t("lancar.produtoBusca")}
                  aria-label={t("lancar.produtoAria", { n: i + 1 })}
                  onChange={(e) => {
                    const found = byLabel.get(e.target.value);
                    update(l.key, { texto: e.target.value, produtoId: found?.id ?? "" });
                  }}
                  className={l.texto && !l.produtoId ? "border-destructive" : ""}
                />
                {l.texto && !l.produtoId && <p className="mt-1 text-xs text-destructive">{t("lancar.escolhaLista")}</p>}
              </div>
              <Input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={l.quantity}
                placeholder={t("lancar.qtd")}
                aria-label={t("lancar.qtdAria", { n: i + 1 })}
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
              {tipo === "entrada" && (
                <Input
                  inputMode="decimal"
                  value={l.unitCost}
                  placeholder={t("lancar.valorUnit")}
                  aria-label={t("lancar.valorUnitAria", { n: i + 1 })}
                  onChange={(e) => update(l.key, { unitCost: e.target.value.replace(/[^\d.,]/g, "") })}
                  className="w-32"
                />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("lancar.removerLinha")}
                disabled={linhas.length === 1}
                onClick={() => setLinhas((ls) => ls.filter((x) => x.key !== l.key))}
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}
        <Button type="button" variant="outline" size="sm" onClick={addLinha}>
          <Plus /> {t("lancar.adicionar")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("lancar.dica")}</p>
        {tipo === "entrada" && <p className="text-xs text-muted-foreground">{t("lancar.valorDica")}</p>}
      </div>

      {state.error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{tm(state.error)}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" disabled={pending || itens.length === 0 || itens.some((i) => !i.produtoId)}>
        {pending ? t("comum.registrando") : t(`lancar.${tipo}Enviar`)}
      </Button>
    </form>
  );
}

function AlmoxSelect({ id, name, list, placeholder }: { id: string; name: string; list: Almox[]; placeholder: string }) {
  return (
    <select id={id} name={name} required defaultValue={list.length === 1 ? list[0].id : ""} className={selectClass}>
      <option value="" disabled>
        {placeholder}
      </option>
      {list.map((a) => (
        <option key={a.id} value={a.id}>
          {a.code} · {a.name}
        </option>
      ))}
    </select>
  );
}
