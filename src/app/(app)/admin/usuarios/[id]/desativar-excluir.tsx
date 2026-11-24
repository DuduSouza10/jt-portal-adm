"use client";

import { useState } from "react";
import { Power, Trash2 } from "lucide-react";
import { useKeepForm } from "@/components/use-keep-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerMessage, useT } from "@/i18n/client";
import { deleteUserAction, setUserActiveAction } from "../actions";

/** Desativar/reativar (mantém o histórico) e excluir de vez (só sem histórico, com confirmação). */
export function DesativarExcluir({
  user,
  podeExcluir,
}: {
  user: { id: string; name: string; login: string; active: boolean };
  podeExcluir: boolean;
}) {
  const t = useT();
  const tm = useServerMessage();
  const [aberto, setAberto] = useState(false);
  const ativo = useKeepForm(setUserActiveAction.bind(null, user.id, !user.active), {});
  const excluir = useKeepForm(deleteUserAction.bind(null, user.id), {});
  const erro = ativo.state.error;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <form {...ativo.formProps}>
          <Button type="submit" variant="outline" disabled={ativo.pending}>
            <Power /> {user.active ? t("usuarios.desativar") : t("usuarios.reativar")}
          </Button>
        </form>
        {podeExcluir && (
          <Button type="button" variant="destructive" onClick={() => setAberto(true)}>
            <Trash2 /> {t("usuarios.excluir")}
          </Button>
        )}
      </div>
      {erro && <p className="text-sm text-destructive">{tm(erro)}</p>}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("usuarios.excluirConfirmaTitulo", { nome: user.name })}</DialogTitle>
            <DialogDescription>{t("usuarios.excluirConfirmaTexto", { login: user.login })}</DialogDescription>
          </DialogHeader>
          {excluir.state.error && <p className="text-sm text-destructive">{tm(excluir.state.error)}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">{t("usuarios.excluirCancelar")}</Button>
            </DialogClose>
            <form {...excluir.formProps}>
              <Button type="submit" variant="destructive" disabled={excluir.pending}>
                <Trash2 /> {t("usuarios.excluirConfirmar")}
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
