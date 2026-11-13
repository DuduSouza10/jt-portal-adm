"use client";

import { useRef, useState } from "react";
import { Download, FileUp, KeyRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, selectClass } from "@/components/form-field";
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

const ACTION_LABEL: Record<RowResult["action"], string> = { criar: "Novo", atualizar: "Atualizar", igual: "Sem mudança", erro: "Erro" };

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
      setFatal("Envie um arquivo .csv. No Excel: Arquivo → Salvar como → CSV (separado por vírgulas ou ponto e vírgula).");
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
        setFatal(r.error);
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
        setFatal(`${r.error} As linhas anteriores já foram gravadas; rode a importação de novo para continuar (quem já foi criado aparece como "sem mudança").`);
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
        <h2 className="font-semibold">1. Planilha</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Colunas aceitas: <b>nome</b> (obrigatória), <b>matrícula</b>, login, e-mail, telefone, tipo de acesso, bases, regionais e ativo. A ordem não importa e
            colunas a mais são ignoradas.
          </li>
          <li>Login: se não vier na planilha, usa a matrícula; sem matrícula, a parte do e-mail antes do @.</li>
          <li>Quem já existe (mesma matrícula ou login) é <b>atualizado</b>; o login e a senha não mudam. Ativo = &quot;não&quot; desliga o acesso na hora.</li>
          <li>Bases e regionais pela sigla, separadas por vírgula (ex.: BHZ01, CTG01).</li>
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
          <Download /> Baixar planilha modelo
        </Button>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo de acesso padrão" htmlFor="defaultProfile" hint="Usado nas linhas sem a coluna tipo de acesso.">
            <select
              id="defaultProfile"
              value={defaultProfileId}
              onChange={(e) => setDefaultProfileId(e.target.value)}
              disabled={stage !== "arquivo"}
              className={selectClass}
            >
              <option value="">Nenhum (a planilha precisa informar)</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.key})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Arquivo CSV" htmlFor="file">
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm hover:bg-muted">
              <FileUp className="size-4" />
              <span className="truncate">{fileName || "Escolher arquivo…"}</span>
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
              Faltam colunas obrigatórias: <b>nome</b> e pelo menos uma entre <b>matrícula</b>, login ou e-mail.
            </AlertDescription>
          </Alert>
        )}
        {fileName && missingCols.length === 0 && !fatal && (
          <p className="text-sm">
            <b>{rows.length}</b> linha(s) prontas para conferir
            {localErrors.length > 0 && (
              <>
                {" "}
                · <span className="text-destructive">{localErrors.length} com erro de formato</span>
              </>
            )}
            {unknownCols.length > 0 && <span className="text-muted-foreground"> · colunas ignoradas: {unknownCols.join(", ")}</span>}
          </p>
        )}
        {localErrors.length > 0 && <ErrorList errors={localErrors.map((e) => ({ line: e.line, text: e.message }))} />}
        {stage === "arquivo" && rows.length > 0 && (
          <Button onClick={conferir}>Conferir com o cadastro</Button>
        )}
      </section>

      {/* ------------------------------------------------ progresso */}
      {(stage === "conferindo" || stage === "importando") && (
        <section className="space-y-2">
          <p className="text-sm font-medium">
            {stage === "conferindo" ? "Conferindo" : "Importando"}… {progress.done} de {progress.total} ({pct}%)
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">Não feche esta página até terminar.</p>
          <Button variant="outline" size="sm" onClick={() => (cancel.current = true)}>
            Parar depois deste lote
          </Button>
        </section>
      )}

      {/* ------------------------------------------------ 2. Prévia */}
      {(stage === "previa" || stage === "importando" || stage === "fim") && preview.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">2. Prévia (nada foi gravado ainda)</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge>{count(preview, "criar")} novo(s)</Badge>
            <Badge variant="secondary">{count(preview, "atualizar")} a atualizar</Badge>
            <Badge variant="outline">{count(preview, "igual")} sem mudança</Badge>
            <Badge variant="destructive">{errosPrevia.length + localErrors.length} com erro</Badge>
          </div>
          {errosPrevia.length > 0 && <ErrorList errors={errosPrevia.map((e) => ({ line: e.line, text: `${e.name}: ${e.message}` }))} />}
          {atualizacoes.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Ver o que muda nos {atualizacoes.length} existentes</summary>
              <ul className="mt-2 max-h-48 overflow-y-auto pl-4">
                {atualizacoes.slice(0, 300).map((a) => (
                  <li key={a.line}>
                    Linha {a.line} · {a.login} ({a.name}): {a.message}
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
                ["linha", "login", "nome", "resultado", "detalhe"],
                [
                  ...localErrors.map((e) => [e.line, "", "", "Erro", e.message]),
                  ...preview.map((p) => [p.line, p.login, p.name, ACTION_LABEL[p.action], p.message]),
                ].sort((a, b) => Number(a[0]) - Number(b[0])),
              )
            }
          >
            <Download /> Baixar relatório da prévia
          </Button>
          {stage === "previa" && (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={importar} disabled={aplicaveis === 0}>
                Importar {aplicaveis} usuário(s)
              </Button>
              <Button variant="ghost" onClick={reset}>
                Trocar arquivo
              </Button>
              {errosPrevia.length + localErrors.length > 0 && (
                <span className="text-sm text-muted-foreground">As linhas com erro ficam de fora. Corrija e importe de novo depois.</span>
              )}
            </div>
          )}
        </section>
      )}

      {/* ------------------------------------------------ 3. Resultado */}
      {stage === "fim" && (
        <section className="space-y-3">
          <h2 className="font-semibold">3. Resultado</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge>{count(results, "criar")} criado(s)</Badge>
            <Badge variant="secondary">{count(results, "atualizar")} atualizado(s)</Badge>
            <Badge variant="destructive">{count(results, "erro")} com erro</Badge>
          </div>
          {count(results, "erro") > 0 && (
            <ErrorList errors={results.filter((r) => r.action === "erro").map((e) => ({ line: e.line, text: `${e.name}: ${e.message}` }))} />
          )}
          {novos.length > 0 && (
            <Alert>
              <KeyRound className="size-4" />
              <AlertTitle>Senhas temporárias de {novos.length} usuário(s) novo(s)</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  Elas aparecem <b>só agora</b>: baixe a lista antes de sair desta página. Cada pessoa troca a senha no primeiro acesso. Guarde o arquivo em local
                  seguro e apague depois de distribuir.
                </p>
                <Button
                  size="sm"
                  onClick={() =>
                    downloadCsv(
                      "senhas-temporarias.csv",
                      ["nome", "login", "senha_temporaria"],
                      novos.map((n) => [n.name, n.login, n.tempPassword]),
                    )
                  }
                >
                  <Download /> Baixar senhas temporárias
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <Button variant="outline" onClick={reset}>
            Nova importação
          </Button>
        </section>
      )}
    </div>
  );
}

function ErrorList({ errors }: { errors: { line: number; text: string }[] }) {
  return (
    <ul className="max-h-48 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm">
      {errors.slice(0, 300).map((e) => (
        <li key={`${e.line}-${e.text}`}>
          <span className="font-medium">Linha {e.line}:</span> {e.text}
        </li>
      ))}
      {errors.length > 300 && <li className="text-muted-foreground">… e mais {errors.length - 300}. Baixe o relatório para ver todos.</li>}
    </ul>
  );
}
