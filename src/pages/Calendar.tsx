import { useState, useMemo } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, LayoutList, LayoutGrid, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscriptions, useInvoices } from "@/hooks/use-data";
import { frequencyLabels, formatCurrency, getInvoiceItemsTotal, getClientLabel } from "@/lib/data";
import { StatusBadge } from "@/components/StatusBadge";
import { PaymentDialog } from "@/components/PaymentDialog";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import type { Subscription, Invoice, InvoiceItem } from "@/hooks/use-data";

const DAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

// Month-period count for each frequency value. A value of N means the
// subscription re-bills every N months on the anchor day. Week-level
// frequencies (weekly / biweekly) are flagged with 0 so callers can
// expand them into multiple days within the month.
const monthsBetweenBillings: Record<string, number> = {
  weekly: 0,
  biweekly: 0,
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
  biannual: 24,
};

function getSubscriptionDatesForMonth(sub: Subscription, year: number, month: number): number[] {
  if (!sub.active) return [];
  const startDate = new Date(sub.start_date);
  const daysInMonth = getDaysInMonth(year, month);
  const nextBilling = new Date(sub.next_billing_date);
  const step = monthsBetweenBillings[sub.frequency] ?? 0;

  // Weekly / biweekly: step forward from next_billing_date by 7 or 14
  // days and emit every date that falls in the requested month.
  if (step === 0) {
    const intervalDays = sub.frequency === 'weekly' ? 7 : 14;
    const dates: number[] = [];
    const cursor = new Date(nextBilling);
    // Rewind to find the earliest billing in or before this month.
    while (cursor.getFullYear() > year || (cursor.getFullYear() === year && cursor.getMonth() > month)) {
      cursor.setDate(cursor.getDate() - intervalDays);
    }
    while (cursor.getFullYear() < year || (cursor.getFullYear() === year && cursor.getMonth() < month)) {
      cursor.setDate(cursor.getDate() + intervalDays);
    }
    while (cursor.getFullYear() === year && cursor.getMonth() === month) {
      if (cursor >= startDate) dates.push(cursor.getDate());
      cursor.setDate(cursor.getDate() + intervalDays);
    }
    return dates;
  }

  // Month-aligned frequencies: emit a single day per matching month.
  const billingDay = nextBilling.getDate();
  const effectiveDay = Math.min(billingDay, daysInMonth);
  const checkDate = new Date(year, month, effectiveDay);
  if (checkDate < startDate) return [];
  const monthDiff = (year * 12 + month) - (nextBilling.getFullYear() * 12 + nextBilling.getMonth());
  if (monthDiff % step === 0) return [effectiveDay];
  return [];
}

type ViewMode = "month" | "list";

type Filters = {
  pendingInvoices: boolean;
  overdueInvoices: boolean;
  subscriptions: boolean;
};

export default function CalendarPage() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>("month");
  const [filters, setFilters] = useState<Filters>({
    pendingInvoices: true,
    overdueInvoices: true,
    subscriptions: true,
  });
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null);

  const navigate = useNavigate();
  const { data: allSubscriptions = [] } = useSubscriptions();
  const { data: invoices = [] } = useInvoices();
  const activeSubscriptions = allSubscriptions.filter(s => s.active);

  const toggleFilter = (key: keyof Filters) => setFilters(f => ({ ...f, [key]: !f[key] }));

  // Subscriptions hitting a billing day inside the current month, only
  // when the "subscriptions" filter is enabled. Map<day, [...]>.
  const subscriptionsByDay = useMemo(() => {
    const map = new Map<number, { sub: Subscription; client: string }[]>();
    if (!filters.subscriptions) return map;
    activeSubscriptions.forEach(sub => {
      const days = getSubscriptionDatesForMonth(sub, currentYear, currentMonth);
      days.forEach(day => {
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push({ sub, client: getClientLabel(sub, "—") });
      });
    });
    return map;
  }, [currentMonth, currentYear, activeSubscriptions, filters.subscriptions]);

  // Pending or overdue invoices due inside the current month, filtered
  // by the user's status toggles. We bucket pending and overdue under
  // the same Map<day,...> because the cell rendering colours them
  // individually based on each invoice's status.
  const invoicesByDay = useMemo(() => {
    const map = new Map<number, Invoice[]>();
    invoices.forEach(inv => {
      if (inv.status === 'paid') return;
      if (inv.status === 'overdue' && !filters.overdueInvoices) return;
      if (inv.status !== 'overdue' && !filters.pendingInvoices) return;
      const due = new Date(inv.due_date);
      if (due.getMonth() === currentMonth && due.getFullYear() === currentYear) {
        const day = due.getDate();
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(inv);
      }
    });
    return map;
  }, [invoices, currentMonth, currentYear, filters.overdueInvoices, filters.pendingInvoices]);

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
    setSelectedDay(null);
  };

  const goToday = () => {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
    setSelectedDay(today.getDate());
  };

  const selectedSubs = selectedDay ? subscriptionsByDay.get(selectedDay) || [] : [];
  const selectedInvoices = selectedDay ? invoicesByDay.get(selectedDay) || [] : [];

  // Total expected billing this month = subscriptions hitting a billing
  // day + pending/overdue invoices due in the month. Previously this
  // only summed subscriptions, which understated cash flow on months
  // with manually-issued or backlog-overdue invoices.
  const subBillingTotal = useMemo(() => {
    let total = 0;
    subscriptionsByDay.forEach(subs => {
      subs.forEach(({ sub }) => { total += Number(sub.amount); });
    });
    return total;
  }, [subscriptionsByDay]);

  const invoiceBillingTotal = useMemo(() => {
    let total = 0;
    invoicesByDay.forEach(invs => {
      invs.forEach(inv => { total += getInvoiceItemsTotal(inv.invoice_items); });
    });
    return total;
  }, [invoicesByDay]);

  const totalBillingThisMonth = subBillingTotal + invoiceBillingTotal;

  // Number of pending/overdue invoices in the month — not the number
  // of distinct days they fall on (that was the prior, misleading
  // value of `invoicesByDay.size`).
  const totalInvoiceCount = useMemo(() => {
    let count = 0;
    invoicesByDay.forEach(invs => { count += invs.length; });
    return count;
  }, [invoicesByDay]);

  // Pre-built list for the "Lista" view: every event in the month
  // sorted by day, mirroring what the user sees if they were to click
  // through every populated day.
  const listEvents = useMemo(() => {
    const days: { day: number; subs: { sub: Subscription; client: string }[]; invs: Invoice[] }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const subs = subscriptionsByDay.get(d) || [];
      const invs = invoicesByDay.get(d) || [];
      if (subs.length || invs.length) days.push({ day: d, subs, invs });
    }
    return days;
  }, [daysInMonth, subscriptionsByDay, invoicesByDay]);

  const handleDayActivate = (day: number) => setSelectedDay(day === selectedDay ? null : day);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Calendário</h1>
          <p className="mt-1 text-muted-foreground">
            Faturação prevista este mês: <span className="font-semibold text-foreground">{formatCurrency(totalBillingThisMonth)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-md border border-border bg-card p-1">
            <Button
              variant={view === "month" ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
              onClick={() => setView("month")}
            >
              <LayoutGrid className="h-4 w-4" /> Mês
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
              onClick={() => setView("list")}
            >
              <LayoutList className="h-4 w-4" /> Lista
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={goToday} className="gap-2">
            <CalendarIcon className="h-4 w-4" /> Hoje
          </Button>
        </div>
      </div>

      {/* Filter chips. Each toggle hides one event class from the grid,
          the side panel, the list view AND the resumo totals — so what
          the user sees is what gets summed. */}
      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={filters.pendingInvoices}
          onClick={() => toggleFilter("pendingInvoices")}
          colorClass="bg-warning"
          label="Faturas pendentes"
        />
        <FilterChip
          active={filters.overdueInvoices}
          onClick={() => toggleFilter("overdueInvoices")}
          colorClass="bg-destructive"
          label="Faturas vencidas"
        />
        <FilterChip
          active={filters.subscriptions}
          onClick={() => toggleFilter("subscriptions")}
          colorClass="bg-primary"
          label="Subscrições"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {view === "month" ? (
          <div className="rounded-xl border border-border bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <h2 className="font-display font-semibold text-card-foreground text-lg">{MONTHS_PT[currentMonth]} {currentYear}</h2>
              <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-7 mb-2">
                {DAYS_PT.map(d => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square sm:aspect-auto sm:min-h-[96px]" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const daySubs = subscriptionsByDay.get(day) || [];
                  const dayInvoices = invoicesByDay.get(day) || [];
                  const totalEvents = daySubs.length + dayInvoices.length;
                  const hasEvents = totalEvents > 0;
                  const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
                  const isSelected = day === selectedDay;
                  // On desktop we show event pills; on small screens we
                  // fall back to dots because each cell is too narrow to
                  // render readable text.
                  const MAX_PILLS = 3;
                  const visibleInvoices = dayInvoices.slice(0, MAX_PILLS);
                  const remainingForSubs = Math.max(0, MAX_PILLS - visibleInvoices.length);
                  const visibleSubs = daySubs.slice(0, remainingForSubs);
                  const overflow = totalEvents - (visibleInvoices.length + visibleSubs.length);
                  return (
                    <div
                      key={day}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleDayActivate(day)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleDayActivate(day); } }}
                      className={cn(
                        "rounded-lg text-sm transition-colors relative text-left cursor-pointer",
                        "aspect-square sm:aspect-auto sm:min-h-[96px]",
                        "flex flex-col gap-0.5",
                        "items-center justify-center sm:items-stretch sm:justify-start sm:p-1.5",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        isToday && "ring-2 ring-primary",
                        isSelected && "bg-primary text-primary-foreground",
                        !isSelected && "hover:bg-accent",
                        !isSelected && hasEvents && "bg-accent/30"
                      )}
                    >
                      <span className={cn(
                        "font-medium shrink-0",
                        isSelected ? "text-primary-foreground" : "text-card-foreground",
                      )}>{day}</span>

                      {/* Mobile: dot indicators (cells are too narrow for text). */}
                      {hasEvents && (
                        <div className="flex gap-0.5 sm:hidden">
                          {daySubs.slice(0, 2).map((_, idx) => (
                            <div key={`s-${idx}`} className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-primary-foreground/80" : "bg-primary")} />
                          ))}
                          {dayInvoices.slice(0, 2).map((inv, idx) => (
                            <div key={`i-${idx}`} className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-primary-foreground/80" : inv.status === 'overdue' ? "bg-destructive" : "bg-warning")} />
                          ))}
                        </div>
                      )}

                      {/* Desktop: stacked pills with names that are
                          themselves links. Click-stop-propagation stops
                          the cell's day-select handler from firing on
                          top of the pill navigation. */}
                      {hasEvents && (
                        <div className="hidden sm:flex flex-col gap-0.5 w-full overflow-hidden">
                          {visibleInvoices.map(inv => (
                            <Link
                              key={`i-${inv.id}`}
                              to={`/faturas/${inv.id}`}
                              onClick={(e) => e.stopPropagation()}
                              title={`Fatura ${inv.number} · ${getClientLabel(inv, "")}`}
                              className={cn(
                                "truncate rounded px-1.5 py-0.5 text-[10px] leading-tight font-medium hover:opacity-80 transition-opacity",
                                isSelected
                                  ? "bg-primary-foreground/20 text-primary-foreground"
                                  : inv.status === 'overdue'
                                    ? "bg-destructive/15 text-destructive"
                                    : "bg-warning/20 text-warning-foreground",
                              )}
                            >
                              {inv.number}
                            </Link>
                          ))}
                          {visibleSubs.map(({ sub, client }, idx) => (
                            <Link
                              key={`s-${sub.id}-${idx}`}
                              to={`/subscricoes/${sub.id}`}
                              onClick={(e) => e.stopPropagation()}
                              title={`${sub.name} · ${client}`}
                              className={cn(
                                "truncate rounded px-1.5 py-0.5 text-[10px] leading-tight font-medium hover:opacity-80 transition-opacity",
                                isSelected
                                  ? "bg-primary-foreground/20 text-primary-foreground"
                                  : "bg-primary/15 text-primary",
                              )}
                            >
                              {sub.name}
                            </Link>
                          ))}
                          {overflow > 0 && (
                            <span className={cn(
                              "text-[10px] leading-tight px-1.5",
                              isSelected ? "text-primary-foreground/80" : "text-muted-foreground",
                            )}>+{overflow} mais</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-border px-6 py-3 flex flex-wrap gap-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-primary" />
                Subscrição
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-warning" />
                Fatura pendente
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-destructive" />
                Fatura vencida
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <h2 className="font-display font-semibold text-card-foreground text-lg">{MONTHS_PT[currentMonth]} {currentYear}</h2>
              <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              {listEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem eventos neste mês com os filtros atuais.</p>
              ) : (
                listEvents.map(({ day, subs, invs }) => {
                  const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
                  return (
                    <div key={day} className="space-y-2">
                      <div className="flex items-baseline gap-2">
                        <span className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                          isToday ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                        )}>{day}</span>
                        <span className="text-xs text-muted-foreground">{DAYS_PT[(new Date(currentYear, currentMonth, day).getDay() + 6) % 7]}</span>
                      </div>
                      <div className="space-y-2 pl-9">
                        {invs.map(inv => (
                          <InvoiceListRow
                            key={inv.id}
                            inv={inv}
                            onMarkPaid={() => setPaymentInvoice(inv)}
                          />
                        ))}
                        {subs.map(({ sub, client }) => (
                          <button
                            key={sub.id}
                            onClick={() => navigate(`/subscricoes/${sub.id}`)}
                            className="block w-full text-left rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate text-card-foreground">{sub.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{client} · {frequencyLabels[sub.frequency]}</p>
                              </div>
                              <span className="text-sm font-semibold shrink-0 text-card-foreground">{formatCurrency(Number(sub.amount))}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {view === "month" && (
            <div className="rounded-xl border border-border bg-card shadow-card p-6">
              <h3 className="font-display font-semibold text-card-foreground mb-1">
                {selectedDay ? `${selectedDay} ${MONTHS_PT[currentMonth]}` : "Seleciona um dia"}
              </h3>

              {selectedDay && selectedSubs.length === 0 && selectedInvoices.length === 0 && (
                <p className="text-sm text-muted-foreground mt-3">Sem eventos neste dia.</p>
              )}

              {selectedInvoices.length > 0 && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Faturas a vencer</p>
                  {selectedInvoices.map(inv => (
                    <div key={inv.id} className="rounded-lg border border-border p-4 space-y-2">
                      <Link to={`/faturas/${inv.id}`} className="block space-y-1 hover:opacity-80 transition-opacity">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-card-foreground">{inv.number}</p>
                          <StatusBadge status={inv.status} />
                        </div>
                        <p className="text-xs text-muted-foreground">{getClientLabel(inv)}</p>
                        <InvoiceItemsPreview items={inv.invoice_items} />
                        <p className="text-sm font-semibold text-card-foreground">{formatCurrency(getInvoiceItemsTotal(inv.invoice_items))}</p>
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => setPaymentInvoice(inv)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como paga
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {selectedSubs.length > 0 && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subscrições</p>
                  {selectedSubs.map(({ sub, client }, idx) => (
                    <Link
                      key={idx}
                      to={`/subscricoes/${sub.id}`}
                      className="block rounded-lg border border-border p-4 space-y-2 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold text-card-foreground">{sub.name}</p>
                          <p className="text-xs text-muted-foreground">{client}</p>
                        </div>
                        <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Valor</span>
                        <span className="font-semibold text-card-foreground">{formatCurrency(Number(sub.amount))}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Frequência</span>
                        <span className="text-card-foreground">{frequencyLabels[sub.frequency]}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-border bg-card shadow-card p-6">
            <h3 className="font-display font-semibold text-card-foreground mb-3">Resumo do mês</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subscrições ativas</span>
                <span className="font-semibold text-card-foreground">{filters.subscriptions ? activeSubscriptions.length : 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Faturas a vencer</span>
                <span className="font-semibold text-card-foreground">{totalInvoiceCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total previsto</span>
                <span className="font-semibold text-card-foreground">{formatCurrency(totalBillingThisMonth)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PaymentDialog
        open={paymentInvoice !== null}
        onOpenChange={(open) => { if (!open) setPaymentInvoice(null); }}
        invoices={paymentInvoice ? [paymentInvoice] : []}
        initialInvoiceId={paymentInvoice?.id ?? ""}
        title="Marcar fatura como paga"
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  colorClass,
  label,
}: { active: boolean; onClick: () => void; colorClass: string; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-border bg-card text-card-foreground"
          : "border-dashed border-border bg-transparent text-muted-foreground line-through opacity-60",
      )}
      type="button"
    >
      <span className={cn("h-2 w-2 rounded-full", colorClass, !active && "opacity-40")} />
      {label}
    </button>
  );
}

function InvoiceListRow({ inv, onMarkPaid }: { inv: Invoice; onMarkPaid: () => void }) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <Link to={`/faturas/${inv.id}`} className="block hover:opacity-80 transition-opacity space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate text-card-foreground">{inv.number}</p>
            <p className="text-xs text-muted-foreground truncate">{getClientLabel(inv)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={inv.status} />
            <span className="text-sm font-semibold text-card-foreground">{formatCurrency(getInvoiceItemsTotal(inv.invoice_items))}</span>
          </div>
        </div>
        <InvoiceItemsPreview items={inv.invoice_items} />
      </Link>
      <Button variant="outline" size="sm" className="w-full gap-2" onClick={onMarkPaid}>
        <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como paga
      </Button>
    </div>
  );
}

// Compact list of the invoice's line items shown directly inside the
// calendar cards so the user can tell what each invoice covers without
// opening the detail page. Limits to 3 lines and folds the rest into a
// "+N mais" tail to keep the card compact.
function InvoiceItemsPreview({ items }: { items: InvoiceItem[] }) {
  if (!items || items.length === 0) return null;
  const visible = items.slice(0, 3);
  const extra = items.length - visible.length;
  return (
    <ul className="text-xs text-muted-foreground space-y-0.5">
      {visible.map(it => (
        <li key={it.id} className="truncate">• {it.description}</li>
      ))}
      {extra > 0 && (
        <li className="text-muted-foreground/70">+{extra} mais</li>
      )}
    </ul>
  );
}
