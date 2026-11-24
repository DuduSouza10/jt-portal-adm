"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckSquare, Power, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerMessage, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { ativarBasesAction, excluirBasesAction } from "./actions";

type Base = { id: string; code: string; name: string; type: "BASE" | "FRANQUIA" | "ALMOXARIFADO"; city: string | null; state: string | null; active: boolean };
type Regional = { id: string; code: string; name: string; active: boolean; bases: Base[] };

/**
 * Lista de regionais e bases. Com "Selecionar", marca uma, várias ou todas (por regional ou geral) e
 * exclui de uma vez (só as sem histórico; as outras ficam para desativar) ou desativa/reativa.
 */
export function ListaBases({ regionals, editable }: { regionals: Regional[]; editable: boolean }) {
  const t = useT();
  const tm = useServerMessage();
  const [modo, setModo] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirma, setConfirma] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pending, start] = useTransition();
  const todas = regionals.flatMap((r) => r.bases.map((b) => b.id));
  const nomes = new Map(regionals.flatMap((r) => r.bases.map((b) => [b.id, b.code] as const)));

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const marcarVarias = (ids: string[]) => setSel((s) => { const n = new Set(s); const todasJa = ids.every((i) => n.has(i)); for (const i of ids) { if (todasJa) n.delete(i); else n.add(i); } return n; });
  const sair = () => (setModo(false), setSel(new Set()), setConfirma(false));

  const excluir = () =>
    start(async () => {
      const r = await excluirBasesAction([...sel]);
      setConfirma(false);
      if (r.error || !r.resultado) return setAviso({ tipo: "erro", texto: tm(r.error ?? "Erro") });
      const { excluidas, comHistorico } = r.resultado;
      setSel(new Set(comHistorico.map((b) => b.id)));
      setAviso({
        tipo: comHistorico.length ? "erro" : "ok",
        texto:
          t("estrutura.massa.excluidas", { n: excluidas }) +
          (comHistorico.length ? ` ${t("estrutura.massa.comHistorico", { n: comHistorico.length, lista: comHistorico.map((b) => b.code).join(", ") })}` : ""),
      });
      if (!comHistorico.length) setModo(false);
    });
  const ativar = (active: boolean) =>
    start(async () => {
      const r = await ativarBasesAction([...sel], active);
      if (r.error) return setAviso({ tipo: "erro", texto: tm(r.error) });
      setAviso({ tipo: "ok", texto: t(active ? "estrutura.massa.reativadas" : "estrutura.massa.desativadas", { n: sel.size }) });
      sair();
    });

  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          {modo ? (
            <>
              <Button variant="outline" size="sm" onClick={() => marcarVarias(todas)}>
                <CheckSquare /> {sel.size === todas.length ? t("estrutura.massa.desmarcarTodas") : t("estrutura.massa.todas")}
              </Button>
              <Button variant="ghost" size="sm" onClick={sair}>
                <X /> {t("estrutura.massa.cancelar")}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => (setModo(true), setAviso(null))}>
              <CheckSquare /> {t("estrutura.massa.selecionar")}
            </Button>
          )}
        </div>
      )}
      {aviso && <p className={cn("text-sm", aviso.tipo === "ok" ? "text-success" : "text-warning")}>{aviso.texto}</p>}

      {regionals.map((r) => {
        const ids = r.bases.map((b) => b.id);
        const todasDaRegional = ids.length > 0 && ids.every((i) => sel.has(i));
        return (
          <Card key={r.id} className={r.active ? "" : "opacity-60"}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/estrutura/regionais/${r.id}`} className="hover:underline">
                  {r.code} · {r.name}
                </Link>
                {!r.active && <Badge variant="outline">{t("comum.inativa")}</Badge>}
                <span className="text-sm font-normal text-muted-foreground">{t("estrutura.nBases", { n: r.bases.length })}</span>
                {modo && ids.length > 0 && (
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => marcarVarias(ids)}>
                    {todasDaRegional ? t("estrutura.massa.desmarcarRegional") : t("estrutura.massa.todasRegional")}
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {r.bases.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("estrutura.semBases")}</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {r.bases.map((b) => {
                    const conteudo = (
                      <>
                        <span className="font-medium">{b.code}</span> · {b.name}
                        <span className="block text-xs text-muted-foreground">
                          {t(`tiposBase.${b.type}`)}
                          {b.city && ` · ${b.city}${b.state ? `/${b.state}` : ""}`}
                          {!b.active && ` · ${t("comum.inativa")}`}
                        </span>
                      </>
                    );
                    const classe = cn("rounded-lg border bg-card p-2.5 text-left text-sm transition hover:border-primary/60 hover:shadow-sm", !b.active && "opacity-50");
                    return modo ? (
                      <label key={b.id} className={cn(classe, "flex cursor-pointer items-start gap-2", sel.has(b.id) && "border-primary bg-primary/5")}>
                        <input type="checkbox" className="mt-0.5 size-4" checked={sel.has(b.id)} onChange={() => toggle(b.id)} />
                        <span>{conteudo}</span>
                      </label>
                    ) : (
                      <Link key={b.id} href={`/admin/estrutura/bases/${b.id}`} className={classe}>
                        {conteudo}
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Barra fixa com as ações da seleção. */}
      {modo && sel.size > 0 && (
        <div className="sticky bottom-4 z-30 flex flex-wrap items-center gap-2 rounded-xl border bg-popover p-3 shadow-xl">
          <span className="mr-auto text-sm font-medium">{t("estrutura.massa.selecionadas", { n: sel.size })}</span>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => ativar(true)}>
            <Power /> {t("estrutura.massa.reativar")}
          </Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => ativar(false)}>
            <Power /> {t("estrutura.massa.desativar")}
          </Button>
          <Button variant="destructive" size="sm" disabled={pending} onClick={() => setConfirma(true)}>
            <Trash2 /> {t("estrutura.massa.excluir")}
          </Button>
        </div>
      )}

      <Dialog open={confirma} onOpenChange={setConfirma}>
        <DialogContent overlayClassName="bg-black/40 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle>{t("estrutura.massa.confirmaTitulo", { n: sel.size })}</DialogTitle>
            <DialogDescription>{t("estrutura.massa.confirmaTexto")}</DialogDescription>
          </DialogHeader>
          <p className="max-h-32 overflow-y-auto text-sm text-muted-foreground">{[...sel].map((id) => nomes.get(id)).join(", ")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirma(false)}>
              {t("estrutura.massa.cancelar")}
            </Button>
            <Button variant="destructive" disabled={pending} onClick={excluir}>
              <Trash2 /> {pending ? t("comum.salvando") : t("estrutura.massa.excluirSim")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
