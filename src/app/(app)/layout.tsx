import { Suspense } from "react";
import { AppSidebar, AppSidebarSkeleton, AppTopbar } from "@/components/app-header";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[252px_minmax(0,1fr)]">
      <div className="hidden border-r bg-sidebar print:hidden lg:block">
        <aside className="sticky top-0 h-dvh overflow-y-auto">
          <Suspense fallback={<AppSidebarSkeleton />}>
            <AppSidebar />
          </Suspense>
        </aside>
      </div>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md print:hidden">
          <Suspense fallback={<div className="h-15" />}>
            <AppTopbar />
          </Suspense>
        </header>
        <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-4 py-6 sm:px-7 sm:py-7">{children}</main>
      </div>
    </div>
  );
}
