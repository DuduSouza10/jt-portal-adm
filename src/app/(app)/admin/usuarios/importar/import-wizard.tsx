"use client";

import { useRef, useState } from "react";
import { Download, FileUp, KeyRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, selectClass } from "@/components/form-field";
import { useServerMessage, useT } from "@/i18n/client";
import {
  chunk,
  decodeCsvBytes,
  normalizeRows,
  parseCsv,
  TEMPLATE_CSV,
  type ImportRow,
  type RowError,
} from "@/modules/acessos/importacao";
import type { RowResult } from "@/modules/acessos/importacao.service";
import { aplicarImportacaoAction, validarImportacaoAction } from "./actions";

// Iguais aos limites do servidor (importacao.service.ts).
const VALIDATE_BATCH = 500;
const APPLY_BATCH = 25;

type Profile = { id: string; key: string; name: string };
type Stage = "arquivo" | "conferindo" | "previa" | "importando" | "fim";

/** Gera e baixa um CSV (com BOM e ";", para abrir certo no Excel). */
function downloadCsv(filename: string, header: string[], rows: (string | number | undefined | null)[][]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

const count = (rs: RowResult[], a: RowResult["action"]) => rs.filter((r) => r.action === a).length;

export function ImportWizard({ profiles }: { profiles: Profile[] }) {
  const t = useT();
  const tmOne = useServerMessage();
  // Mensagens do servidor: "… (tipo \"X\")." junta a regra com o nome do tipo; "name, phone" são os campos que mudam.
  const tm = (msg: string) => {
    const m = /^(.*) \(tipo "(.*)"\)\.$/.exec(msg);
    if (m) return `${tmOne(m[1])} ${t("importacao.usuarios.tipoSufixo", { tipo: m[2] })}`;
    return tmOne(msg);
  };
  const campos = (msg: string) => msg.split(", ").map((k) => t.maybe(`importacao.usuarios.campo.${k}`) ?? k).join(", ");
  const [stage, setStage] = useState<Stage>("arquivo");
  const [defaultProfileId, setDefaultProfileId] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [localErrors, setLocalErrors] = useState<RowError[]>([]);
  const [unknownCols, setUnknownCols] = useState<string[]>([]);
  const [missingCols, setMissingCols] = useState<string[]>([]);
  const [preview, setPreview] = useState<RowResult[]>([]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [fatal, setFatal] = useState("");
  const cancel = useRef(false);

  const reset = () => {
    setStage("arquivo");
    setRows([]);
    setLocalErrors([]);
    setPreview([]);
    setResults([]);
    setFatal("");
    setFileName("");
  };

  async function onFile(file: File) {
    reset();
    setFileName(file.name);
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setFatal(t("importacao.soCsv"));
      return;
    }
    const text = decodeCsvBytes(await file.arrayBuffer());
    const { header, rows, errors } = normalizeRows(parseCsv(text));
    setUnknownCols(header.unknown);
    setMissingCols(header.missing);
    setRows(rows);
    setLocalErrors(errors);
  }

  async function conferir() {
    setStage("conferindo");
    setFatal("");
    cancel.current = false;
    const batches = chunk(rows, VALIDATE_BATCH);
    setProgress({ done: 0, total: rows.length });
    const all: RowResult[] = [];
    for (const b of batches) {
      if (cancel.current) break;
      const r = await validarImportacaoAction(b, defaultProfileId || null);
      if (!r.ok) {
        setFatal(tm(r.error));
        setStage("arquivo");
        return;
      }
      all.push(...r.results);
      setProgress((p) => ({ ...p, done: p.done + b.length }));
    }
    setPreview(all);
    setStage("previa");
  }

  async function importar() {
    setStage("importando");
    setFatal("");
    cancel.current = false;
    const okLines = new Set(preview.filter((p) => p.action === "criar" || p.action === "atualizar").map((p) => p.line));
    const toApply = rows.filter((r) => okLines.has(r.line));
    setProgress({ done: 0, total: toApply.length });
    const all: RowResult[] = [];
    for (const b of chunk(toApply, APPLY_BATCH)) {
      if (cancel.current) break;
      const r = await aplicarImportacaoAction(b, defaultProfileId || null);
      if (!r.ok) {
        setFatal(`${tm(r.error)} ${t("importacao.parouNoMeio")}`);
        break;
      }
      all.push(...r.results);
      setResults([...all]);
      setProgress((p) => ({ ...p, done: p.done + b.length }));
    }
    setResults(all);
    setStage("fim");
  }

  const novos = results.filter((r) => r.tempPassword);
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const errosPrevia = preview.filter((p) => p.action === "erro");
  const atualizacoes = preview.filter((p) => p.action === "atualizar");
  const aplicaveis = count(preview, "criar") + count(preview, "atualizar");

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------ 1. Arquivo */}
      <section className="space-y-3">
        <h2 className="font-semibold">{t("importacao.passo1")}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("importacao.usuarios.ajuda1")}</li>
          <li>{t("importacao.usuarios.ajuda2")}</li>
          <li>{t("importacao.usuarios.ajuda3")}</li>
          <li>{t("importacao.usuarios.ajuda4")}</li>
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const url = URL.createObjectURL(new Blob(["﻿" + TEMPLATE_CSV], { type: "text/csv;charset=utf-8" }));
            Object.assign(document.createElement("a"), { href: url, download: "modelo-importacao-usuarios.csv" }).click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download /> {t("importacao.baixarModelo")}
        </Button>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("importacao.usuarios.perfilPadrao")} htmlFor="defaultProfile" hint={t("importacao.usuarios.perfilPadraoAjuda")}>
            <select
              id="defaultProfile"
              value={defaultProfileId}
              onChange={(e) => setDefaultProfileId(e.target.value)}
              disabled={stage !== "arquivo"}
              className={selectClass}
            >
              <option value="">{t("importacao.usuarios.nenhumPerfil")}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.key})
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("importacao.arquivo")} htmlFor="file">
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm hover:bg-muted">
              <FileUp className="size-4" />
              <span className="truncate">{fileName || t("importacao.escolherArquivo")}</span>
              <input
                id="file"
                type="file"
                accept=".csv,text/csv,.txt"
                className="sr-only"
                disabled={stage === "conferindo" || stage === "importando"}
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
        {missingCols.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              {t("importacao.faltamColunas", { colunas: t("importacao.usuarios.colunasObrigatorias") })}
            </AlertDescription>
          </Alert>
        )}
        {fileName && missingCols.length === 0 && !fatal && (
          <p className="text-sm">
            {t("importacao.linhasProntas", { n: rows.length })}
            {localErrors.length > 0 && (
              <>
                {" "}
                · <span className="text-destructive">{t("importacao.comErroFormato", { n: localErrors.length })}</span>
              </>
            )}
            {unknownCols.length > 0 && <span className="text-muted-foreground"> · {t("importacao.colunasIgnoradas", { colunas: unknownCols.join(", ") })}</span>}
          </p>
        )}
        {localErrors.length > 0 && <ErrorList errors={localErrors.map((e) => ({ line: e.line, text: tm(e.message) }))} />}
        {stage === "arquivo" && rows.length > 0 && (
          <Button onClick={conferir}>{t("importacao.conferir")}</Button>
        )}
      </section>

      {/* ------------------------------------------------ progresso */}
      {(stage === "conferindo" || stage === "importando") && (
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

      {/* ------------------------------------------------ 2. Prévia */}
      {(stage === "previa" || stage === "importando" || stage === "fim") && preview.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">{t("importacao.passo2")}</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge>{t("importacao.novos", { n: count(preview, "criar") })}</Badge>
            <Badge variant="secondary">{t("importacao.aAtualizar", { n: count(preview, "atualizar") })}</Badge>
            <Badge variant="outline">{t("importacao.semMudanca", { n: count(preview, "igual") })}</Badge>
            <Badge variant="destructive">{t("importacao.comErro", { n: errosPrevia.length + localErrors.length })}</Badge>
          </div>
          {errosPrevia.length > 0 && <ErrorList errors={errosPrevia.map((e) => ({ line: e.line, text: `${e.name}: ${tm(e.message ?? "")}` }))} />}
          {atualizacoes.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">{t("importacao.verMudancas", { n: atualizacoes.length })}</summary>
              <ul className="mt-2 max-h-48 overflow-y-auto pl-4">
                {atualizacoes.slice(0, 300).map((a) => (
                  <li key={a.line}>
                    {t("importacao.linha", { n: a.line })} · {a.login} ({a.name}): {campos(a.message ?? "")}
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
                [t("importacao.colLinha"), "login", t("importacao.usuarios.campo.name"), t("importacao.colResultado"), t("importacao.colDetalhe")],
                [
                  ...localErrors.map((e) => [e.line, "", "", t("importacao.acao.erro"), tm(e.message)]),
                  ...preview.map((p) => [p.line, p.login, p.name, t(`importacao.acao.${p.action}`), p.action === "atualizar" ? campos(p.message ?? "") : tm(p.message ?? "")]),
                ].sort((a, b) => Number(a[0]) - Number(b[0])),
              )
            }
          >
            <Download /> {t("importacao.baixarPrevia")}
          </Button>
          {stage === "previa" && (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={importar} disabled={aplicaveis === 0}>
                {t("importacao.usuarios.importarN", { n: aplicaveis })}
              </Button>
              <Button variant="ghost" onClick={reset}>
                {t("importacao.trocarArquivo")}
              </Button>
              {errosPrevia.length + localErrors.length > 0 && (
                <span className="text-sm text-muted-foreground">{t("importacao.errosFicamDeFora")}</span>
              )}
            </div>
          )}
        </section>
      )}

      {/* ------------------------------------------------ 3. Resultado */}
      {stage === "fim" && (
        <section className="space-y-3">
          <h2 className="font-semibold">{t("importacao.passo3")}</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge>{t("importacao.criados", { n: count(results, "criar") })}</Badge>
            <Badge variant="secondary">{t("importacao.atualizados", { n: count(results, "atualizar") })}</Badge>
            <Badge variant="destructive">{t("importacao.comErro", { n: count(results, "erro") })}</Badge>
          </div>
          {count(results, "erro") > 0 && (
            <ErrorList errors={results.filter((r) => r.action === "erro").map((e) => ({ line: e.line, text: `${e.name}: ${tm(e.message ?? "")}` }))} />
          )}
          {novos.length > 0 && (
            <Alert>
              <KeyRound className="size-4" />
              <AlertTitle>{t("importacao.usuarios.senhasTitulo", { n: novos.length })}</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  {t("importacao.usuarios.senhasAviso")}
                </p>
                <Button
                  size="sm"
                  onClick={() =>
                    downloadCsv(
                      "senhas-temporarias.csv",
                      [t("importacao.usuarios.campo.name"), "login", t("importacao.usuarios.senhaTemp")],
                      novos.map((n) => [n.name, n.login, n.tempPassword]),
                    )
                  }
                >
                  <Download /> {t("importacao.usuarios.baixarSenhas")}
                </Button>
              </AlertDescription>
            </Alert>
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
