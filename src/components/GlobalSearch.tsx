import { useState, useRef, useEffect, useMemo } from "react";
import { Search, FileText, Users, RefreshCw, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useClients, useInvoices, useSubscriptions } from "@/hooks/use-data";
import { formatCurrency, getInvoiceItemsTotal } from "@/lib/data";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface SearchResult {
  type: "client" | "invoice" | "subscription";
  title: string;
  subtitle: string;
  link: string;
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data: clients = [] } = useClients();
  const { data: invoices = [] } = useInvoices();
  const { data: subscriptions = [] } = useSubscriptions();

  const results = useMemo<SearchResult[]>(() => {
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    const r: SearchResult[] = [];

    clients.forEach(c => {
      if (c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) {
        r.push({ type: "client", title: c.company, subtitle: c.name, link: "/clientes" });
      }
    });

    invoices.forEach(inv => {
      if (inv.number.toLowerCase().includes(q) || inv.clients?.company?.toLowerCase().includes(q)) {
        r.push({ type: "invoice", title: inv.number, subtitle: `${inv.clients?.company} — ${formatCurrency(getInvoiceItemsTotal(inv.invoice_items))}`, link: "/faturas" });
      }
    });

    subscriptions.forEach(sub => {
      if (sub.name.toLowerCase().includes(q) || (sub as any).clients?.company?.toLowerCase().includes(q)) {
        r.push({ type: "subscription", title: sub.name, subtitle: `${(sub as any).clients?.company} — ${formatCurrency(Number(sub.amount))}`, link: "/subscricoes" });
      }
    });

    return r.slice(0, 8);
  }, [query, clients, invoices, subscriptions]);

  useEffect(() => { setSelectedIdx(0); }, [results]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
      if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && results[selectedIdx]) {
      navigate(results[selectedIdx].link);
      setOpen(false);
      setQuery("");
    }
  };

  const typeIcon = { client: Users, invoice: FileText, subscription: RefreshCw };
  const typeLabel = { client: "Cliente", invoice: "Fatura", subscription: "Subscrição" };

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="Pesquisar... (Ctrl+K)"
          className="pl-10 pr-8 bg-muted/50 border-border"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button onClick={() => { setQuery(""); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full rounded-xl border border-border bg-card shadow-elevated z-50 overflow-hidden">
          {results.map((r, idx) => {
            const Icon = typeIcon[r.type];
            return (
              <button
                key={idx}
                className={cn("flex items-center gap-3 w-full px-4 py-3 text-left transition-colors", idx === selectedIdx ? "bg-accent/10" : "hover:bg-muted/50")}
                onClick={() => { navigate(r.link); setOpen(false); setQuery(""); }}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-card-foreground truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                </div>
                <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{typeLabel[r.type]}</span>
              </button>
            );
          })}
        </div>
      )}

      {open && query.length >= 2 && results.length === 0 && (
        <div className="absolute top-full mt-2 w-full rounded-xl border border-border bg-card shadow-elevated z-50 px-4 py-6 text-center text-sm text-muted-foreground">
          Sem resultados para "{query}"
        </div>
      )}
    </div>
  );
}
