import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, FileText, RefreshCw, Plus, Menu, CreditCard, CalendarDays, ChevronLeft, ChevronRight, Package, LogOut, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState, createContext, useContext } from "react";
import ghostLogo from "@/assets/ghostinvoice-logo.svg";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/clientes", icon: Users, label: "Clientes" },
  { to: "/faturas", icon: FileText, label: "Faturas" },
  { to: "/pagamentos", icon: CreditCard, label: "Pagamentos" },
  { to: "/servicos", icon: Package, label: "Serviços" },
  { to: "/subscricoes", icon: RefreshCw, label: "Subscrições" },
  { to: "/calendario", icon: CalendarDays, label: "Calendário" },
  { to: "/lixo", icon: Trash2, label: "Lixo" },
];

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  setCollapsed: () => {},
  mobileOpen: false,
  setMobileOpen: () => {},
});

export const useSidebarState = () => useContext(SidebarContext);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { collapsed } = useSidebarState();
  const isMobile = useIsMobile();
  const showLabels = isMobile || !collapsed;

  return (
    <>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                !showLabels && "justify-center px-2",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
              title={item.label}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {showLabels && item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-2">
        <NavLink to="/faturas/nova" onClick={onNavigate}>
          <Button className={cn(
            "w-full gap-2 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90",
            !showLabels && "px-2"
          )}>
            <Plus className="h-4 w-4 shrink-0" />
            {showLabels && "Nova Fatura"}
          </Button>
        </NavLink>
        <SidebarFooter showLabels={showLabels} />
      </div>
    </>
  );
}

function SidebarFooter({ showLabels }: { showLabels: boolean }) {
  const { user, signOut } = useAuth();
  const buildId = (import.meta.env.VITE_BUILD_ID as string | undefined) ?? "dev";
  const shortBuild = buildId.length > 10 ? buildId.slice(0, 7) : buildId;
  if (!user) return null;
  return (
    <div className="space-y-2">
      {showLabels && (
        <>
          <p className="text-xs text-sidebar-foreground/60 truncate" title={user.email ?? ""}>
            {user.email}
          </p>
          <p
            className="text-[10px] text-sidebar-foreground/40 font-mono truncate"
            title={`Build ${buildId}`}
          >
            build {shortBuild}
          </p>
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void signOut()}
        className={cn(
          "w-full gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground",
          !showLabels && "justify-center px-2",
        )}
        title="Sair"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        {showLabels && "Sair"}
      </Button>
    </div>
  );
}

export function AppSidebar() {
  const isMobile = useIsMobile();
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebarState();

  if (isMobile) {
    return (
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar text-sidebar-foreground border-sidebar-border p-0">
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <div className="flex h-16 items-center gap-2 px-6 border-b border-sidebar-border">
            <img src={ghostLogo} alt="GhostInvoice" className="h-8 w-8" />
            <span className="font-display text-lg font-bold text-sidebar-primary-foreground">GhostInvoice</span>
          </div>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside className={cn(
      "fixed left-0 top-0 z-40 flex h-screen flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      <div className="flex h-16 items-center gap-2 px-4 border-b border-sidebar-border">
        <img src={ghostLogo} alt="GhostInvoice" className="h-8 w-8 shrink-0" />
        {!collapsed && <span className="font-display text-lg font-bold text-sidebar-primary-foreground">GhostInvoice</span>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
      <SidebarNav />
    </aside>
  );
}

export function MobileMenuTrigger() {
  const isMobile = useIsMobile();
  const { setMobileOpen } = useSidebarState();

  if (!isMobile) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0"
      onClick={() => setMobileOpen(true)}
    >
      <Menu className="h-5 w-5" />
    </Button>
  );
}
