import { revalidatePath } from "next/cache";
import { flushFeishuSoon } from "@/lib/feishu/flush";
import { getCurrentUser } from "@/lib/auth/session";
import { firstIssue } from "@/lib/action-result";
import { DomainError } from "@/lib/errors";
import { can } from "@/lib/permissions/check";
import { errorInfo, logger } from "@/lib/logger";
import { envioSchema } from "@/modules/solicitacoes/schemas";
import { enviarLote, MAX_PHOTO_BYTES, PHOTO_TYPES } from "@/modules/solicitacoes/service";

// Confirmação de envio pela expedição. É rota (multipart) e não server action por causa da foto.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || !can(user, "expedicao.enviar")) return Response.json({ error: "Sem permissão." }, { status: 403 });

  const form = await req.formData();
  const p = envioSchema.safeParse({
    ids: form.getAll("id").map(String).filter(Boolean),
    tripId: String(form.get("tripId") ?? ""),
    volumes: form.get("volumes") || undefined,
    shippingNotes: String(form.get("shippingNotes") ?? ""),
  });
  if (!p.success) return Response.json({ error: firstIssue(p.error) }, { status: 400 });

  const photo = form.get("photo");
  if (!(photo instanceof File) || !photo.size) return Response.json({ error: "Tire a foto do envio." }, { status: 400 });
  if (!PHOTO_TYPES.includes(photo.type)) return Response.json({ error: "A foto precisa ser JPG, PNG ou WebP." }, { status: 400 });
  if (photo.size > MAX_PHOTO_BYTES) return Response.json({ error: "Foto muito grande (máx. 3 MB)." }, { status: 400 });

  try {
    const result = await enviarLote(user, p.data, { mime: photo.type, data: new Uint8Array(await photo.arrayBuffer()) });
    flushFeishuSoon();
    revalidatePath("/expedicao");
    revalidatePath("/solicitacoes");
    for (const id of p.data.ids) revalidatePath(`/solicitacoes/${id}`);
    return Response.json(result);
  } catch (e) {
    if (e instanceof DomainError) return Response.json({ error: e.message }, { status: 400 });
    logger.error("expedicao.enviar", errorInfo(e));
    return Response.json({ error: "Erro inesperado. Tente novamente." }, { status: 500 });
  }
}
