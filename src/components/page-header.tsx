import Link from "next/link";
import { ArrowLeft, Inbox } from "lucide-react";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-md text-[13px] text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> {label}
    </Link>
  );
}

/** Título da página + descrição opcional + ações à direita. */
export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: string;
  description?: string;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {back && <BackLink {...back} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-[22px] font-semibold tracking-tight sm:text-[26px]">{title}</h1>
          {description && <p className="max-w-[68ch] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[14px] border bg-card px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Inbox className="size-5" aria-hidden />
      </span>
      <p className="max-w-md text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
