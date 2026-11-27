"use client";

import { SelectBox } from "@/components/ui/combobox";
import { useKeepForm } from "@/components/use-keep-form";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form-field";
import { useServerMessage, useT } from "@/i18n/client";
import type { FormState } from "@/lib/action-result";

type Item = { produtoId: string; code: string; name: string; unit: string; max: number };
type Almox = { id: string; code: string; name: string };

function Feedback({ state }: { state: FormState }) {
  const tm = useServerMessage();
  if (state.error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{tm(state.error)}</AlertDescription>
      </Alert>
    );
  if (state.message)
    return (
      <Alert className="border-success/40 bg-success/5">
        <AlertDescription className="font-medium text-foreground">{tm(state.message)}</AlertDescription>
      </Alert>
    );
  return null;
}

/**
 * Formulário de quantidades por item: usado na aprovação (máximo = pedido) e na separação (máximo = aprovado).
 * Na aprovação mostra o disponível do almoxarifado escolhido, para quem aprova ver se tem estoque.
 */
export function QuantidadesForm({
  id,
  action,
  itens,
  submitLabel,
  almoxarifados,
  almoxDefault,
  disponivel,
  colLabel,
}: {
  id: string;
  action: (s: FormState, f: FormData) => Promise<FormState>;
  itens: Item[];
  submitLabel: string;
  colLabel: string;
  almoxarifados?: Almox[];
  almoxDefault?: string;
  disponivel?: Record<string, Record<string, number>>;
}) {
  const t = useT();
  const { state, pending, formProps } = useKeepForm(action, {});
  const [q, setQ] = useState<Record<string, string>>(() => Object.fromEntries(itens.map((i) => [i.produtoId, String(i.max)])));
  const [almox, setAlmox] = useState(almoxDefault ?? "");
  const quantidades = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, Number(v)]));
  const disp = almox && disponivel ? (disponivel[almox] ?? {}) : null;

  if (state.ok) return <Feedback state={state} />;

  return (
    <form {...formProps} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="quantidades" value={JSON.stringify(quantidades)} />
      {almoxarifados && (
        <Field label={t("solicitacoes.forms.almoxAtende")} htmlFor="almoxarifadoId">
          <SelectBox id="almoxarifadoId" name="almoxarifadoId" required value={almox} onValueChange={setAlmox}>
            <option value="" disabled>
              {t("solicitacoes.forms.escolhaAlmox")}
            </option>
            {almoxarifados.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </SelectBox>
        </Field>
      )}
      <div className="divide-y rounded-lg border">
        <div className="flex gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span className="flex-1">{t("solicitacoes.detalhe.col.insumo")}</span>
          {disp && <span className="w-20 text-right">{t("solicitacoes.forms.disponivel")}</span>}
          <span className="w-24 text-right">{colLabel}</span>
        </div>
        {itens.map((i) => {
          const d = disp?.[i.produtoId] ?? 0;
          const falta = disp && Number(q[i.produtoId]) > d;
          return (
            <div key={i.produtoId} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1">
                <span className="font-medium">{i.code}</span> {i.name}{" "}
                <span className="text-xs text-muted-foreground">
                  {t("solicitacoes.forms.max", { max: i.max, unit: i.unit })}
                </span>
              </span>
              {disp && <span className={`w-20 text-right tabular-nums ${falta ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{d}</span>}
              <Input
                type="number"
                min={0}
                max={i.max}
                step={1}
                inputMode="numeric"
                value={q[i.produtoId]}
                onChange={(e) => setQ((s) => ({ ...s, [i.produtoId]: e.target.value }))}
                aria-label={t("solicitacoes.forms.qtdDe", { col: colLabel, code: i.code })}
                className="w-24 text-right"
              />
            </div>
          );
        })}
      </div>
      {almoxarifados && (
        <Field label={t("solicitacoes.detalhe.observacaoOpc")} htmlFor="note">
          <Input id="note" name="note" maxLength={300} />
        </Field>
      )}
      <Feedback state={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("comum.salvando") : submitLabel}
      </Button>
    </form>
  );
}

/** Ação com motivo obrigatório (recusar, cancelar) ou texto opcional (receber, comentar). */
export function TextoForm({
  id,
  action,
  name,
  label,
  submitLabel,
  required,
  variant = "default",
  placeholder,
}: {
  id: string;
  action: (s: FormState, f: FormData) => Promise<FormState>;
  name: "reason" | "text";
  label: string;
  submitLabel: string;
  required?: boolean;
  variant?: "default" | "outline" | "destructive";
  placeholder?: string;
}) {
  const t = useT();
  const { state, pending, formProps } = useKeepForm(action, {});
  return (
    <form {...formProps} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Field label={label} htmlFor={`${name}-${submitLabel}`}>
        <Input id={`${name}-${submitLabel}`} name={name} required={required} minLength={required ? 3 : undefined} maxLength={1000} placeholder={placeholder} />
      </Field>
      <Feedback state={state} />
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? t("comum.salvando") : submitLabel}
      </Button>
    </form>
  );
}

/** Botão de uma ação só (ex.: iniciar separação). */
export function BotaoForm({
  id,
  action,
  label,
  variant = "default",
}: {
  id: string;
  action: (s: FormState, f: FormData) => Promise<FormState>;
  label: string;
  variant?: "default" | "outline";
}) {
  const t = useT();
  const { state, pending, formProps } = useKeepForm(action, {});
  return (
    <form {...formProps} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Feedback state={state} />
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? t("comum.salvando") : label}
      </Button>
    </form>
  );
}

/**
 * S17: tira UM item do pedido (quem aprova, enquanto aguarda aprovação). Começa como link discreto;
 * abre o motivo (obrigatório) e confirma. Quem pediu é avisado pelo servidor.
 */
/** S21: muda a quantidade pedida de um item enquanto aguarda aprovação. Sem justificativa; fica no histórico. */
export function EditarQuantidadeForm({
  id,
  action,
  produtoId,
  outro,
  atual,
}: {
  id: string;
  action: (s: FormState, f: FormData) => Promise<FormState>;
  produtoId?: string;
  outro?: number;
  atual: number;
}) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const { state, pending, formProps } = useKeepForm(action, {});
  // Salvou: fecha o campo; a lista já mostra a quantidade nova (e o histórico, a mudança).
  useEffect(() => {
    if (state.ok) setAberto(false);
  }, [state]);
  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
        {t("solicitacoes.detalhe.editarQtd")}
      </button>
    );
  return (
    <form {...formProps} className="mt-1 w-full space-y-2">
      <input type="hidden" name="id" value={id} />
      {produtoId && <input type="hidden" name="produtoId" value={produtoId} />}
      {outro !== undefined && <input type="hidden" name="outro" value={outro} />}
      <div className="flex flex-wrap items-center gap-2">
        <Input name="quantity" type="number" min={1} max={99999} step={1} inputMode="numeric" required defaultValue={atual} autoFocus aria-label={t("solicitacoes.detalhe.editarQtdNova")} className="h-8 w-28 text-right" />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? t("comum.salvando") : t("solicitacoes.detalhe.editarQtdSalvar")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
          {t("solicitacoes.detalhe.cancelarItemVoltar")}
        </Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function CancelarItemForm({
  id,
  action,
  produtoId,
  outro,
}: {
  id: string;
  action: (s: FormState, f: FormData) => Promise<FormState>;
  produtoId?: string;
  outro?: number;
}) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const { state, pending, formProps } = useKeepForm(action, {});
  if (!aberto)
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-xs font-medium text-destructive underline-offset-4 hover:underline">
        {t("solicitacoes.detalhe.cancelarItem")}
      </button>
    );
  return (
    <form {...formProps} className="mt-1 w-full space-y-2">
      <input type="hidden" name="id" value={id} />
      {produtoId && <input type="hidden" name="produtoId" value={produtoId} />}
      {outro !== undefined && <input type="hidden" name="outro" value={outro} />}
      <div className="flex flex-wrap items-center gap-2">
        <Input name="reason" required minLength={3} maxLength={300} autoFocus aria-label={t("solicitacoes.detalhe.cancelarItemMotivo")} placeholder={t("solicitacoes.detalhe.cancelarItemMotivo")} className="h-8 min-w-48 flex-1" />
        <Button type="submit" size="sm" variant="destructive" disabled={pending}>
          {pending ? t("comum.salvando") : t("solicitacoes.detalhe.cancelarItemConfirmar")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
          {t("solicitacoes.detalhe.cancelarItemVoltar")}
        </Button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
