import { Outlet } from "react-router-dom";
import { AppSidebar, SidebarProvider, MobileMenuTrigger, useSidebarState } from "./AppSidebar";
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
          <span className="font-display font-bold text-foreground">FacturaDigital</span>
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
