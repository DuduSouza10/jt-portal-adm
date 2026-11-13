"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission, requireUser } from "@/lib/auth/session";
import { firstIssue, runAction, type FormState } from "@/lib/action-result";
import {
  aprovarSchema,
  comentarioSchema,
  criarSchema,
  motivoSchema,
  separarSchema,
  textoSchema,
} from "@/modules/solicitacoes/schemas";
import * as svc from "@/modules/solicitacoes/service";

const form = (f: FormData) => Object.fromEntries(f);

function refresh(id?: string) {
  revalidatePath("/solicitacoes");
  revalidatePath("/separacao");
  revalidatePath("/expedicao");
  if (id) revalidatePath(`/solicitacoes/${id}`);
}

export async function criarAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requirePermission("solicitacoes.criar");
  const p = criarSchema.safeParse(form(f));
  if (!p.success) return { error: firstIssue(p.error) };
  let id = "";
  const r = await runAction("solicitacao.criar", async () => {
    id = (await svc.criar(user, p.data)).id;
  });
  if (r.error) return r;
  refresh();
  redirect(`/solicitacoes/${id}?nova=1`);
}

export async function aprovarAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requirePermission("solicitacoes.aprovar");
  const p = aprovarSchema.safeParse(form(f));
  if (!p.success) return { error: firstIssue(p.error) };
  const r = await runAction("solicitacao.aprovar", () => svc.aprovar(user, p.data));
  if (!r.error) refresh(p.data.id);
  return r.error ? r : { ok: true, message: "Aprovada. O estoque foi reservado." };
}

export async function recusarAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requirePermission("solicitacoes.aprovar");
  const p = motivoSchema.safeParse(form(f));
  if (!p.success) return { error: firstIssue(p.error) };
  const r = await runAction("solicitacao.recusar", () => svc.recusar(user, p.data.id, p.data.reason));
  if (!r.error) refresh(p.data.id);
  return r;
}

export async function cancelarAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = motivoSchema.safeParse(form(f));
  if (!p.success) return { error: firstIssue(p.error) };
  const r = await runAction("solicitacao.cancelar", () => svc.cancelar(user, p.data.id, p.data.reason));
  if (!r.error) refresh(p.data.id);
  return r;
}

export async function receberAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requirePermission("solicitacoes.criar");
  const p = textoSchema.safeParse(form(f));
  if (!p.success) return { error: firstIssue(p.error) };
  const r = await runAction("solicitacao.receber", () => svc.receber(user, p.data.id, p.data.text));
  if (!r.error) refresh(p.data.id);
  return r;
}

export async function comentarAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = comentarioSchema.safeParse(form(f));
  if (!p.success) return { error: firstIssue(p.error) };
  const r = await runAction("solicitacao.comentar", () => svc.comentar(user, p.data.id, p.data.text));
  if (!r.error) revalidatePath(`/solicitacoes/${p.data.id}`);
  return r;
}

export async function iniciarSeparacaoAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requirePermission("expedicao.separar");
  const id = String(f.get("id") ?? "");
  const r = await runAction("solicitacao.iniciarSeparacao", () => svc.iniciarSeparacao(user, id));
  if (!r.error) refresh(id);
  return r;
}

export async function separarAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requirePermission("expedicao.separar");
  const p = separarSchema.safeParse(form(f));
  if (!p.success) return { error: firstIssue(p.error) };
  const r = await runAction("solicitacao.separar", () => svc.separar(user, p.data));
  if (!r.error) refresh(p.data.id);
  return r.error ? r : { ok: true, message: "Separada. Já aparece na fila da expedição." };
}
