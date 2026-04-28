import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Client = Tables<"clients">;
export type Invoice = Tables<"invoices"> & { invoice_items: InvoiceItem[]; clients?: Client };
export type InvoiceRow = Tables<"invoices">;
export type InvoiceItem = Tables<"invoice_items">;
export type Subscription = Tables<"subscriptions"> & { clients?: Client };
export type Payment = Tables<"payments">;
export type Service = Tables<"services"> & { service_categories?: { id: string; name: string } | null };

export interface ServiceCategory {
  id: string;
  name: string;
  created_at: string;
}

// ─── Service Categories ───

export function useCategories() {
  return useQuery({
    queryKey: ["service_categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_categories").select("*").order("name");
      if (error) throw error;
      return data as ServiceCategory[];
    },
  });
}

export function useAddCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cat: { name: string }) => {
      const { data, error } = await supabase.from("service_categories").insert(cat).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service_categories"] }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data, error } = await supabase.from("service_categories").update({ name }).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service_categories"] });
      qc.invalidateQueries({ queryKey: ["services"] });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service_categories"] });
      qc.invalidateQueries({ queryKey: ["services"] });
    },
  });
}

// ─── Services ───

export function useServices() {
  return useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*, service_categories(id, name)").order("name");
      if (error) throw error;
      return data as Service[];
    },
  });
}

export function useActiveServices() {
  return useQuery({
    queryKey: ["services", "active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*, service_categories(id, name)").eq("active", true).order("name");
      if (error) throw error;
      return data as Service[];
    },
  });
}

export function useAddService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (service: TablesInsert<"services">) => {
      const { data, error } = await supabase.from("services").insert(service).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
  });
}

export function useUpdateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"services"> }) => {
      const { data, error } = await supabase.from("services").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
  });
}

// ─── Clients ───

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });
}

export function useAddClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (client: TablesInsert<"clients">) => {
      const { data, error } = await supabase.from("clients").insert(client).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"clients"> }) => {
      const { data, error } = await supabase.from("clients").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });
}

// ─── Invoices ───

export function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_items(*), clients(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Invoice[];
    },
  });
}

export function useAddInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoice, items }: { invoice: TablesInsert<"invoices">; items: Omit<TablesInsert<"invoice_items">, "invoice_id">[] }) => {
      const { data, error } = await supabase.from("invoices").insert(invoice).select().single();
      if (error) throw error;
      const itemsWithId = items.map(item => ({ ...item, invoice_id: data.id }));
      const { error: itemsError } = await supabase.from("invoice_items").insert(itemsWithId);
      if (itemsError) throw itemsError;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"invoices"> }) => {
      const { data, error } = await supabase.from("invoices").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useUpdateInvoiceItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId, items }: { invoiceId: string; items: Omit<TablesInsert<"invoice_items">, "invoice_id">[] }) => {
      // Delete existing items
      const { error: delError } = await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
      if (delError) throw delError;
      // Insert new items
      const itemsWithId = items.map(item => ({ ...item, invoice_id: invoiceId }));
      const { error: insError } = await supabase.from("invoice_items").insert(itemsWithId);
      if (insError) throw insError;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("invoice_items").delete().eq("invoice_id", id);
      await supabase.from("payments").update({ invoice_id: null }).eq("invoice_id", id);
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

// ─── Subscriptions ───

export function useSubscriptions() {
  return useQuery({
    queryKey: ["subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, clients(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Subscription[];
    },
  });
}

export function useAddSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      sub: TablesInsert<"subscriptions"> & { setup_fee?: number | null },
    ) => {
      const { setup_fee, ...row } = sub;
      const { data, error } = await supabase.from("subscriptions").insert(row).select("*, clients(*)").single();
      if (error) throw error;

      // Always seed one recurring line equal to the subscription's headline amount,
      // so price-history + invoice generation work uniformly with the items model.
      const items: TablesInsert<"subscription_items">[] = [
        {
          subscription_id: data.id,
          description: row.name,
          kind: "recurring",
          amount: Number(row.amount ?? 0),
          category_id: row.category_id ?? null,
          position: 0,
        },
      ];
      if (setup_fee && setup_fee > 0) {
        items.push({
          subscription_id: data.id,
          description: `Setup ${row.name}`,
          kind: "setup",
          amount: setup_fee,
          category_id: row.category_id ?? null,
          position: 1,
        });
      }
      const { error: itemsError } = await supabase.from("subscription_items").insert(items);
      if (itemsError) throw itemsError;

      return data as Subscription;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["subscription_items"] });
    },
  });
}

export type SubscriptionStatus = "active" | "paused" | "cancelled";

/**
 * Update a subscription's status. When moving to `paused`, an optional
 * `paused_until` date schedules automatic reactivation by the daily pg_cron
 * job. Moving to anything other than `paused` clears `paused_until`.
 */
export function useSetSubscriptionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, pausedUntil }: { id: string; status: SubscriptionStatus; pausedUntil?: string | null }) => {
      const updates: TablesUpdate<"subscriptions"> = { status };
      updates.paused_until = status === "paused" ? (pausedUntil ?? null) : null;
      const { error } = await supabase.from("subscriptions").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });
}

export function useUpdateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"subscriptions"> }) => {
      const { data, error } = await supabase
        .from("subscriptions")
        .update(updates)
        .eq("id", id)
        .select("*, clients(*)")
        .single();
      if (error) throw error;
      return data as Subscription;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });
}

export function useDeleteSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });
}

// ─── Payments ───

export function usePayments() {
  return useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*").order("date", { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
  });
}

export function useAddPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payment: TablesInsert<"payments">) => {
      const { data, error } = await supabase.from("payments").insert(payment).select().single();
      if (error) throw error;
      if (payment.invoice_id) {
        await recalcInvoiceStatus(payment.invoice_id);
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useUpdatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates, oldInvoiceId }: { id: string; updates: TablesUpdate<"payments">; oldInvoiceId?: string | null }) => {
      const { data, error } = await supabase.from("payments").update(updates).eq("id", id).select().single();
      if (error) throw error;
      if (oldInvoiceId) await recalcInvoiceStatus(oldInvoiceId);
      if (updates.invoice_id) await recalcInvoiceStatus(updates.invoice_id);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payment: Payment) => {
      const { error } = await supabase.from("payments").delete().eq("id", payment.id);
      if (error) throw error;
      if (payment.invoice_id) {
        await recalcInvoiceStatus(payment.invoice_id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

// ─── Next invoice number ───

export function useNextInvoiceNumber() {
  return useQuery({
    queryKey: ["next-invoice-number"],
    queryFn: async () => {
      const year = new Date().getFullYear();
      const { data, error } = await supabase
        .from("invoices")
        .select("number")
        .like("number", `FT ${year}/%`)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;

      let nextNum = 1;
      if (data && data.length > 0) {
        const lastNumber = data[0].number;
        const match = lastNumber.match(/\/(\d+)$/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
      }
      return `FT ${year}/${String(nextNum).padStart(3, '0')}`;
    },
  });
}

// ─── Helpers ───

async function recalcInvoiceStatus(invoiceId: string) {
  const [invoiceItemsResult, invoiceResult, invoicePaymentsResult] = await Promise.all([
    supabase.from("invoice_items").select("quantity, unit_price").eq("invoice_id", invoiceId),
    supabase.from("invoices").select("due_date, status").eq("id", invoiceId).single(),
    supabase.from("payments").select("amount").eq("invoice_id", invoiceId),
  ]);

  if (invoiceItemsResult.error || invoiceResult.error || invoicePaymentsResult.error) return;
  if (invoiceResult.data.status === 'draft') return;

  const invoiceTotal = (invoiceItemsResult.data ?? []).reduce(
    (sum, item) => sum + item.quantity * Number(item.unit_price), 0,
  );
  const paidTotal = (invoicePaymentsResult.data ?? []).reduce((sum, item) => sum + Number(item.amount), 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(invoiceResult.data.due_date);
  dueDate.setHours(0, 0, 0, 0);

  let nextStatus: string;
  if (invoiceTotal > 0 && paidTotal >= invoiceTotal) {
    nextStatus = "paid";
  } else if (paidTotal > 0 && paidTotal < invoiceTotal) {
    nextStatus = "partially_paid";
  } else if (dueDate < today) {
    nextStatus = "overdue";
  } else {
    nextStatus = "pending";
  }

  await supabase
    .from("invoices")
    .update({ status: nextStatus as any })
    .eq("id", invoiceId);
}

// ─── Subscription items ───

export type SubscriptionItem = Tables<"subscription_items">;

export function useSubscriptionItems(subscriptionId: string | undefined) {
  return useQuery({
    queryKey: ["subscription_items", subscriptionId],
    enabled: !!subscriptionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_items")
        .select("*")
        .eq("subscription_id", subscriptionId!)
        .order("position");
      if (error) throw error;
      return data as SubscriptionItem[];
    },
  });
}

export function useAddSubscriptionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: TablesInsert<"subscription_items">) => {
      const { data, error } = await supabase.from("subscription_items").insert(item).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["subscription_items", vars.subscription_id] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });
}

export function useUpdateSubscriptionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"subscription_items"> }) => {
      const { data, error } = await supabase.from("subscription_items").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription_items"] });
      qc.invalidateQueries({ queryKey: ["subscription_price_history"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });
}

export function useDeleteSubscriptionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subscription_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription_items"] }),
  });
}

// ─── Subscription detail composites ───

export function useSubscription(id: string | undefined) {
  return useQuery({
    queryKey: ["subscription", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, clients(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as Subscription;
    },
  });
}

export function useSubscriptionInvoices(subscriptionId: string | undefined) {
  return useQuery({
    queryKey: ["subscription_invoices", subscriptionId],
    enabled: !!subscriptionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_items(*)")
        .eq("subscription_id", subscriptionId!)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data as (Tables<"invoices"> & { invoice_items: InvoiceItem[] })[];
    },
  });
}

export interface SubscriptionPriceHistoryRow {
  id: string;
  subscription_id: string;
  subscription_item_id: string | null;
  amount: number;
  valid_from: string;
  valid_to: string | null;
  reason: string | null;
}

export function useSubscriptionPriceHistory(subscriptionId: string | undefined) {
  return useQuery({
    queryKey: ["subscription_price_history", subscriptionId],
    enabled: !!subscriptionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_price_history")
        .select("*")
        .eq("subscription_id", subscriptionId!)
        .order("valid_from", { ascending: false });
      if (error) throw error;
      return data as SubscriptionPriceHistoryRow[];
    },
  });
}

/**
 * Aggregated stats per subscription, computed in-memory from invoices/items so
 * we avoid extra round-trips. Returns: revenue this year and the date of the
 * most recent invoice. Both are 0/undefined for subscriptions with no
 * invoices linked yet.
 */
export function useSubscriptionStats() {
  return useQuery({
    queryKey: ["subscription_stats"],
    queryFn: async () => {
      const yearStart = `${new Date().getFullYear()}-01-01`;
      const { data, error } = await supabase
        .from("invoices")
        .select("subscription_id, issue_date, status, invoice_items(quantity, unit_price)")
        .not("subscription_id", "is", null);
      if (error) throw error;

      const stats: Record<string, { revenueThisYear: number; lastInvoiceDate: string | null }> = {};
      for (const inv of data ?? []) {
        const subId = inv.subscription_id as string;
        const total = (inv.invoice_items ?? []).reduce(
          (s: number, it: { quantity: number; unit_price: number }) => s + it.quantity * Number(it.unit_price),
          0,
        );
        const entry = stats[subId] ?? { revenueThisYear: 0, lastInvoiceDate: null };
        if (inv.status === "paid" && inv.issue_date >= yearStart) entry.revenueThisYear += total;
        if (!entry.lastInvoiceDate || inv.issue_date > entry.lastInvoiceDate) entry.lastInvoiceDate = inv.issue_date;
        stats[subId] = entry;
      }
      return stats;
    },
  });
}

export function usePendingInvoicesForSubscription(subscriptionId: string | undefined) {
  return useQuery({
    queryKey: ["pending_invoices_for_subscription", subscriptionId],
    enabled: !!subscriptionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, number, status, due_date")
        .eq("subscription_id", subscriptionId!)
        .in("status", ["draft", "pending", "partially_paid", "overdue"]);
      if (error) throw error;
      return data as { id: string; number: string; status: string; due_date: string }[];
    },
  });
}

// ─── Invoice helpers ───

/**
 * Duplicate an invoice: new invoice in `draft` status, same client + items,
 * fresh number + dates. Original is left untouched.
 */
export function useDuplicateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sourceId: string) => {
      const [{ data: src, error: srcErr }, { data: items, error: itemsErr }] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", sourceId).single(),
        supabase.from("invoice_items").select("*").eq("invoice_id", sourceId).order("position"),
      ]);
      if (srcErr) throw srcErr;
      if (itemsErr) throw itemsErr;

      const year = new Date().getFullYear();
      const { data: latest } = await supabase
        .from("invoices")
        .select("number")
        .like("number", `FT ${year}/%`)
        .order("created_at", { ascending: false })
        .limit(1);
      let nextNum = 1;
      if (latest && latest.length > 0) {
        const m = latest[0].number.match(/\/(\d+)$/);
        if (m) nextNum = parseInt(m[1], 10) + 1;
      }

      const today = new Date();
      const due = new Date(today);
      due.setDate(due.getDate() + 30);

      const { data: created, error: createErr } = await supabase
        .from("invoices")
        .insert({
          number: `FT ${year}/${String(nextNum).padStart(3, "0")}`,
          client_id: src.client_id,
          subscription_id: null,
          status: "draft",
          issue_date: today.toISOString().split("T")[0],
          due_date: due.toISOString().split("T")[0],
          notes: src.notes,
        })
        .select()
        .single();
      if (createErr) throw createErr;

      if (items && items.length > 0) {
        const cloned = items.map((it) => ({
          invoice_id: created.id,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          category_id: it.category_id,
          position: it.position,
        }));
        const { error: insErr } = await supabase.from("invoice_items").insert(cloned);
        if (insErr) throw insErr;
      }
      return created;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

/**
 * Persist a new ordering of invoice items by writing back the `position`
 * column for every row. The dnd-kit lib gives us the new array order; we
 * map it to indices.
 */
export function useReorderInvoiceItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId, orderedIds }: { invoiceId: string; orderedIds: string[] }) => {
      // PostgREST does not support bulk-update-by-id so we fan out N updates.
      // Lists are tiny (typically <20 items) so this is fine.
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabase.from("invoice_items").update({ position: idx }).eq("id", id),
        ),
      );
      return invoiceId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

// ─── Manual trigger of the daily generator ───

export function useGenerateSubscriptionInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("generate_subscription_invoices");
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });
}
