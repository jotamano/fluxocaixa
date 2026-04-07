import { cn } from "@/lib/utils";
import { type InvoiceStatus, statusLabels } from "@/lib/data";

const statusStyles: Record<InvoiceStatus, string> = {
  paid: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  overdue: "bg-destructive/10 text-destructive border-destructive/20",
  draft: "bg-muted text-muted-foreground border-border",
  partially_paid: "bg-blue-500/10 text-blue-600 border-blue-500/20",
};

export function StatusBadge({ status }: { status: string }) {
  const safeStatus = (status in statusStyles ? status : 'draft') as InvoiceStatus;
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
      statusStyles[safeStatus]
    )}>
      {statusLabels[safeStatus] || status}
    </span>
  );
}
