import type { Metadata } from "next";
import { ListPlus, Building2, Users } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getT } from "@/i18n/server";
import { Abas } from "@/components/abas";
import { AutoAtualizar } from "@/components/auto-atualizar";
import { PageHeader } from "@/components/page-header";
import { SUPERVISOR_KEY } from "@/lib/permissions/default-profiles";
import { basesDeOutrosSupervisores, supervisoresComBases } from "@/modules/acessos/service";
import { EscolhaBases } from "./escolha";
import { MinhasBasesLista } from "./minhas";
import { ListaSupervisores } from "./supervisores";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("minhasBases.titulo") };
}

const ABAS = ["escolher", "minhas", "supervisores"] as const;

/**
 * Minhas bases (E17, E19, E23): o RM/supervisor escolhe as bases e franquias que acompanha, vê e libera as que já tem,
 * e vê quais supervisores detêm quais bases. A tela se atualiza sozinha (outro supervisor pega ou libera uma base).
 */
export default async function MinhasBasesPage(props: PageProps<"/minhas-bases">) {
  const user = await requirePermission("bases.escolher");
  const t = await getT();
  const sp = await props.searchParams;
  const aba = ABAS.find((a) => a === sp.aba) ?? "escolher";
  const ehSupervisor = user.profile.key === SUPERVISOR_KEY;

  const [regionais, supervisores, ocupadasPorOutros] = await Promise.all([
    db.regional.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        bases: { where: { active: true, type: { not: "ALMOXARIFADO" } }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, type: true } },
      },
    }),
    supervisoresComBases(),
    // Supervisor não vê a base que outro supervisor já salvou; o RM vê todas (E19).
    ehSupervisor ? basesDeOutrosSupervisores(user.id) : Promise.resolve(new Set<string>()),
  ]);

  const minhasIds = new Set(user.baseIds);
  const comBases = regionais.filter((r) => r.bases.length);
  const livres = comBases
    .map((r) => ({ ...r, bases: r.bases.filter((b) => !minhasIds.has(b.id) && !ocupadasPorOutros.has(b.id)) }))
    .filter((r) => r.bases.length);
  const minhas = comBases.map((r) => ({ ...r, bases: r.bases.filter((b) => minhasIds.has(b.id)) })).filter((r) => r.bases.length);
  const nLivres = livres.reduce((n, r) => n + r.bases.length, 0);
  const nMinhas = minhas.reduce((n, r) => n + r.bases.length, 0);

  const totalBases = comBases.reduce((n, r) => n + r.bases.length, 0);
  const comSupervisor = new Set(supervisores.flatMap((s) => s.bases.map((b) => b.id))).size;

  return (
    <>
      <AutoAtualizar segundos={10} />
      <PageHeader title={t("minhasBases.titulo")} description={`${t("minhasBases.descricao")}${ehSupervisor ? ` ${t("minhasBases.descricaoSupervisor")}` : ""}`} />
      <Abas
        label={t("minhasBases.titulo")}
        items={[
          { href: "/minhas-bases", label: t("minhasBases.abas.escolher"), icon: ListPlus, count: nLivres, ativa: aba === "escolher" },
          { href: "/minhas-bases?aba=minhas", label: t("minhasBases.abas.minhas"), icon: Building2, count: nMinhas, ativa: aba === "minhas" },
          { href: "/minhas-bases?aba=supervisores", label: t("minhasBases.abas.supervisores"), icon: Users, count: supervisores.length, ativa: aba === "supervisores" },
        ]}
      />
      {aba === "escolher" && <EscolhaBases regionais={livres} minhas={minhas.flatMap((r) => r.bases.map((b) => b.id))} />}
      {aba === "minhas" && <MinhasBasesLista regionais={minhas} exclusivo={ehSupervisor} />}
      {aba === "supervisores" && (
        <ListaSupervisores
          supervisores={supervisores}
          meuId={user.id}
          totais={{ ocupadas: comSupervisor, livres: totalBases - comSupervisor }}
        />
      )}
    </>
  );
}
