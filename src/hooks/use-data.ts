import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Client = Tables<"clients">;
export type Invoice = Tables<"invoices"> & { invoice_items: InvoiceItem[]; clients?: Client };
export type InvoiceRow = Tables<"invoices">;
export type InvoiceItem = Tables<"invoice_items">;
export type Subscription = Tables<"subscriptions"> & { clients?: Client };
export type Payment = Tables<"payments">;
export type Service = Tables<"services">;

// ─── Services ───

export function useServices() {
  return useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").order("name");
      if (error) throw error;
      return data as Service[];
    },
  });
}

export function useActiveServices() {
  return useQuery({
    queryKey: ["services", "active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").eq("active", true).order("name");
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
      // Retry loop for the rare race where the number we computed is
      // also picked up by a concurrent caller (e.g. the daily pg_cron
      // generator running while a user clicks "Nova fatura"). The
      // unique constraint on invoices.number makes the conflict surface
      // as Postgres SQLSTATE 23505 — we re-fetch a fresh number from
      // the SQL function and retry up to 3 times.
      const year = new Date().getFullYear();
      let payload: TablesInsert<"invoices"> = invoice;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await supabase.from("invoices").insert(payload).select().single();
        if (!error) {
          const itemsWithId = items.map(item => ({ ...item, invoice_id: data.id }));
          // Return the inserted items so callers (NewInvoice) can link
          // their auto-created subscriptions to the exact invoice_item rows.
          const { data: insertedItems, error: itemsError } = await supabase
            .from("invoice_items")
            .insert(itemsWithId)
            .select();
          if (itemsError) throw itemsError;
          return { invoice: data, items: (insertedItems ?? []) as InvoiceItem[] };
        }
        const isNumberConflict =
          error.code === "23505" &&
          /invoices_number_unique|number/i.test(error.message ?? "");
        if (!isNumberConflict || attempt === 2) throw error;
        const fresh = await fetchNextInvoiceNumber(year);
        payload = { ...payload, number: fresh };
      }
      throw new Error("Could not allocate a unique invoice number after 3 attempts");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["next-invoice-number"] });
    },
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

export interface UpdateInvoiceItemInput {
  // Present when the row already exists in the DB. Absent for newly
  // added lines. Preserving these IDs across edits is what lets
  // subscription_items.source_invoice_item_id keep tracking the same
  // line through future edits — a delete+insert would break the link.
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  position: number;
}

export function useUpdateInvoiceItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invoiceId,
      items,
      syncToSubscriptions = false,
    }: {
      invoiceId: string;
      items: UpdateInvoiceItemInput[];
      // When true, propagate description/amount changes into any
      // subscription_items that were originally created from these
      // invoice items (only if the invoice is not yet paid). Caller
      // is responsible for the not-paid check.
      syncToSubscriptions?: boolean;
    }) => {
      // 1. Fetch existing items to know which to delete (those not in
      //    the new list) without nuking IDs the FK depends on.
      const { data: existing, error: fetchError } = await supabase
        .from("invoice_items")
        .select("id")
        .eq("invoice_id", invoiceId);
      if (fetchError) throw fetchError;
      const submittedIds = new Set(items.map(i => i.id).filter(Boolean) as string[]);
      const toDelete = (existing ?? []).filter(e => !submittedIds.has(e.id)).map(e => e.id);

      if (toDelete.length > 0) {
        const { error: delError } = await supabase
          .from("invoice_items")
          .delete()
          .in("id", toDelete);
        if (delError) throw delError;
      }

      // 2. Update existing rows and insert new ones in parallel.
      const updates = items.filter(i => i.id);
      const inserts = items.filter(i => !i.id);

      if (updates.length > 0) {
        const results = await Promise.all(
          updates.map(u =>
            supabase
              .from("invoice_items")
              .update({
                description: u.description,
                quantity: u.quantity,
                unit_price: u.unit_price,
                position: u.position,
              })
              .eq("id", u.id!),
          ),
        );
        const firstError = results.find(r => r.error)?.error;
        if (firstError) throw firstError;
      }

      if (inserts.length > 0) {
        const rows = inserts.map(i => ({
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          position: i.position,
          invoice_id: invoiceId,
        }));
        const { error: insError } = await supabase.from("invoice_items").insert(rows);
        if (insError) throw insError;
      }

      // 3. Optional sync into linked subscription_items + recalc the
      //    parent subscription.amount. Only runs for items that still
      //    have a back-link (subscription_items.source_invoice_item_id).
      if (syncToSubscriptions && updates.length > 0) {
        const updatedIds = updates.map(u => u.id!);
        const { data: subItems, error: subItemsError } = await supabase
          .from("subscription_items")
          .select("id, subscription_id, source_invoice_item_id, kind")
          .in("source_invoice_item_id", updatedIds);
        if (subItemsError) throw subItemsError;

        const updateById = new Map(updates.map(u => [u.id!, u]));
        const affectedSubIds = new Set<string>();
        await Promise.all(
          (subItems ?? []).map(async si => {
            const srcId = si.source_invoice_item_id;
            if (!srcId) return;
            const src = updateById.get(srcId);
            if (!src) return;
            affectedSubIds.add(si.subscription_id);
            // The subscription line stores the *total* recurring
            // amount per period (qty * unit price). We mirror that
            // calculation when syncing.
            const newAmount = Number(src.unit_price) * src.quantity;
            const { error: updErr } = await supabase
              .from("subscription_items")
              .update({ description: src.description, amount: newAmount })
              .eq("id", si.id);
            if (updErr) throw updErr;
          }),
        );

        // Recalc subscription.amount = sum of recurring item amounts
        // for every affected subscription.
        await Promise.all(
          Array.from(affectedSubIds).map(async subId => {
            const { data: itemsForSub, error: e } = await supabase
              .from("subscription_items")
              .select("amount, kind")
              .eq("subscription_id", subId);
            if (e) throw e;
            const recurringTotal = (itemsForSub ?? [])
              .filter(it => it.kind === "recurring")
              .reduce((s, it) => s + Number(it.amount), 0);
            const { error: updErr } = await supabase
              .from("subscriptions")
              .update({ amount: recurringTotal })
              .eq("id", subId);
            if (updErr) throw updErr;
          }),
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["subscription_items"] });
    },
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

export interface AddSubscriptionLineInput {
  description: string;
  amount: number;
  kind?: "recurring" | "setup" | "addon";
  // When the subscription is being created from a NewInvoice flow, link
  // each line back to the invoice_item that originated it. Lets later
  // edits to the invoice propagate cleanly into the subscription.
  source_invoice_item_id?: string | null;
}

export function useAddSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      sub: TablesInsert<"subscriptions"> & {
        setup_fee?: number | null;
        // Optional: caller can provide the exact breakdown of recurring
        // lines. When set, seeds one subscription_item per entry instead
        // of the default single-line fallback. Used by NewInvoice when
        // the invoice has multiple billable rows so each row becomes its
        // own billable line on the subscription.
        lines?: AddSubscriptionLineInput[];
      },
    ) => {
      const { setup_fee, lines, ...row } = sub;
      const { data, error } = await supabase.from("subscriptions").insert(row).select("*, clients(*)").single();
      if (error) throw error;

      // Always seed at least one recurring line so price-history + invoice
      // generation work uniformly with the items model.
      const items: TablesInsert<"subscription_items">[] =
        lines && lines.length > 0
          ? lines.map((line, idx) => ({
              subscription_id: data.id,
              description: line.description,
              kind: line.kind ?? "recurring",
              amount: Number(line.amount ?? 0),
              position: idx,
              source_invoice_item_id: line.source_invoice_item_id ?? null,
            }))
          : [
              {
                subscription_id: data.id,
                description: row.name,
                kind: "recurring",
                amount: Number(row.amount ?? 0),
                position: 0,
              },
            ];
      if (setup_fee && setup_fee > 0) {
        items.push({
          subscription_id: data.id,
          description: `Setup ${row.name}`,
          kind: "setup",
          amount: setup_fee,
          position: items.length,
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
//
// Single source of truth lives in the SQL function public.next_invoice_number(year)
// (see migration 20260413110000_*). The function takes an advisory lock so
// concurrent callers in the same transaction serialize, and a UNIQUE
// constraint on invoices.number is the final guard against any race that
// escapes the lock (e.g. the RPC + INSERT happening in two separate
// transactions, like this hook's typical flow). useAddInvoice retries on
// the resulting 23505 below.

async function fetchNextInvoiceNumber(year: number): Promise<string> {
  const { data, error } = await supabase.rpc("next_invoice_number", { target_year: year });
  if (error) throw error;
  if (typeof data !== "string") {
    throw new Error("next_invoice_number returned an unexpected payload");
  }
  return data;
}

export function useNextInvoiceNumber() {
  return useQuery({
    queryKey: ["next-invoice-number"],
    queryFn: () => fetchNextInvoiceNumber(new Date().getFullYear()),
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
