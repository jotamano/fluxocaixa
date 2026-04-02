import { Outlet } from "react-router-dom";
import { AppSidebar, SidebarProvider, MobileMenuTrigger, useSidebarState } from "./AppSidebar";
import { GlobalSearch } from "./GlobalSearch";
import { useIsMobile } from "@/hooks/use-mobile";

function LayoutInner() {
  const isMobile = useIsMobile();
  const { collapsed } = useSidebarState();

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      {isMobile && (
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-4">
          <MobileMenuTrigger />
          <GlobalSearch />
        </header>
      )}
      {!isMobile && (
        <header className={`sticky top-0 z-30 flex h-14 items-center border-b border-border bg-background/80 backdrop-blur-sm px-6 transition-all duration-300 ${collapsed ? 'ml-16' : 'ml-64'}`}>
          <GlobalSearch />
        </header>
      )}
      <main className={`min-h-screen p-4 md:p-8 transition-all duration-300 ${isMobile ? '' : collapsed ? 'ml-16' : 'ml-64'}`}>
        <Outlet />
      </main>
    </div>
  );
}

export function AppLayout() {
  return (
    <SidebarProvider>
      <LayoutInner />
    </SidebarProvider>
  );
}
