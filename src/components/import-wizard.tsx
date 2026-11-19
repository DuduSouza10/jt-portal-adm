"use client";

import { useRef, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/form-field";
import { useServerMessage, useT } from "@/i18n/client";
import { chunk, decodeCsvBytes, parseCsv, type ImportResult, type RowError } from "@/lib/importacao/csv";

/**
 * Tela de importação por planilha, comum a estrutura, produtos e estoque:
 *   1. baixa a planilha modelo e escolhe o arquivo: o navegador lê e confere o formato;
 *   2. "Conferir": o servidor diz o que vai acontecer com cada linha, sem gravar (lotes de `validateBatch`);
 *   3. "Importar": grava em lotes de `applyBatch` e mostra o resultado.
 * Cada importação fornece `parse` (puro), as duas server actions e, se precisar, opções (selects/textos).
 */

export type ImportOption =
  | { name: string; label: string; kind: "select"; choices: { value: string; label: string }[]; required?: boolean; hint?: string; defaultValue?: string }
  | { name: string; label: string; kind: "text"; required?: boolean; hint?: string; placeholder?: string; showIf?: { name: string; value: string } };

export type ParseResult<R> = { rows: R[]; errors: RowError[]; missing: string[]; unknown: string[] };
type ActionResult = { ok: true; results: ImportResult[] } | { ok: false; error: string };
type Opts = Record<string, string>;
type Stage = "arquivo" | "conferindo" | "previa" | "importando" | "fim";

function downloadCsv(filename: string, header: string[], rows: (string | number | undefined | null)[][]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

const count = (rs: ImportResult[], a: ImportResult["action"]) => rs.filter((r) => r.action === a).length;

export function ImportWizard<R extends { line: number }>({
  instructions,
  template,
  parse,
  validar,
  aplicar,
  options = [],
  validateBatch = 500,
  applyBatch = 100,
}: {
  instructions: React.ReactNode;
  template: { filename: string; csv: string };
  parse: (table: string[][]) => ParseResult<R>;
  validar: (rows: R[], opts: Opts) => Promise<ActionResult>;
  aplicar: (rows: R[], opts: Opts) => Promise<ActionResult>;
  options?: ImportOption[];
  validateBatch?: number;
  applyBatch?: number;
}) {
  const t = useT();
  const tmOne = useServerMessage();
  // Mensagens das linhas vêm em partes separadas por " · "; "Muda: nome, cidade" traduz cada campo.
  const tm = (msg: string) =>
    msg
      .split(" · ")
      .map((p) => (p.startsWith("Muda: ") ? t("importacao.muda") + p.slice(6).split(", ").map(tmOne).join(", ") : tmOne(p)))
      .join(" · ");
  const [stage, setStage] = useState<Stage>("arquivo");
  const [opts, setOpts] = useState<Opts>(() =>
    Object.fromEntries(options.map((o) => [o.name, o.kind === "select" ? (o.defaultValue ?? (o.required ? (o.choices[0]?.value ?? "") : "")) : ""])),
  );
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParseResult<R> | null>(null);
  const [preview, setPreview] = useState<ImportResult[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [fatal, setFatal] = useState("");
  const cancel = useRef(false);

  const visible = options.filter((o) => o.kind !== "text" || !o.showIf || opts[o.showIf.name] === o.showIf.value);
  const missingOpt = visible.find((o) => o.required && !opts[o.name]?.trim());
  const rows = parsed?.rows ?? [];
  const localErrors = parsed?.errors ?? [];

  const reset = () => {
    setStage("arquivo");
    setParsed(null);
    setPreview([]);
    setResults([]);
    setFatal("");
    setFileName("");
  };

  async function onFile(file: File) {
    reset();
    setFileName(file.name);
    if (!/\.(csv|txt)$/i.test(file.name)) return setFatal(t("importacao.soCsv"));
    setParsed(parse(parseCsv(decodeCsvBytes(await file.arrayBuffer()))));
  }

  async function runBatches(list: R[], size: number, fn: typeof validar) {
    cancel.current = false;
    setProgress({ done: 0, total: list.length });
    const all: ImportResult[] = [];
    for (const b of chunk(list, size)) {
      if (cancel.current) break;
      const r = await fn(b, opts);
      if (!r.ok) return { all, error: tm(r.error) };
      all.push(...r.results);
      setProgress((p) => ({ ...p, done: p.done + b.length }));
    }
    return { all, error: "" };
  }

  async function conferir() {
    setStage("conferindo");
    setFatal("");
    const { all, error } = await runBatches(rows, validateBatch, validar);
    if (error) {
      setFatal(error);
      return setStage("arquivo");
    }
    setPreview(all);
    setStage("previa");
  }

  async function importar() {
    setStage("importando");
    setFatal("");
    const ok = new Set(preview.filter((p) => p.action === "criar" || p.action === "atualizar").map((p) => p.line));
    const { all, error } = await runBatches(rows.filter((r) => ok.has(r.line)), applyBatch, aplicar);
    if (error) setFatal(`${error} ${t("importacao.parouNoMeio")}`);
    setResults(all);
    setStage("fim");
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const errosPrevia = preview.filter((p) => p.action === "erro");
  const mudancas = preview.filter((p) => p.action === "atualizar" || p.action === "criar");
  const aplicaveis = mudancas.length;
  const busy = stage === "conferindo" || stage === "importando";

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="font-semibold">{t("importacao.passo1")}</h2>
        <div className="text-sm text-muted-foreground">{instructions}</div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const url = URL.createObjectURL(new Blob(["﻿" + template.csv], { type: "text/csv;charset=utf-8" }));
            Object.assign(document.createElement("a"), { href: url, download: template.filename }).click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download /> {t("importacao.baixarModelo")}
        </Button>
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((o) => (
            <Field key={o.name} label={o.label} htmlFor={`opt-${o.name}`} hint={o.hint}>
              {o.kind === "select" ? (
                <select
                  id={`opt-${o.name}`}
                  value={opts[o.name] ?? ""}
                  disabled={stage !== "arquivo"}
                  onChange={(e) => setOpts((s) => ({ ...s, [o.name]: e.target.value }))}
                  className={selectClass}
                >
                  {!o.required && <option value="">{t("comum.escolha")}</option>}
                  {o.choices.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={`opt-${o.name}`}
                  value={opts[o.name] ?? ""}
                  placeholder={o.placeholder}
                  maxLength={300}
                  disabled={stage !== "arquivo"}
                  onChange={(e) => setOpts((s) => ({ ...s, [o.name]: e.target.value }))}
                />
              )}
            </Field>
          ))}
          <Field label={t("importacao.arquivo")} htmlFor="import-file">
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm hover:bg-muted">
              <FileUp className="size-4" />
              <span className="truncate">{fileName || t("importacao.escolherArquivo")}</span>
              <input
                id="import-file"
                type="file"
                accept=".csv,text/csv,.txt"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </Field>
        </div>

        {fatal && (
          <Alert variant="destructive">
            <AlertDescription>{fatal}</AlertDescription>
          </Alert>
        )}
        {parsed && parsed.missing.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>{t("importacao.faltamColunas", { colunas: parsed.missing.join(", ") })}</AlertDescription>
          </Alert>
        )}
        {parsed && parsed.missing.length === 0 && !fatal && (
          <p className="text-sm">
            {t("importacao.linhasProntas", { n: rows.length })}
            {localErrors.length > 0 && <span className="text-destructive"> · {t("importacao.comErroFormato", { n: localErrors.length })}</span>}
            {parsed.unknown.length > 0 && <span className="text-muted-foreground"> · {t("importacao.colunasIgnoradas", { colunas: parsed.unknown.join(", ") })}</span>}
          </p>
        )}
        {localErrors.length > 0 && <ErrorList errors={localErrors.map((e) => ({ line: e.line, text: tm(e.message) }))} />}
        {stage === "arquivo" && rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={conferir} disabled={!!missingOpt}>
              {t("importacao.conferir")}
            </Button>
            {missingOpt && <span className="text-sm text-muted-foreground">{t("importacao.preencha", { campo: missingOpt.label })}</span>}
          </div>
        )}
      </section>

      {busy && (
        <section className="space-y-2">
          <p className="text-sm font-medium">
            {stage === "conferindo" ? t("importacao.conferindo") : t("importacao.importando")} {t("importacao.progresso", { done: progress.done, total: progress.total, pct })}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">{t("importacao.naoFeche")}</p>
          <Button variant="outline" size="sm" onClick={() => (cancel.current = true)}>
            {t("importacao.parar")}
          </Button>
        </section>
      )}

      {(stage === "previa" || stage === "importando" || stage === "fim") && preview.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">{t("importacao.passo2")}</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge>{t("importacao.novos", { n: count(preview, "criar") })}</Badge>
            <Badge variant="secondary">{t("importacao.aAtualizar", { n: count(preview, "atualizar") })}</Badge>
            <Badge variant="outline">{t("importacao.semMudanca", { n: count(preview, "igual") })}</Badge>
            <Badge variant="destructive">{t("importacao.comErro", { n: errosPrevia.length + localErrors.length })}</Badge>
          </div>
          {errosPrevia.length > 0 && <ErrorList errors={errosPrevia.map((e) => ({ line: e.line, text: `${e.label}: ${tm(e.message ?? "")}` }))} />}
          {mudancas.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">{t("importacao.verMudancas", { n: mudancas.length })}</summary>
              <ul className="mt-2 max-h-56 overflow-y-auto pl-4">
                {mudancas.slice(0, 500).map((a) => (
                  <li key={a.line}>
                    {t("importacao.linha", { n: a.line })} · {a.label}: {tm(a.message ?? "")}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                "previa-importacao.csv",
                [t("importacao.colLinha"), t("importacao.colItem"), t("importacao.colResultado"), t("importacao.colDetalhe")],
                [
                  ...localErrors.map((e) => [e.line, "", t("importacao.acao.erro"), tm(e.message)]),
                  ...preview.map((p) => [p.line, p.label, t(`importacao.acao.${p.action}`), tm(p.message ?? "")]),
                ].sort((a, b) => Number(a[0]) - Number(b[0])),
              )
            }
          >
            <Download /> {t("importacao.baixarPrevia")}
          </Button>
          {stage === "previa" && (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={importar} disabled={aplicaveis === 0}>
                {t("importacao.importarN", { n: aplicaveis })}
              </Button>
              <Button variant="ghost" onClick={reset}>
                {t("importacao.trocarArquivo")}
              </Button>
              {errosPrevia.length + localErrors.length > 0 && <span className="text-sm text-muted-foreground">{t("importacao.errosFicamDeFora")}</span>}
            </div>
          )}
        </section>
      )}

      {stage === "fim" && (
        <section className="space-y-3">
          <h2 className="font-semibold">{t("importacao.passo3")}</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge>{t("importacao.criados", { n: count(results, "criar") })}</Badge>
            <Badge variant="secondary">{t("importacao.atualizados", { n: count(results, "atualizar") })}</Badge>
            <Badge variant="destructive">{t("importacao.comErro", { n: count(results, "erro") })}</Badge>
          </div>
          {count(results, "erro") > 0 && (
            <ErrorList errors={results.filter((r) => r.action === "erro").map((e) => ({ line: e.line, text: `${e.label}: ${tm(e.message ?? "")}` }))} />
          )}
          <Button variant="outline" onClick={reset}>
            {t("importacao.nova")}
          </Button>
        </section>
      )}
    </div>
  );
}

function ErrorList({ errors }: { errors: { line: number; text: string }[] }) {
  const t = useT();
  return (
    <ul className="max-h-48 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">
      {errors.slice(0, 300).map((e) => (
        <li key={`${e.line}-${e.text}`}>
          <span className="font-medium">{t("importacao.linha", { n: e.line })}:</span> {e.text}
        </li>
      ))}
      {errors.length > 300 && <li className="text-muted-foreground">{t("importacao.eMais", { n: errors.length - 300 })}</li>}
    </ul>
  );
}
