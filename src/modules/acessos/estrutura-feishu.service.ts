import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/auth/session";
import { baseDe, type Acao } from "./feishu-estrutura";
import type { Deteccao } from "./feishu-rules";

/**
 * Importação das regionais e bases a partir do organograma do Feishu (E11), feita por um admin.
 * Usa as mesmas regras do login: o que já está ligado ao Feishu fica como está; o que foi cadastrado à mão
 * com o mesmo nome é ligado; o resto é criado. Base criada aqui não fica marcada para revisão (o admin
 * já viu a prévia).
 */

export type LinhaEstrutura = {
  regional: { code: string; name: string; acao: Acao | null };
  base: { code: string; name: string; type: "BASE" | "FRANQUIA"; acao: Acao };
};
export type ResultadoEstrutura = {
  linhas: LinhaEstrutura[];
  regionaisCriadas: number;
  basesCriadas: number;
  basesLigadas: number;
  basesExistentes: number;
};

class Previa extends Error {
  constructor(public resultado: ResultadoEstrutura) {
    super("prévia");
  }
}

/** `aplicar: false` = prévia: faz tudo numa transação e desfaz no fim, só para mostrar o que aconteceria. */
export async function importarEstruturaFeishu(actor: CurrentUser, deteccoes: Deteccao[], aplicar: boolean): Promise<ResultadoEstrutura> {
  try {
    return await db.$transaction(
      async (tx) => {
        const linhas: LinhaEstrutura[] = [];
        for (const d of deteccoes) {
          const r = await baseDe(tx, d, { actorId: actor.id, origem: "pela importação do Feishu", autoCreated: false });
          const reg = await tx.regional.findUniqueOrThrow({ where: { id: r.registro.regionalId } });
          linhas.push({
            regional: { code: reg.code, name: reg.name, acao: r.regional?.acao ?? null },
            base: { code: r.registro.code, name: r.registro.name, type: r.registro.type === "FRANQUIA" ? "FRANQUIA" : "BASE", acao: r.acao },
          });
        }
        const resultado: ResultadoEstrutura = {
          linhas,
          regionaisCriadas: linhas.filter((l) => l.regional.acao === "criada").length,
          basesCriadas: linhas.filter((l) => l.base.acao === "criada").length,
          basesLigadas: linhas.filter((l) => l.base.acao === "ligada").length,
          basesExistentes: linhas.filter((l) => l.base.acao === "existe").length,
        };
        if (!aplicar) throw new Previa(resultado);
        await audit(
          {
            actorId: actor.id,
            action: "estrutura.importar-feishu",
            entity: "Base",
            entityId: null,
            summary: `Importou a estrutura do Feishu: ${resultado.regionaisCriadas} regional(is) e ${resultado.basesCriadas} base(s) criadas, ${resultado.basesLigadas} ligada(s)`,
          },
          tx,
        );
        return resultado;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (e instanceof Previa) return e.resultado;
    throw e;
  }
}
