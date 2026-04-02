import { useState, useMemo } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sampleSubscriptions, sampleClients, serviceLabels, frequencyLabels, formatCurrency, type Subscription } from "@/lib/data";
import { cn } from "@/lib/utils";

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
  return day === 0 ? 6 : day - 1; // Monday = 0
}

function getSubscriptionDatesForMonth(sub: Subscription, year: number, month: number): number[] {
  if (!sub.active) return [];

  const startDate = new Date(sub.startDate);
  const billingDay = new Date(sub.nextBillingDate).getDate();
  const daysInMonth = getDaysInMonth(year, month);
  const effectiveDay = Math.min(billingDay, daysInMonth);

  const checkDate = new Date(year, month, effectiveDay);
  if (checkDate < startDate) return [];

  if (sub.frequency === 'monthly') {
    return [effectiveDay];
  }

  if (sub.frequency === 'quarterly') {
    const nextBilling = new Date(sub.nextBillingDate);
    // Check if this month aligns with quarterly billing
    const monthDiff = (year * 12 + month) - (nextBilling.getFullYear() * 12 + nextBilling.getMonth());
    if (monthDiff % 3 === 0) return [effectiveDay];
    return [];
  }

  if (sub.frequency === 'yearly') {
    const nextBilling = new Date(sub.nextBillingDate);
    if (nextBilling.getMonth() === month) return [effectiveDay];
    return [];
  }

  return [];
}

const serviceColors: Record<string, string> = {
  social_media: "bg-blue-500",
  website: "bg-emerald-500",
  marketing: "bg-amber-500",
  subscription: "bg-purple-500",
};

export default function CalendarPage() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const activeSubscriptions = sampleSubscriptions.filter(s => s.active);

  const subscriptionsByDay = useMemo(() => {
    const map = new Map<number, { sub: Subscription; client: string }[]>();
    activeSubscriptions.forEach(sub => {
      const days = getSubscriptionDatesForMonth(sub, currentYear, currentMonth);
      const client = sampleClients.find(c => c.id === sub.clientId);
      days.forEach(day => {
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push({ sub, client: client?.company || "—" });
      });
    });
    return map;
  }, [currentMonth, currentYear]);

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

  const totalBillingThisMonth = useMemo(() => {
    let total = 0;
    subscriptionsByDay.forEach(subs => {
      subs.forEach(({ sub }) => { total += sub.amount; });
    });
    return total;
  }, [subscriptionsByDay]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Calendário</h1>
          <p className="mt-1 text-muted-foreground">
            Faturação prevista este mês: <span className="font-semibold text-foreground">{formatCurrency(totalBillingThisMonth)}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={goToday} className="gap-2">
          <CalendarIcon className="h-4 w-4" /> Hoje
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Calendar Grid */}
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <Button variant="ghost" size="icon" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="font-display font-semibold text-card-foreground text-lg">
              {MONTHS_PT[currentMonth]} {currentYear}
            </h2>
            <Button variant="ghost" size="icon" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-4">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {DAYS_PT.map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const daySubs = subscriptionsByDay.get(day) || [];
                const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
                const isSelected = day === selectedDay;

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                    className={cn(
                      "aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-sm transition-colors relative",
                      isToday && "ring-2 ring-primary",
                      isSelected && "bg-primary text-primary-foreground",
                      !isSelected && "hover:bg-accent",
                      !isSelected && daySubs.length > 0 && "bg-accent/50"
                    )}
                  >
                    <span className={cn("font-medium", isSelected ? "text-primary-foreground" : "text-card-foreground")}>
                      {day}
                    </span>
                    {daySubs.length > 0 && (
                      <div className="flex gap-0.5">
                        {daySubs.slice(0, 3).map(({ sub }, idx) => (
                          <div
                            key={idx}
                            className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-primary-foreground/80" : serviceColors[sub.serviceType])}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="border-t border-border px-6 py-3 flex flex-wrap gap-4">
            {Object.entries(serviceColors).map(([key, color]) => (
              <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className={cn("h-2 w-2 rounded-full", color)} />
                {serviceLabels[key as keyof typeof serviceLabels]}
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar detail */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-card p-6">
            <h3 className="font-display font-semibold text-card-foreground mb-1">
              {selectedDay
                ? `${selectedDay} ${MONTHS_PT[currentMonth]}`
                : "Seleciona um dia"}
            </h3>
            {selectedDay && selectedSubs.length === 0 && (
              <p className="text-sm text-muted-foreground mt-3">Sem faturações neste dia.</p>
            )}
            {selectedSubs.length > 0 && (
              <div className="mt-4 space-y-3">
                {selectedSubs.map(({ sub, client }, idx) => (
                  <div key={idx} className="rounded-lg border border-border p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-card-foreground">{sub.name}</p>
                        <p className="text-xs text-muted-foreground">{client}</p>
                      </div>
                      <div className={cn("h-2 w-2 rounded-full mt-1.5", serviceColors[sub.serviceType])} />
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Valor</span>
                      <span className="font-semibold text-card-foreground">{formatCurrency(sub.amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Frequência</span>
                      <span className="text-card-foreground">{frequencyLabels[sub.frequency]}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Monthly summary */}
          <div className="rounded-xl border border-border bg-card shadow-card p-6">
            <h3 className="font-display font-semibold text-card-foreground mb-3">Resumo do mês</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subscrições ativas</span>
                <span className="font-semibold text-card-foreground">{activeSubscriptions.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Faturações este mês</span>
                <span className="font-semibold text-card-foreground">{subscriptionsByDay.size}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total previsto</span>
                <span className="font-semibold text-card-foreground">{formatCurrency(totalBillingThisMonth)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
