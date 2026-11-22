import "server-only";
import type { Base, Prisma, Regional } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { comSufixo, mesmoNome, siglaCortada, type Deteccao } from "./feishu-rules";

/**
 * Regionais e bases a partir do organograma do Feishu (E11). Usado pelo login (a base da pessoa) e pela
 * importação da estrutura (todas de uma vez). Cada função diz o que fez: "existe" (já ligada ao Feishu),
 * "ligada" (achou uma cadastrada à mão e ligou) ou "criada".
 */

type Tx = Prisma.TransactionClient;
export type Acao = "existe" | "ligada" | "criada";
export type Resultado<T> = { registro: T; acao: Acao };
/** Quem está fazendo (vai na auditoria) e se a base criada fica marcada para o admin revisar. */
export type Quem = { actorId: string | null; origem: string; autoCreated: boolean };

/** Primeira sigla livre: a própria, senão com sufixo ("MG" → "MG-2", "MG-3"…). */
export async function siglaLivre(code: string, ocupada: (c: string) => Promise<unknown>) {
  for (let n = 1; n < 100; n++) {
    const c = n === 1 ? code : comSufixo(code, n);
    if (!(await ocupada(c))) return c;
  }
  throw new Error(`Sem sigla livre para ${code}`);
}

/**
 * Acha a regional pelo departamento do Feishu; senão, uma regional ainda não ligada ao Feishu com o MESMO
 * nome (cadastrada à mão) é ligada; senão cria. A sigla sozinha não basta: Minas Gerais e Mato Grosso
 * dão as duas "MG", e cada uma tem que ficar na sua regional (a segunda vira "MG-2").
 */
export async function regionalDe(tx: Tx, r: Deteccao["regional"], quem: Quem): Promise<Resultado<Regional>> {
  const ligada = await tx.regional.findUnique({ where: { feishuDepartmentId: r.feishuId } });
  if (ligada) return { registro: ligada, acao: "existe" };
  const soltas = await tx.regional.findMany({ where: { feishuDepartmentId: null } });
  const mesma = soltas.find((x) => mesmoNome(x.name, r.name));
  if (mesma) return { registro: await tx.regional.update({ where: { id: mesma.id }, data: { feishuDepartmentId: r.feishuId } }), acao: "ligada" };
  const code = await siglaLivre(r.code, (c) => tx.regional.findUnique({ where: { code: c }, select: { id: true } }));
  const created = await tx.regional.create({ data: { code, name: r.name, feishuDepartmentId: r.feishuId } });
  await audit({ actorId: quem.actorId, action: "regional.criar", entity: "Regional", entityId: created.id, summary: `Regional ${created.code} criada ${quem.origem}` }, tx);
  return { registro: created, acao: "criada" };
}

/**
 * Acha a base pelo departamento do Feishu; senão liga uma base ainda sem Feishu com o mesmo nome ou com a
 * mesma sigla (só quando a sigla não foi cortada em 20 caracteres); senão cria (E11). Base já ligada a
 * OUTRO departamento nunca é reaproveitada: a nova ganha sigla com sufixo.
 */
export async function baseDe(tx: Tx, d: Deteccao, quem: Quem): Promise<Resultado<Base> & { regional: Resultado<Regional> | null }> {
  const ligada = await tx.base.findUnique({ where: { feishuDepartmentId: d.base.feishuId } });
  if (ligada) return { registro: ligada, acao: "existe", regional: null };
  const soltas = await tx.base.findMany({
    where: { feishuDepartmentId: null, OR: [{ code: d.base.code }, { name: { equals: d.base.name, mode: "insensitive" } }] },
  });
  const mesma =
    soltas.find((b) => mesmoNome(b.name, d.base.name)) ?? (siglaCortada(d.base.name) ? undefined : soltas.find((b) => b.code === d.base.code));
  if (mesma) return { registro: await tx.base.update({ where: { id: mesma.id }, data: { feishuDepartmentId: d.base.feishuId } }), acao: "ligada", regional: null };
  const reg = await regionalDe(tx, d.regional, quem);
  const regional = reg.registro;
  const code = await siglaLivre(d.base.code, (c) => tx.base.findUnique({ where: { code: c }, select: { id: true } }));
  const created = await tx.base.create({
    data: {
      code,
      name: d.base.name,
      type: d.base.type,
      regionalId: regional.id,
      feishuDepartmentId: d.base.feishuId,
      autoCreated: quem.autoCreated,
    },
  });
  await audit(
    { actorId: quem.actorId, action: "base.criar", entity: "Base", entityId: created.id, summary: `Base ${created.code} (${regional.code}) criada ${quem.origem}` },
    tx,
  );
  return { registro: created, acao: "criada", regional: reg };
}

