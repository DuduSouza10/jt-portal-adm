import "server-only";
import { db } from "@/lib/db";
import { montarExportacao, montarModelo, type RegionalPlanilha } from "./planilha";

async function regionais(): Promise<(RegionalPlanilha & { id: string })[]> {
  const lista = await db.regional.findMany({ orderBy: [{ active: "desc" }, { code: "asc" }], include: { _count: { select: { bases: true } } } });
  return lista.map((r) => ({ id: r.id, code: r.code, name: r.name, active: r.active, bases: r._count.bases }));
}

/** Modelo para importar (/admin/estrutura/importar), já com as regionais que existem. */
export async function modeloBases() {
  return montarModelo(await regionais());
}

/** Exportação de todas as bases (inclusive inativas), na ordem da tela: regional, depois sigla. */
export async function exportarBases() {
  const [rs, bases] = await Promise.all([
    regionais(),
    db.base.findMany({ orderBy: [{ regional: { code: "asc" } }, { code: "asc" }], include: { regional: { select: { code: true, name: true } } } }),
  ]);
  return montarExportacao(
    rs,
    bases.map((b) => ({
      code: b.code,
      name: b.name,
      type: b.type,
      regionalCode: b.regional.code,
      regionalName: b.regional.name,
      cnpj: b.cnpj,
      city: b.city,
      state: b.state,
      address: b.address,
      active: b.active,
    })),
  );
}
