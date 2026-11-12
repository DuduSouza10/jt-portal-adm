import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { navFor, SECTION_LABEL, type NavItem } from "@/lib/navigation";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";

export default async function HomePage() {
  const user = await requireUser();
  const items = navFor(user);
  const sections = Object.keys(SECTION_LABEL) as NavItem["section"][];

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Olá, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">{user.profile.name}</p>
      </div>
      {items.length === 0 && (
        <EmptyState>Seu usuário ainda não tem acesso a nenhuma área. Fale com o administrador.</EmptyState>
      )}
      {sections.map((s) => {
        const list = items.filter((i) => i.section === s);
        if (!list.length) return null;
        return (
          <section key={s} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{SECTION_LABEL[s]}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {list.map((i) => (
                <Link key={i.href} href={i.href} className="group">
                  <Card className="h-full transition group-hover:border-primary group-hover:shadow-md">
                    <CardHeader>
                      <CardTitle>{i.label}</CardTitle>
                      <CardDescription>{i.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
