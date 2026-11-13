"use client";

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/form-field";
import type { FormState } from "@/lib/action-result";

type Item = { produtoId: string; code: string; name: string; unit: string; max: number };
type Almox = { id: string; code: string; name: string };

function Feedback({ state }: { state: FormState }) {
  if (state.error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  if (state.message)
    return (
      <Alert>
        <AlertDescription className="font-medium text-foreground">{state.message}</AlertDescription>
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
  const [state, formAction, pending] = useActionState(action, {});
  const [q, setQ] = useState<Record<string, string>>(() => Object.fromEntries(itens.map((i) => [i.produtoId, String(i.max)])));
  const [almox, setAlmox] = useState(almoxDefault ?? "");
  const quantidades = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, Number(v)]));
  const disp = almox && disponivel ? (disponivel[almox] ?? {}) : null;

  if (state.ok) return <Feedback state={state} />;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="quantidades" value={JSON.stringify(quantidades)} />
      {almoxarifados && (
        <Field label="Almoxarifado que vai atender" htmlFor="almoxarifadoId">
          <select id="almoxarifadoId" name="almoxarifadoId" required value={almox} onChange={(e) => setAlmox(e.target.value)} className={selectClass}>
            <option value="" disabled>
              Escolha o almoxarifado
            </option>
            {almoxarifados.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="divide-y rounded-lg border">
        <div className="flex gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span className="flex-1">Insumo</span>
          {disp && <span className="w-20 text-right">Disponível</span>}
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
                  (máx. {i.max} {i.unit})
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
                aria-label={`${colLabel} de ${i.code}`}
                className="w-24 text-right"
              />
            </div>
          );
        })}
      </div>
      {almoxarifados && (
        <Field label="Observação (opcional)" htmlFor="note">
          <Input id="note" name="note" maxLength={300} />
        </Field>
      )}
      <Feedback state={state} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Salvando..." : submitLabel}
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
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Field label={label} htmlFor={`${name}-${submitLabel}`}>
        <Input id={`${name}-${submitLabel}`} name={name} required={required} minLength={required ? 3 : undefined} maxLength={1000} placeholder={placeholder} />
      </Field>
      <Feedback state={state} />
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Salvando..." : submitLabel}
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
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Feedback state={state} />
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Salvando..." : label}
      </Button>
    </form>
  );
}
