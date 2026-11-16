"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";

/**
 * Igual ao `useActionState`, mas o formulário NÃO perde o que a pessoa digitou quando a action devolve erro.
 *
 * Por quê: com `<form action={fn}>`, o React 19 limpa todos os campos depois de qualquer envio, inclusive
 * quando volta "E-mail inválido.", e a pessoa precisa digitar tudo de novo. Aqui o envio é feito pelo
 * `onSubmit` (sem a limpeza automática) e os campos só voltam ao valor inicial quando a action deu certo.
 *
 * Uso:
 *   const { state, pending, formProps } = useKeepForm(minhaAction, {});
 *   <form {...formProps} className="...">
 *
 * Decisão do Diogo (2026-11-16), Issue #18. Regra de interface: todo formulário com action usa isto.
 */
export function useKeepForm<S extends object>(action: (state: S, form: FormData) => Promise<S>, initial: S) {
  const [state, dispatch, pending] = useActionState<S, FormData>(action, initial as Awaited<S>);
  const ref = useRef<HTMLFormElement>(null);

  // Deu certo e a página continuou aberta (ex.: "Senha alterada"): volta aos valores iniciais.
  useEffect(() => {
    if ((state as { ok?: boolean }).ok) ref.current?.reset();
  }, [state]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    // O submitter entra no FormData (botões com name/value, como "Aprovar" ou "Recusar").
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | HTMLInputElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(fd));
  }

  return { state, pending, formProps: { ref, onSubmit } };
}
