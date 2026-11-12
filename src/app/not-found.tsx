import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Não encontrado</h1>
      <p className="text-muted-foreground">A página ou pedido não existe, ou você não tem acesso a ele.</p>
      <Button asChild size="lg">
        <Link href="/">Ir para o início</Link>
      </Button>
    </div>
  );
}
