"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Trash2 } from "lucide-react";
import { useKeepForm } from "@/components/use-keep-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerMessage, useT } from "@/i18n/client";
import { aprovarAcessoAction, deleteUserAction } from "./actions";

type Pessoa = { id: string; name: string; login: string; email: string | null; bases: string[]; criadoEm: string };

/**
 * "Aprovar" de quem está aguardando liberação: abre um card com o fundo desfocado, com os dados que vieram
 * do Feishu e as opções Abrir cadastro, Aprovar (vira Base na base já vinculada) e Excluir.
 */
export function AprovarButton({ pessoa, podeExcluir }: { pessoa: Pessoa; podeExcluir: boolean }) {
  const t = useT();
  const tm = useServerMessage();
  const [aberto, setAberto] = useState(false);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const aprovar = useKeepForm(aprovarAcessoAction.bind(null, pessoa.id), {});
  const excluir = useKeepForm(deleteUserAction.bind(null, pessoa.id), {});
  const erro = aprovar.state.error ?? excluir.state.error;
  const semBase = pessoa.bases.length === 0;


  return (
    <>
      <Button size="sm" onClick={() => (setConfirmaExcluir(false), setAberto(true))}>
        <Check /> {t("usuarios.aprovar")}
      </Button>
      {/* Aprovou: o card fecha (a lista recarrega sem a pessoa em "aguardando"). */}
      <Dialog open={aberto && !aprovar.state.ok} onOpenChange={setAberto}>
        <DialogContent overlayClassName="bg-black/40 backdrop-blur-md" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("usuarios.cardAprovar.titulo")}</DialogTitle>
            <DialogDescription>{t("usuarios.cardAprovar.texto", { data: pessoa.criadoEm })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
            <div>
              <p className="text-base font-semibold">{pessoa.name}</p>
              <p className="text-muted-foreground">
                {pessoa.login}
                {pessoa.email && ` · ${pessoa.email}`}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t("usuarios.cardAprovar.base")}</p>
              {semBase ? (
                <p className="text-warning">{t("usuarios.cardAprovar.semBase")}</p>
              ) : (
                <p className="font-medium">{pessoa.bases.join(", ")}</p>
              )}
            </div>
          </div>
          {erro && <p className="text-sm text-destructive">{tm(erro)}</p>}
          {confirmaExcluir ? (
            <div className="space-y-3">
              <p className="font-medium">{t("usuarios.cardAprovar.excluirConfirma", { nome: pessoa.name })}</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmaExcluir(false)}>
                  {t("usuarios.cardAprovar.voltar")}
                </Button>
                <form {...excluir.formProps}>
                  <Button type="submit" variant="destructive" disabled={excluir.pending}>
                    <Trash2 /> {t("usuarios.cardAprovar.excluirSim")}
                  </Button>
                </form>
              </DialogFooter>
            </div>
          ) : (
            <DialogFooter className="gap-2 sm:justify-between">
              {podeExcluir ? (
                <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmaExcluir(true)}>
                  <Trash2 /> {t("usuarios.cardAprovar.excluir")}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href={`/admin/usuarios/${pessoa.id}`}>
                    <ExternalLink /> {t("usuarios.cardAprovar.abrir")}
                  </Link>
                </Button>
                <form {...aprovar.formProps}>
                  <Button type="submit" disabled={semBase || aprovar.pending}>
                    <Check /> {aprovar.pending ? t("comum.salvando") : t("usuarios.cardAprovar.aprovarComo")}
                  </Button>
                </form>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
