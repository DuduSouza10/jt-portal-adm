"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Lê código de barras ou QR pela câmera do celular (traseira) e devolve o texto.
 * Leitores/coletores físicos não precisam disto: eles "digitam" direto no campo.
 */
export function CameraScanButton({
  onResult,
  title,
  label,
}: {
  onResult: (text: string) => void;
  title?: string;
  label?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const heading = title ?? t("camera.titulo");
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={label ? "h-11" : "h-11 w-11 shrink-0 p-0"}
        onClick={() => setOpen(true)}
        aria-label={heading}
        title={heading}
      >
        <Camera className="size-5" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{heading}</DialogTitle>
            <DialogDescription>{t("camera.instrucao")}</DialogDescription>
          </DialogHeader>
          {open && (
            <Scanner
              onResult={(text) => {
                setOpen(false);
                onResult(text);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Scanner({ onResult }: { onResult: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const done = useRef(false);
  const t = useT();
  const [error, setError] = useState("");
  const onResultRef = useRef(onResult);
  const erroRef = useRef(t("camera.erro"));
  useEffect(() => {
    onResultRef.current = onResult;
    erroRef.current = t("camera.erro");
  }, [onResult, t]);

  useEffect(() => {
    let controls: { stop: () => void } | undefined;
    let cancelled = false;
    (async () => {
      try {
        // Carrega o leitor só quando a câmera é aberta (não pesa nas outras telas).
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current!,
          (result) => {
            if (!result || done.current) return;
            done.current = true;
            navigator.vibrate?.(80);
            controls?.stop();
            onResultRef.current(result.getText());
          },
        );
        if (cancelled || done.current) controls.stop();
      } catch {
        setError(erroRef.current);
      }
    })();
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
        {/* Faixa de mira */}
        <div className="pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-md border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}
