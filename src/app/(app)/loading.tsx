import { getT } from "@/i18n/server";

export default async function Loading() {
  const t = await getT();
  return (
    <div className="space-y-4" aria-busy="true" aria-label={t("comum.carregando")}>
      <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
      <div className="h-36 animate-pulse rounded-2xl bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
