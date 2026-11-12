import { Suspense } from "react";
import { AppHeader, AppHeaderSkeleton } from "@/components/app-header";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-30 bg-primary text-primary-foreground shadow-sm print:hidden">
        <Suspense fallback={<AppHeaderSkeleton />}>
          <AppHeader />
        </Suspense>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6">{children}</main>
    </>
  );
}
