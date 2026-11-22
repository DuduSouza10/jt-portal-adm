"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { runAction, type FormState } from "@/lib/action-result";
import { DomainError } from "@/lib/errors";
import { FeishuError, getOrgChart } from "@/lib/feishu/client";
import { desceNoOrganograma, estruturaDoOrganograma } from "@/modules/acessos/feishu-rules";
import { importarEstruturaFeishu } from "@/modules/acessos/estrutura-feishu.service";

/** Lê o organograma de novo (pode ter mudado desde a prévia) e grava regionais e bases. */
export async function importarEstruturaFeishuAction(): Promise<FormState> {
  const me = await requirePermission("estrutura.editar");
  return runAction("estrutura.importar-feishu", async () => {
    let depts;
    try {
      depts = await getOrgChart(desceNoOrganograma);
    } catch (e) {
      if (e instanceof FeishuError) throw new DomainError(`Não foi possível ler o organograma do Feishu: ${e.message}`);
      throw e;
    }
    const r = await importarEstruturaFeishu(me, estruturaDoOrganograma(depts), true);
    revalidatePath("/admin/estrutura");
    revalidatePath("/admin/estrutura/feishu");
    return { ok: true, message: `Estrutura importada: ${r.regionaisCriadas} regional(is) e ${r.basesCriadas} base(s) criadas, ${r.basesLigadas} ligada(s).` };
  });
}
