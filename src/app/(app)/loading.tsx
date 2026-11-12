export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-32 animate-pulse rounded-xl bg-muted" />
      <div className="h-32 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
