import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { navFor } from "@/lib/navigation";
import { MobileNav, NavLinks, UserMenu } from "@/components/app-nav";

export async function AppHeader() {
  const user = await requireUser({ allowPendingPasswordChange: true });
  const items = navFor(user).map(({ href, label }) => ({ href, label }));
  const subtitle = [user.profile.name, user.bases.map((b) => b.code).join(", ")].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
      <MobileNav items={items} />
      <Brand />
      <NavLinks items={items} />
      <div className="ml-auto flex items-center gap-1">
        <UserMenu name={user.name} subtitle={subtitle} />
      </div>
    </div>
  );
}

/** Coelho da J&T + nome do sistema. */
function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold">
      <Image src="/jt-coelho.png" alt="" width={32} height={32} className="size-8 rounded-md ring-1 ring-white/40" priority />
      <span className="leading-tight">
        Portal ADM
        <span className="hidden text-[11px] font-normal text-white/80 sm:block">J&amp;T Express</span>
      </span>
    </Link>
  );
}

export function AppHeaderSkeleton() {
  return (
    <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
      <Brand />
    </div>
  );
}
