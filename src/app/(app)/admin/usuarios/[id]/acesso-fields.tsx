"use client";

import { SelectBox } from "@/components/ui/combobox";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Field } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";

type Scope = "GLOBAL" | "REGIONAL" | "BASE" | "FRANQUIAS" | "FRANQUIA";
/** Bases que cada alcance de "só vinculadas" aceita: BASE = bases e franquias (não almoxarifado); FRANQUIA = só franquias. */
const aceita = (scope: Scope | undefined, type: string) => (scope === "FRANQUIA" ? type === "FRANQUIA" : scope !== "BASE" || type !== "ALMOXARIFADO");
type BaseOpt = { id: string; code: string; name: string; type: "BASE" | "FRANQUIA" | "ALMOXARIFADO" };
type RegionalOpt = { id: string; code: string; name: string; bases: BaseOpt[] };

/**
 * Tipo de acesso + onde a pessoa atua. A caixa muda conforme o alcance do tipo escolhido:
 * - Base/Franquia (BASE): só as bases da pessoa (almoxarifado não entra: ele não faz pedido), com busca;
 * - Regional (gestor, expedição, almoxarifado): as regionais; marcar uma inclui todas as bases dela;
 *   bases avulsas continuam possíveis para quem atua só em algumas;
 * - Global (administrador, dev): vê tudo, nada para marcar.
 */
export function AcessoFields({
  profiles,
  regionals,
  profileId,
  baseIds,
  regionalIds,
}: {
  profiles: { id: string; label: string; scope: Scope }[];
  regionals: RegionalOpt[];
  profileId: string;
  baseIds: string[];
  regionalIds: string[];
}) {
  const t = useT();
  const [perfil, setPerfil] = useState(profileId);
  const [bases, setBases] = useState(() => new Set(baseIds));
  const [regs, setRegs] = useState(() => new Set(regionalIds));
  const [busca, setBusca] = useState("");
  const scope = profiles.find((p) => p.id === perfil)?.scope;

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const n = new Set(set);
    if (on) n.add(id);
    else n.delete(id);
    return n;
  };
  const q = busca.trim().toLowerCase();
  const filtradas = useMemo(
    () =>
      regionals
        .map((r) => ({
          ...r,
          bases: r.bases.filter((b) => aceita(scope, b.type) && (!q || `${b.code} ${b.name}`.toLowerCase().includes(q))),
        }))
        .filter((r) => r.bases.length || (scope === "REGIONAL" && (!q || `${r.code} ${r.name}`.toLowerCase().includes(q)))),
    [regionals, scope, q],
  );
  const visiveis = { bases: new Set(filtradas.flatMap((r) => r.bases.map((b) => b.id))), regs: new Set(filtradas.map((r) => r.id)) };
  // Bases que valem para o tipo escolhido (Base/Franquia não ficam ligadas a almoxarifado).
  const podeBase = new Set(regionals.flatMap((r) => r.bases.filter((b) => aceita(scope, b.type)).map((b) => b.id)));
  const marcadas = scope === "BASE" || scope === "FRANQUIA" ? [...bases].length : [...regs].length + [...bases].length;

  const caixaBase = (b: BaseOpt, incluida: boolean) => (
    <label key={b.id} className="flex min-w-0 items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={incluida ? undefined : "baseIds"}
        value={b.id}
        checked={incluida || bases.has(b.id)}
        disabled={incluida}
        onChange={(e) => setBases((s) => toggle(s, b.id, e.target.checked))}
        className="size-4 shrink-0"
      />
      <span className="font-mono text-xs font-semibold">{b.code}</span>
      <span className="truncate text-muted-foreground">{b.name}</span>
    </label>
  );

  return (
    <>
      <Field label={t("usuarios.tipo")} htmlFor="profileId">
        <SelectBox id="profileId" name="profileId" value={perfil} onValueChange={setPerfil} required>
          <option value="" disabled>
            {t("comum.escolha")}
          </option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </SelectBox>
      </Field>

      {scope === "GLOBAL" || scope === "FRANQUIAS" ? (
        <p className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">{t(scope === "GLOBAL" ? "usuarios.acessoGlobal" : "usuarios.acessoFranquias")}</p>
      ) : scope ? (
        <Field label={t(scope === "BASE" || scope === "FRANQUIA" ? "usuarios.acessoBases" : "usuarios.acessoRegionais")} hint={t(scope === "BASE" || scope === "FRANQUIA" ? "usuarios.acessoBasesDica" : "usuarios.acessoRegionaisDica")}>
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t("usuarios.buscarBase")} className="h-8 pl-8" aria-label={t("usuarios.buscarBase")} />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{t("usuarios.marcadas", { n: marcadas })}</span>
            </div>
            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {filtradas.length === 0 && <p className="text-sm text-muted-foreground">{t("usuarios.nenhumaRegional")}</p>}
              {filtradas.map((r) => {
                const regionalMarcada = scope === "REGIONAL" && regs.has(r.id);
                return (
                  <div key={r.id} className="space-y-1">
                    {scope === "REGIONAL" ? (
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          name="regionalIds"
                          value={r.id}
                          checked={regionalMarcada}
                          onChange={(e) => setRegs((s) => toggle(s, r.id, e.target.checked))}
                          className="size-4"
                        />
                        {r.code} · {r.name}
                        {regionalMarcada && <span className="text-xs font-normal text-success">{t("usuarios.todasIncluidas", { n: r.bases.length })}</span>}
                      </label>
                    ) : (
                      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {r.code} · {r.name}
                      </p>
                    )}
                    <div className="grid grid-cols-1 gap-1 pl-6 sm:grid-cols-2 lg:grid-cols-3">{r.bases.map((b) => caixaBase(b, regionalMarcada))}</div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Marcadas que a busca escondeu continuam indo no envio (senão sairiam ao salvar). */}
          {[...bases].filter((id) => !visiveis.bases.has(id) && podeBase.has(id)).map((id) => (
            <input key={id} type="hidden" name="baseIds" value={id} />
          ))}
          {scope === "REGIONAL" && [...regs].filter((id) => !visiveis.regs.has(id)).map((id) => <input key={id} type="hidden" name="regionalIds" value={id} />)}
        </Field>
      ) : null}
    </>
  );
}
