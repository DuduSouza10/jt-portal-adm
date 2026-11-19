import Image from "next/image";
import Link from "next/link";
import { getT } from "@/i18n/server";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <Image src="/jt-coelho.png" alt="" width={72} height={72} className="size-18 rounded-2xl opacity-90 shadow-md" />
      <p className="text-5xl font-bold tracking-tight text-primary tabular-nums">404</p>
      <h1 className="text-2xl font-semibold">{t("naoEncontrado.titulo")}</h1>
      <p className="text-muted-foreground">{t("naoEncontrado.texto")}</p>
      <Button asChild size="lg">
        <Link href="/">{t("naoEncontrado.voltar")}</Link>
      </Button>
    </div>
  );
}
