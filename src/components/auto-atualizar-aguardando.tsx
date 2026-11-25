import { getCurrentUser } from "@/lib/auth/session";
import { AutoAtualizar } from "@/components/auto-atualizar";

/**
 * Quem entrou pelo Feishu e espera liberação (tipo "Aguardando liberação") fica com a tela se atualizando
 * sozinha: quando o administrador aprova, o menu e as telas liberadas aparecem na hora, sem recarregar a página.
 * Só para essas pessoas (poucas), para não consultar o servidor à toa.
 */
export async function AutoAtualizarAguardando() {
  const user = await getCurrentUser();
  if (user?.profile.key !== "aguardando") return null;
  return <AutoAtualizar segundos={8} />;
}
