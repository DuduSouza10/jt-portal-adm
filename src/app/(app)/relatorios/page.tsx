import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/session";
import { getT } from "@/i18n/server";
import { RelatoriosView } from "./view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("relatorios.titulo") };
}

export default async function RelatoriosPage(props: PageProps<"/relatorios">) {
  const user = await requirePermission("relatorios.ver");
  return <RelatoriosView user={user} sp={await props.searchParams} />;
}
