"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, ScanLine, Truck, X } from "lucide-react";
import type { Prioridade } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CameraScanButton } from "@/components/camera-scanner";
import { PriorityBadge } from "../solicitacoes/badges";
import { cn } from "@/lib/utils";
import { lookupScanAction } from "./actions";

export type ReadyOrder = {
  id: string;
  number: string;
  priority: Prioridade;
  partial: boolean;
  separatedAt: string | null;
  baseCode: string;
  baseName: string;
  baseCity: string | null;
  items: number;
};
export type ShippedOrder = {
  id: string;
  number: string;
  shippedAt: string;
  tripId: string | null;
  volumes: number | null;
  baseCode: string;
};

const time = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Reduz a foto no próprio aparelho (lado maior até 1600 px, JPEG) antes de enviar: ~150–300 KB. */
async function compressPhoto(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.72));
    return blob ?? file;
  } catch {
    return file; // navegador sem suporte: manda o original (até 3 MB)
  }
}

export function ShippingBoard({
  ready,
  shipped,
  preselect,
}: {
  ready: ReadyOrder[];
  shipped: ShippedOrder[];
  preselect?: string;
}) {
  const router = useRouter();
  const scanRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [scan, setScan] = useState("");
  const [scanError, setScanError] = useState("");
  const [selected, setSelected] = useState<string[]>(() => (preselect && ready.some((o) => o.id === preselect) ? [preselect] : []));
  const [tripId, setTripId] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [volumes, setVolumes] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  const byId = useMemo(() => new Map(ready.map((o) => [o.id, o])), [ready]);
  const groups = useMemo(() => {
    const m = new Map<string, ReadyOrder[]>();
    for (const o of ready) m.set(o.baseCode, [...(m.get(o.baseCode) ?? []), o]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [ready]);
  const chosen = selected.map((id) => byId.get(id)).filter((o): o is ReadyOrder => !!o);

  const add = (ids: string[]) => setSelected((s) => [...new Set([...s, ...ids])]);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const focusScan = () => {
    setTimeout(() => scanRef.current?.focus(), 0);
  };

  function onScan(e: React.FormEvent) {
    e.preventDefault();
    lookup(scan);
  }

  function lookup(raw: string) {
    setScan("");
    if (!raw.trim()) return;
    start(async () => {
      const r = await lookupScanAction(raw);
      if (!r.ok) {
        setScanError(r.error);
        toast.error(r.error);
        focusScan();
        return;
      }
      setScanError("");
      if (!byId.has(r.id)) router.refresh(); // separado agora há pouco: recarrega a lista
      add([r.id]);
      const o = byId.get(r.id);
      toast.success(o ? `${o.number} → ${o.baseCode} adicionado` : "Pedido adicionado");
      focusScan();
    });
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const blob = await compressPhoto(file);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhoto(blob);
    setPhotoUrl(URL.createObjectURL(blob));
    setFormError("");
  }

  function clearForm() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setSelected([]);
    setTripId("");
    setPhoto(null);
    setPhotoUrl("");
    setVolumes("");
    setNotes("");
    if (photoRef.current) photoRef.current.value = "";
  }

  function confirm() {
    if (!chosen.length) return;
    if (!tripId.trim()) return setFormError("Informe o ID da viagem.");
    if (!photo) return setFormError("Tire a foto do envio.");
    setFormError("");
    const fd = new FormData();
    chosen.forEach((o) => fd.append("id", o.id));
    fd.set("tripId", tripId.trim());
    fd.set("shippingNotes", notes);
    if (chosen.length === 1 && volumes) fd.set("volumes", volumes);
    fd.set("photo", photo, "envio.jpg");
    start(async () => {
      const res = await fetch("/api/expedicao/enviar", { method: "POST", body: fd }).catch(() => null);
      const data = res ? await res.json().catch(() => null) : null;
      if (!res?.ok || !data) {
        setFormError(data?.error ?? "Não foi possível enviar. Verifique a internet e tente de novo.");
        return;
      }
      const { shipped: ok, failed } = data as { shipped: string[]; failed: { id: string; error: string }[] };
      if (ok.length) toast.success(ok.length === 1 ? `${ok[0]} enviado.` : `${ok.length} pedidos enviados.`);
      failed.forEach((f) => toast.error(`${byId.get(f.id)?.number ?? "Pedido"}: ${f.error}`));
      clearForm();
      router.refresh();
      focusScan();
    });
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/30">
        <CardContent className="space-y-3">
          <form onSubmit={onScan} className="flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-primary" />
              <Input
                ref={scanRef}
                autoFocus={!preselect}
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                placeholder="Bipe o QR da guia ou digite o nº (SOL-000123)"
                aria-label="Código da guia"
                autoComplete="off"
                className="h-12 pl-10 text-base"
              />
            </div>
            <CameraScanButton title="Escanear QR da guia" onResult={lookup} />
            <Button type="submit" size="lg" className="h-12" disabled={pending}>
              Buscar
            </Button>
          </form>
          {scanError && <p className="text-sm font-medium text-destructive">{scanError}</p>}

          {chosen.length > 0 && (
            <div className="space-y-3 rounded-lg border bg-accent/40 p-3">
              <p className="text-sm font-medium">
                {chosen.length === 1 ? "1 pedido para enviar" : `${chosen.length} pedidos na mesma viagem`}
              </p>
              <div className="flex flex-wrap gap-2">
                {chosen.map((o) => (
                  <Badge key={o.id} variant="secondary" className="h-7 gap-1 text-sm">
                    {o.number} → {o.baseCode}
                    <button type="button" onClick={() => toggle(o.id)} aria-label={`Tirar ${o.number}`} className="ml-1 rounded hover:bg-black/10">
                      <X className="size-3.5" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
                <div className="space-y-1">
                  <Label htmlFor="trip">ID da viagem *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="trip"
                      value={tripId}
                      onChange={(e) => setTripId(e.target.value)}
                      maxLength={60}
                      autoComplete="off"
                      placeholder="Escaneie o código de barras ou digite"
                      autoFocus={!!preselect}
                      className="h-11 font-mono text-base"
                    />
                    <CameraScanButton
                      title="Escanear ID da viagem"
                      onResult={(text) => {
                        setTripId(text.trim().slice(0, 60));
                        setFormError("");
                      }}
                    />
                  </div>
                </div>
                {chosen.length === 1 && (
                  <div className="space-y-1">
                    <Label htmlFor="volumes">Volumes</Label>
                    <Input id="volumes" type="number" min={1} inputMode="numeric" value={volumes} onChange={(e) => setVolumes(e.target.value)} className="h-11" />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="photo">Foto do envio *</Label>
                <input ref={photoRef} id="photo" type="file" accept="image/*" capture="environment" onChange={onPhoto} className="sr-only" />
                {photoUrl ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl} alt="Foto do envio" className="size-24 rounded-md border object-cover" />
                    <Button type="button" variant="outline" onClick={() => photoRef.current?.click()}>
                      <Camera /> Tirar outra
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-16 w-full border-dashed text-base"
                    onClick={() => photoRef.current?.click()}
                  >
                    <Camera className="size-5" /> Tirar foto
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="snotes">Observação (opcional)</Label>
                <Input id="snotes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
              </div>
              {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
              <Button size="lg" className="h-12 w-full text-base" disabled={pending} onClick={confirm}>
                <Truck /> {pending ? "Enviando..." : `Confirmar envio (${chosen.length})`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prontos para carregar ({ready.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!ready.length && <p className="text-sm text-muted-foreground">Nenhum pedido separado aguardando envio.</p>}
          {groups.map(([code, orders]) => (
            <div key={code} className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">
                  {code} — {orders[0].baseName}
                  {orders[0].baseCity && <span className="font-normal text-muted-foreground"> · {orders[0].baseCity}</span>}
                </h3>
                {orders.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => add(orders.map((o) => o.id))}
                  >
                    Selecionar todos ({orders.length})
                  </Button>
                )}
              </div>
              <div className="divide-y rounded-lg border bg-card">
                {orders.map((o) => {
                  const on = selected.includes(o.id);
                  return (
                    <label
                      key={o.id}
                      className={cn("flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 p-3 hover:bg-muted/50", on && "bg-accent/60")}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggle(o.id)} className="size-4 accent-primary" />
                      <span className="font-mono text-sm font-semibold">{o.number}</span>
                      <PriorityBadge priority={o.priority} />
                      {o.partial && <Badge variant="outline">Parcial</Badge>}
                      <span className="text-sm text-muted-foreground">{o.items} insumo(s)</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {o.separatedAt && `Separado ${dateTime(o.separatedAt)} · `}
                        <Link href={`/solicitacoes/${o.id}`} className="underline" onClick={(e) => e.stopPropagation()}>
                          ver itens
                        </Link>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enviados hoje ({shipped.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {!shipped.length && <p className="text-sm text-muted-foreground">Nada enviado hoje ainda.</p>}
          <div className="divide-y">
            {shipped.map((o) => (
              <Link key={o.id} href={`/solicitacoes/${o.id}`} className="flex flex-wrap gap-x-3 py-2 text-sm hover:bg-muted/50">
                <span className="font-mono font-semibold">{o.number}</span>
                <span className="font-medium">{o.baseCode}</span>
                <span className="text-muted-foreground">
                  {[o.tripId && `Viagem ${o.tripId}`, o.volumes && `${o.volumes} vol.`].filter(Boolean).join(" · ")}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">{time(o.shippedAt)}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
