"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/form-field";
import { lancarAction, type LancamentoState } from "../actions";

type Produto = { id: string; code: string; name: string; unit: string };
type Almox = { id: string; code: string; name: string };
type Linha = { key: number; produtoId: string; texto: string; quantity: string };

const TITLES = {
  entrada: { submit: "Registrar entrada" },
  saida: { submit: "Registrar saída" },
  transferencia: { submit: "Registrar transferência" },
} as const;

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
  const [state, action, pending] = useActionState<LancamentoState, FormData>(lancarAction, {});
  const nextKey = useRef(1);
  const [linhas, setLinhas] = useState<Linha[]>([{ key: 0, produtoId: "", texto: "", quantity: "" }]);

  // Busca por "CÓDIGO — nome": o datalist do navegador filtra conforme digita.
  const byLabel = useMemo(() => new Map(produtos.map((p) => [`${p.code} — ${p.name}`, p])), [produtos]);
  const byId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  const update = (key: number, patch: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLinha = () => setLinhas((ls) => [...ls, { key: nextKey.current++, produtoId: "", texto: "", quantity: "" }]);
  const itens = linhas.filter((l) => l.produtoId || l.quantity).map((l) => ({ produtoId: l.produtoId, quantity: Number(l.quantity) }));

  if (state.ok) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertDescription className="font-medium text-foreground">{state.message}</AlertDescription>
        </Alert>
        <div className="flex gap-2">
          {/* Recarrega a página para começar um formulário limpo. */}
          <Button onClick={() => window.location.reload()}>
            Novo lançamento
          </Button>
          {state.batchId && (
            <Button asChild variant="outline">
              <Link href={`/estoque/movimentacoes?lote=${state.batchId}`}>Ver o lançamento</Link>
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
          <Field label="De (origem)" htmlFor="origemId">
            <AlmoxSelect id="origemId" name="origemId" list={almoxarifados} />
          </Field>
          <Field label="Para (destino)" htmlFor="destinoId">
            <AlmoxSelect id="destinoId" name="destinoId" list={destinos} />
          </Field>
        </div>
      ) : (
        <Field label="Almoxarifado" htmlFor="baseId">
          <AlmoxSelect id="baseId" name="baseId" list={almoxarifados} />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tipo === "entrada" ? "Nota fiscal / documento" : "Documento (opcional)"} htmlFor="document">
          <Input id="document" name="document" required={tipo === "entrada"} maxLength={60} />
        </Field>
        <Field label={tipo === "saida" ? "Motivo da saída" : "Observação (opcional)"} htmlFor="reason">
          <Input
            id="reason"
            name="reason"
            required={tipo === "saida"}
            maxLength={300}
            placeholder={tipo === "saida" ? "Ex.: avaria, consumo interno, descarte" : ""}
          />
        </Field>
      </div>

      <datalist id="produtos-list">
        {produtos.map((p) => (
          <option key={p.id} value={`${p.code} — ${p.name}`} />
        ))}
      </datalist>

      <div className="space-y-2">
        <p className="text-sm font-medium">Produtos</p>
        {linhas.map((l, i) => {
          const p = byId.get(l.produtoId);
          return (
            <div key={l.key} className="flex items-start gap-2">
              <div className="flex-1">
                <Input
                  list="produtos-list"
                  value={l.texto}
                  placeholder="Digite o código ou o nome"
                  aria-label={`Produto ${i + 1}`}
                  onChange={(e) => {
                    const found = byLabel.get(e.target.value);
                    update(l.key, { texto: e.target.value, produtoId: found?.id ?? "" });
                  }}
                  className={l.texto && !l.produtoId ? "border-destructive" : ""}
                />
                {l.texto && !l.produtoId && <p className="mt-1 text-xs text-destructive">Escolha um produto da lista.</p>}
              </div>
              <Input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={l.quantity}
                placeholder="Qtd."
                aria-label={`Quantidade ${i + 1}`}
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
                aria-label="Remover linha"
                disabled={linhas.length === 1}
                onClick={() => setLinhas((ls) => ls.filter((x) => x.key !== l.key))}
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}
        <Button type="button" variant="outline" size="sm" onClick={addLinha}>
          <Plus /> Adicionar produto
        </Button>
        <p className="text-xs text-muted-foreground">Dica: Enter na última quantidade adiciona uma nova linha.</p>
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" disabled={pending || itens.length === 0 || itens.some((i) => !i.produtoId)}>
        {pending ? "Registrando..." : TITLES[tipo].submit}
      </Button>
    </form>
  );
}

function AlmoxSelect({ id, name, list }: { id: string; name: string; list: Almox[] }) {
  return (
    <select id={id} name={name} required defaultValue={list.length === 1 ? list[0].id : ""} className={selectClass}>
      <option value="" disabled>
        Escolha…
      </option>
      {list.map((a) => (
        <option key={a.id} value={a.id}>
          {a.code} · {a.name}
        </option>
      ))}
    </select>
  );
}
