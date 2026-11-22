"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { runAction, type FormState } from "@/lib/action-result";
import { DomainError } from "@/lib/errors";
import { FeishuError, getOrgChart } from "@/lib/feishu/client";
import { desceNoOrganograma, estruturaDoOrganograma } from "@/modules/acessos/feishu-rules";
import { importarEstruturaFeishu } from "@/modules/acessos/estrutura-feishu.service";

/**
 * Lê o organograma de novo (pode ter mudado desde a prévia) e grava SÓ as bases marcadas na prévia
 * (campo "incluir", com o id do departamento no Feishu). Regional sem nenhuma base marcada não é criada.
 */
export async function importarEstruturaFeishuAction(_: FormState, form: FormData): Promise<FormState> {
  const me = await requirePermission("estrutura.editar");
  return runAction("estrutura.importar-feishu", async () => {
    let depts;
    try {
      depts = await getOrgChart(desceNoOrganograma);
    } catch (e) {
      if (e instanceof FeishuError) throw new DomainError(`Não foi possível ler o organograma do Feishu: ${e.message}`);
      throw e;
    }
    const marcadas = new Set(form.getAll("incluir").map(String));
    if (!marcadas.size) throw new DomainError("Marque ao menos uma base para importar.");
    const escolhidas = estruturaDoOrganograma(depts).filter((d) => marcadas.has(d.base.feishuId));
    const r = await importarEstruturaFeishu(me, escolhidas, true);
    revalidatePath("/admin/estrutura");
    revalidatePath("/admin/estrutura/feishu");
    return { ok: true, message: `Estrutura importada: ${r.regionaisCriadas} regional(is) e ${r.basesCriadas} base(s) criadas, ${r.basesLigadas} ligada(s).` };
  });
}
