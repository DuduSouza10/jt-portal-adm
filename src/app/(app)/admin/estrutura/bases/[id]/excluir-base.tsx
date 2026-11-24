"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useKeepForm } from "@/components/use-keep-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerMessage, useT } from "@/i18n/client";
import { deleteBaseAction } from "../../actions";

/** Excluir a base de vez, com confirmação (E13). */
export function ExcluirBase({ base }: { base: { id: string; code: string; name: string } }) {
  const t = useT();
  const tm = useServerMessage();
  const [aberto, setAberto] = useState(false);
  const excluir = useKeepForm(deleteBaseAction.bind(null, base.id), {});
  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setAberto(true)}>
        <Trash2 /> {t("estrutura.excluir")}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("estrutura.excluirConfirmaTitulo", { code: base.code })}</DialogTitle>
            <DialogDescription>{t("estrutura.excluirConfirmaTexto", { nome: base.name })}</DialogDescription>
          </DialogHeader>
          {excluir.state.error && <p className="text-sm text-destructive">{tm(excluir.state.error)}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">{t("estrutura.excluirCancelar")}</Button>
            </DialogClose>
            <form {...excluir.formProps}>
              <Button type="submit" variant="destructive" disabled={excluir.pending}>
                <Trash2 /> {t("estrutura.excluirConfirmar")}
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
