/** Bloco de um formulário de regional/base: título e explicação à esquerda, campos à direita (empilha no celular). */
export function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b pb-6 last:border-b-0 last:pb-0 md:grid-cols-[200px_1fr] md:gap-10">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {descricao && <p className="text-[13px] leading-relaxed text-muted-foreground">{descricao}</p>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}
