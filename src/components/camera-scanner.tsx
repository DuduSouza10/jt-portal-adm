"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Lê código de barras ou QR pela câmera do celular (traseira) e devolve o texto.
 * Leitores/coletores físicos não precisam disto: eles "digitam" direto no campo.
 */
export function CameraScanButton({
  onResult,
  title = "Escanear código",
  label,
}: {
  onResult: (text: string) => void;
  title?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={label ? "h-11" : "h-11 w-11 shrink-0 p-0"}
        onClick={() => setOpen(true)}
        aria-label={title}
        title={title}
      >
        <Camera className="size-5" /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Aponte a câmera para o código. A leitura é automática.</DialogDescription>
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
  const [error, setError] = useState("");
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

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
        setError("Não foi possível abrir a câmera. Permita o acesso à câmera no navegador ou digite o código.");
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
