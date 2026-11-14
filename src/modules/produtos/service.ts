import "server-only";
import { db } from "@/lib/db";
import { audit, diff } from "@/lib/audit";
import { DomainError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/auth/session";
import type { ProdutoInput } from "./schemas";

/**
 * Cadastro de produtos (catálogo de insumos). O código identifica o produto e NÃO muda depois de criado
 * (estoque, solicitações e importações apontam para ele). Saldo e custo ficam no módulo de estoque.
 */
export async function saveProduto(actor: CurrentUser, id: string | null, input: ProdutoInput) {
  return db.$transaction(async (tx) => {
    if (id) {
      const before = await tx.produto.findUnique({ where: { id } });
      if (!before) throw new DomainError("Produto não encontrado.");
      const data = { name: input.name, unit: input.unit, active: input.active, limitBase: input.limitBase, limitFranquia: input.limitFranquia, limitBlockDays: input.limitBlockDays };
      await tx.produto.update({ where: { id }, data });
      await audit(
        { actorId: actor.id, action: "produto.editar", entity: "Produto", entityId: id, summary: `Editou o produto ${before.code}`, data: diff(before, data) },
        tx,
      );
      return id;
    }
    const p = await tx.produto.create({ data: input });
    await audit({ actorId: actor.id, action: "produto.criar", entity: "Produto", entityId: p.id, summary: `Criou o produto ${p.code}` }, tx);
    return p.id;
  });
}
