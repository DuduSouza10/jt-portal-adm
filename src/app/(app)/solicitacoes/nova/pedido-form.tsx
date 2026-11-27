"use client";

import { useKeepForm } from "@/components/use-keep-form";
import { useMemo, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox, SelectBox } from "@/components/ui/combobox";
import type { ComboOption } from "@/components/ui/combobox-rules";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/form-field";
import { useServerMessage, useT } from "@/i18n/client";
import type { FormState } from "@/lib/action-result";
import { criarAction } from "../actions";

type Produto = { id: string; code: string; name: string; unit: string };
type Base = { id: string; code: string; name: string; regionalId: string; pedePessoas: boolean; cicloAte: string | null; emAndamento: string | null; jaFez?: "INSUMOS" | "LACRES" | null; foraDoDia?: boolean };
type Linha = { key: number; produtoId: string; livre: string; quantity: string };

/**
 * disponivel: por regional, quanto de cada produto há nos almoxarifados dela (S11). A lista só mostra o que
 * o almoxarifado da regional da base tem, e a quantidade não passa do disponível (o servidor confere de novo).
 */
export function PedidoForm({
  bases,
  produtos: todos,
  disponivel,
  almoxes,
}: {
  bases: Base[];
  produtos: Produto[];
  /** Ids dos produtos que têm saldo, por regional. Só isso: a quantidade em estoque não vai para a base nem para a franquia. */
  disponivel: Record<string, string[]>;
  /** Códigos dos almoxarifados ativos de cada regional (só para explicar quando não há nada). */
  almoxes: Record<string, string[]>;
}) {
  const t = useT();
  const tm = useServerMessage();
  const { state, pending, formProps } = useKeepForm<FormState>(criarAction, {});
  const nextKey = useRef(1);
  const [baseId, setBaseId] = useState(bases.length === 1 ? bases[0].id : "");
  const base = bases.find((b) => b.id === baseId);
  const temSaldo = useMemo(() => new Set(base ? (disponivel[base.regionalId] ?? []) : []), [base, disponivel]);
  const produtos = useMemo(() => todos.filter((p) => temSaldo.has(p.id)), [todos, temSaldo]);
  const [linhas, setLinhas] = useState<Linha[]>([{ key: 0, produtoId: "", livre: "", quantity: "" }]);

  // Sugestões do campo "Insumos": busca por código ou nome, mostrando o saldo da regional da base.
  const opcoes = useMemo<ComboOption[]>(
    () => produtos.map((p) => ({ value: p.id, label: p.name, hint: p.code, description: p.unit })),
    [produtos],
  );
  const byId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);

  // Trocou de base: o saldo muda, então tira da lista o que não existe mais na nova regional.
  const trocarBase = (id: string) => {
    const novo = bases.find((b) => b.id === id);
    const dispNovo = new Set(novo ? (disponivel[novo.regionalId] ?? []) : []);
    setBaseId(id);
    setLinhas((ls) => ls.map((l) => (dispNovo.has(l.produtoId) ? l : { ...l, produtoId: "" })));
  };
  const update = (key: number, patch: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLinha = () => setLinhas((ls) => [...ls, { key: nextKey.current++, produtoId: "", livre: "", quantity: "" }]);
  // Linha com produto do cadastro vira item; linha só com texto digitado vira "fora do cadastro" (segue como texto).
  const itens = linhas.filter((l) => l.produtoId).map((l) => ({ produtoId: l.produtoId, quantity: Number(l.quantity) }));
  const outros = linhas.filter((l) => !l.produtoId && l.livre).map((l) => ({ nome: l.livre, quantity: Number(l.quantity) }));
  const soQtd = linhas.some((l) => !l.produtoId && !l.livre && l.quantity); // quantidade sem insumo
  const invalid =
    itens.length + outros.length === 0 || [...itens, ...outros].some((i) => !(i.quantity > 0)) || soQtd || !!base?.cicloAte || !!base?.emAndamento || !!base?.jaFez || !!base?.foraDoDia;

  return (
    <form {...formProps} className="space-y-4">
      <input type="hidden" name="itens" value={JSON.stringify(itens)} />
      <input type="hidden" name="outros" value={JSON.stringify(outros)} />

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
            <SelectBox id="baseId" name="baseId" required value={baseId} onValueChange={trocarBase}>
              <option value="" disabled>
                {t("solicitacoes.nova.escolhaBase")}
              </option>
              {bases.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.name}
                </option>
              ))}
            </SelectBox>
          )}
        </Field>
        {base?.pedePessoas && (
          <Field label={t("solicitacoes.nova.pessoas")} htmlFor="peopleCount" hint={t("solicitacoes.nova.pessoasAjuda")}>
            <Input id="peopleCount" name="peopleCount" type="number" min={1} max={99999} step={1} inputMode="numeric" required className="max-w-40" />
          </Field>
        )}
        <Field label={t("solicitacoes.nova.prioridade")} htmlFor="priority">
          <SelectBox id="priority" name="priority" defaultValue="NORMAL">
            <option value="NORMAL">{t("solicitacoes.prioridade.NORMAL")}</option>
            <option value="URGENTE">{t("solicitacoes.prioridade.URGENTE")}</option>
          </SelectBox>
        </Field>
      </div>

      {base?.foraDoDia && (
        <Alert>
          <AlertDescription className="text-foreground">{t("solicitacoes.nova.foraDoDia")}</AlertDescription>
        </Alert>
      )}

      {base?.cicloAte && (
        <Alert>
          <AlertDescription className="text-foreground">{t(base.jaFez ? "solicitacoes.nova.noCicloFranquia" : "solicitacoes.nova.noCiclo", { data: base.cicloAte })}</AlertDescription>
        </Alert>
      )}

      {base?.jaFez && !base.cicloAte && (
        <Alert>
          <AlertDescription className="text-foreground">{t(base.jaFez === "LACRES" ? "solicitacoes.nova.jaFezLacres" : "solicitacoes.nova.jaFezInsumos")}</AlertDescription>
        </Alert>
      )}

      {base?.emAndamento && !base.jaFez && (
        <Alert>
          <AlertDescription className="text-foreground">{t("solicitacoes.nova.emAndamento", { n: base.emAndamento })}</AlertDescription>
        </Alert>
      )}

      {base && produtos.length === 0 && (
        <Alert>
          <AlertDescription className="text-foreground">
            {almoxes[base.regionalId]?.length
              ? t("solicitacoes.nova.semEstoqueRegional", { almox: almoxes[base.regionalId].join(", ") })
              : t("solicitacoes.nova.semAlmoxRegional")}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("solicitacoes.nova.insumos")}</p>
        {linhas.map((l, i) => {
          const p = byId.get(l.produtoId);
          return (
            <div key={l.key} className="flex items-start gap-2">
              <div className="flex-1">
                <Combobox
                  options={opcoes}
                  value={l.produtoId}
                  onValueChange={(v) => update(l.key, { produtoId: v, ...(v && { livre: "" }) })}
                  freeText={l.livre}
                  onFreeTextChange={(txt) => update(l.key, { livre: txt })}
                  placeholder={t("solicitacoes.nova.buscaPh")}
                  aria-label={t("solicitacoes.nova.produtoN", { n: i + 1 })}
                  emptyText={base ? t("solicitacoes.nova.semInsumos") : t("solicitacoes.nova.escolhaBaseInsumos")}
                />
                {!l.produtoId && l.livre && <p className="mt-1 text-xs text-muted-foreground">{t("solicitacoes.nova.foraCadastro")}</p>}
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
              <span className="w-24 pt-1 text-xs text-muted-foreground">
                {p?.unit}
              </span>
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
