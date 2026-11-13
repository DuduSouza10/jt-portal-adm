import { getCurrentUser } from "@/lib/auth/session";
import { loadPhoto } from "@/modules/solicitacoes/service";

// Foto do carregamento: só para quem pode ver algum pedido daquela viagem (a base vê as dos próprios pedidos).
export async function GET(_req: Request, ctx: RouteContext<"/api/fotos-envio/[id]">) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });
  const photo = await loadPhoto(user, id);
  if (!photo) return new Response("Foto não encontrada", { status: 404 });
  return new Response(Buffer.from(photo.data), {
    headers: { "Content-Type": photo.mime, "Cache-Control": "private, max-age=86400" },
  });
}
