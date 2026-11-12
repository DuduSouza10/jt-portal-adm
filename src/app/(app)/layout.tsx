import { Suspense } from "react";
import { AppHeader, AppHeaderSkeleton } from "@/components/app-header";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="brand-stripes sticky top-0 z-30 bg-header text-header-foreground shadow-[0_1px_0_0_oklch(0_0_0/0.06),0_4px_16px_-8px_oklch(0.4_0.2_27/0.45)] print:hidden dark:border-b dark:border-b-primary/70 dark:shadow-none">
        <Suspense fallback={<AppHeaderSkeleton />}>
          <AppHeader />
        </Suspense>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:py-8">{children}</main>
    </>
  );
}
