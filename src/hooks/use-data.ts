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
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });
}

// Trash views — read soft-deleted rows for the /lixo page.
export function useTrashedClients() {
  return useQuery({
    queryKey: ["clients", "trashed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
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

// Soft-delete a client. The DB trigger cascade_soft_delete_client_trg
// (migration 20260413120000_*) propagates the same timestamp to the
// client's invoices, subscriptions and payments. Restoring the client
// only un-deletes the children that share that exact timestamp, so any
// rows the user had already deleted manually stay deleted.
export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("clients")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
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

export function useRestoreClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("clients")
        .update({ deleted_at: null })
        .eq("id", id);
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

// Hard-delete (used only from /lixo). Children come along via the
// existing FK CASCADEs.
export function usePurgeClient() {
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
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Invoice[];
    },
  });
}

export function useTrashedInvoices() {
  return useQuery({
    queryKey: ["invoices", "trashed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_items(*), clients(*)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
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
  // added lines. Preserving these IDs across edits is what keeps the
  // bidirectional link with subscription_items intact — a
  // delete+insert would null out invoice_items.source_subscription_item_id
  // and break sync.
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  position: number;
  // Only relevant when this row is a NEW line (no id) AND the caller
  // asked us to spawn a subscription for new lines (see
  // `spawnSubscriptionForNewLines` on `useUpdateInvoiceItems`). When
  // present, overrides the default frequency for the spawned sub.
  newLineFrequency?: import("@/lib/data").SubscriptionFrequency;
  // Service hint, only for spawned subscriptions on new lines.
  newLineServiceName?: string;
  // Manual link override. When the user picks "Ligar a subscrição..."
  // on an existing line, this is the chosen subscription_item.id.
  // Applied to invoice_items.source_subscription_item_id on save and,
  // if syncToSubscriptions is true, the line's edits also flow into
  // that sub_item. Setting it to `null` (vs `undefined`) means the
  // user explicitly *unlinked* the row — we'll clear the column.
  linkToSubscriptionItemId?: string | null;
}

export interface UpdateInvoiceItemsResult {
  syncedSubscriptionIds: string[];
  spawnedSubscriptionIds: string[];
}

/**
 * Save the line set on an existing invoice. Preserves invoice_item IDs
 * for rows that already existed (so the bidirectional link with
 * subscription_items survives). Optionally:
 *   - Mirrors edits to existing rows back into the linked sub_items
 *     (`syncToSubscriptions`). The link is read from
 *     `invoice_items.source_subscription_item_id`, which is populated
 *     for both NewInvoice-created and cron-generated invoices.
 *   - Spawns a brand new subscription per NEW line
 *     (`spawnSubscriptionForNewLines`). Mirrors NewInvoice's "one
 *     subscription per line" model: each new line becomes its own
 *     subscription so the user can pause/cancel/reprice independently.
 */
export function useUpdateInvoiceItems() {
  const qc = useQueryClient();
  return useMutation<
    UpdateInvoiceItemsResult,
    Error,
    {
      invoiceId: string;
      items: UpdateInvoiceItemInput[];
      // When true, propagate description/amount changes into any
      // subscription_items linked from these invoice rows. Caller is
      // responsible for the "invoice still editable" check.
      syncToSubscriptions?: boolean;
      // When set, NEW lines (no id) MAY spawn one fresh subscription
      // per line. The actual decision is per-line: only lines whose
      // `newLineFrequency` resolves to a real frequency are spawned.
      // `defaultFrequency` is optional — when omitted, spawning is
      // strictly opt-in via the per-line picker.
      spawnSubscriptionForNewLines?: {
        clientId: string;
        defaultFrequency?: import("@/lib/data").SubscriptionFrequency;
      };
    }
  >({
    mutationFn: async ({ invoiceId, items, syncToSubscriptions = false, spawnSubscriptionForNewLines }) => {
      const result: UpdateInvoiceItemsResult = { syncedSubscriptionIds: [], spawnedSubscriptionIds: [] };

      // 1. Reconcile rows: figure out what to delete (existing IDs
      //    that aren't in the new list) without disturbing the rows
      //    that stay.
      const { data: existing, error: fetchError } = await supabase
        .from("invoice_items")
        .select("id")
        .eq("invoice_id", invoiceId);
      if (fetchError) throw fetchError;
      const submittedIds = new Set(items.map(i => i.id).filter(Boolean) as string[]);
      const toDelete = (existing ?? []).filter(e => !submittedIds.has(e.id)).map(e => e.id);
      if (toDelete.length > 0) {
        const { error: delError } = await supabase.from("invoice_items").delete().in("id", toDelete);
        if (delError) throw delError;
      }

      // 2. Apply updates to existing rows and insert any new ones.
      const updates = items.filter(i => i.id);
      const inserts = items.filter(i => !i.id);

      if (updates.length > 0) {
        const results = await Promise.all(
          updates.map(u => {
            const patch: TablesUpdate<"invoice_items"> = {
              description: u.description,
              quantity: u.quantity,
              unit_price: u.unit_price,
              position: u.position,
            };
            // `undefined` = caller didn't touch the link — leave column
            // alone. `null` = explicit unlink. A string = explicit
            // link. Always pass through what the caller chose.
            if (u.linkToSubscriptionItemId !== undefined) {
              patch.source_subscription_item_id = u.linkToSubscriptionItemId;
            }
            return supabase.from("invoice_items").update(patch).eq("id", u.id!);
          }),
        );
        const firstError = results.find(r => r.error)?.error;
        if (firstError) throw firstError;
      }

      // Insert new rows one at a time so we can map each input back to
      // its persisted id (needed when spawning subscriptions).
      const insertedRows: Array<{ input: UpdateInvoiceItemInput; row: Tables<"invoice_items"> }> = [];
      for (const i of inserts) {
        const { data, error: insError } = await supabase
          .from("invoice_items")
          .insert({
            description: i.description,
            quantity: i.quantity,
            unit_price: i.unit_price,
            position: i.position,
            invoice_id: invoiceId,
          })
          .select()
          .single();
        if (insError) throw insError;
        insertedRows.push({ input: i, row: data as Tables<"invoice_items"> });
      }

      // 3. Sync edits to existing rows back into linked sub_items.
      //    Use the canonical link stored on invoice_items
      //    (source_subscription_item_id), populated for both NewInvoice
      //    and cron flows post 20260413130000.
      if (syncToSubscriptions && updates.length > 0) {
        const updatedIds = updates.map(u => u.id!);
        const { data: invItemsAfter, error: readErr } = await supabase
          .from("invoice_items")
          .select("id, source_subscription_item_id")
          .in("id", updatedIds);
        if (readErr) throw readErr;

        const updateById = new Map(updates.map(u => [u.id!, u]));
        const affectedSubIds = new Set<string>();
        const subItemUpdates: Array<{ subItemId: string; description: string; amount: number }> = [];

        // We also need to know each linked sub_item's subscription_id
        // for the recalc step below. One round-trip fetches them all.
        const linkedSubItemIds = (invItemsAfter ?? [])
          .map(r => r.source_subscription_item_id)
          .filter((x): x is string => !!x);
        if (linkedSubItemIds.length > 0) {
          const { data: subItemRows, error: siErr } = await supabase
            .from("subscription_items")
            .select("id, subscription_id, kind")
            .in("id", linkedSubItemIds);
          if (siErr) throw siErr;

          const subIdByItemId = new Map(
            (subItemRows ?? []).map(si => [si.id, si.subscription_id]),
          );

          for (const ir of invItemsAfter ?? []) {
            const subItemId = ir.source_subscription_item_id;
            if (!subItemId) continue;
            const src = updateById.get(ir.id);
            if (!src) continue;
            const subId = subIdByItemId.get(subItemId);
            if (subId) affectedSubIds.add(subId);
            // sub_item.amount stores the per-period total (qty * unit
            // price). Mirror that exact calculation.
            subItemUpdates.push({
              subItemId,
              description: src.description,
              amount: Number(src.unit_price) * src.quantity,
            });
          }
        }

        await Promise.all(
          subItemUpdates.map(({ subItemId, description, amount }) =>
            supabase
              .from("subscription_items")
              .update({ description, amount })
              .eq("id", subItemId)
              .then(({ error }) => {
                if (error) throw error;
              }),
          ),
        );

        // Recalc subscription.amount = sum of `recurring` items.
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
        result.syncedSubscriptionIds = Array.from(affectedSubIds);
      }

      // 4. Spawn a subscription for each new line — only when caller
      //    explicitly opted in. Mirrors NewInvoice's per-line model.
      //    Per-line `newLineFrequency` is the explicit opt-in: lines
      //    without a frequency picked are skipped (the user told us
      //    "this new line is just an invoice item, don't make a sub").
      if (spawnSubscriptionForNewLines && insertedRows.length > 0) {
        const { clientId, defaultFrequency } = spawnSubscriptionForNewLines;
        const today = new Date().toISOString().split("T")[0];

        for (const { input, row } of insertedRows) {
          const chosen = input.newLineFrequency ?? defaultFrequency;
          if (!chosen) continue; // explicit "Não criar subscrição"
          const frequency = chosen;
          // Approximate next_billing_date: today + one period. The
          // exact cadence is later enforced by the cron's interval
          // arithmetic, so this only matters for the first run.
          const periodDays = (await import("@/lib/data")).frequencyDays[frequency];
          const nextBilling = new Date(today);
          nextBilling.setDate(nextBilling.getDate() + periodDays);
          const lineAmount = Number(input.unit_price) * input.quantity;

          const { data: newSub, error: subErr } = await supabase
            .from("subscriptions")
            .insert({
              client_id: clientId,
              name: input.newLineServiceName || input.description,
              amount: lineAmount,
              frequency,
              next_billing_date: nextBilling.toISOString().split("T")[0],
              start_date: today,
              source_invoice_id: invoiceId,
            })
            .select()
            .single();
          if (subErr) throw subErr;

          const { data: newSubItem, error: itemErr } = await supabase
            .from("subscription_items")
            .insert({
              subscription_id: newSub.id,
              description: input.newLineServiceName || input.description,
              kind: "recurring",
              amount: lineAmount,
              position: 0,
              source_invoice_item_id: row.id,
            })
            .select()
            .single();
          if (itemErr) throw itemErr;

          // Close the loop: stamp the freshly created sub_item id on
          // the invoice_item, so future edits (in either direction)
          // sync correctly.
          const { error: linkErr } = await supabase
            .from("invoice_items")
            .update({ source_subscription_item_id: newSubItem.id })
            .eq("id", row.id);
          if (linkErr) throw linkErr;

          result.spawnedSubscriptionIds.push(newSub.id);
        }
      }

      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["subscription_items"] });
    },
  });
}

// Soft-delete the invoice. We deliberately don't touch invoice_items
// (they're scoped to the invoice and only become visible if the parent
// is) nor payments — payments stay attached so the financial record on
// the client side remains coherent. To break the link explicitly the
// user can edit the payment.
export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invoices")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

export function useRestoreInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invoices")
        .update({ deleted_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

// Hard-delete: matches the previous useDeleteInvoice behaviour exactly
// (clear FK on payments, drop items, drop the invoice). Used only from
// /lixo.
export function usePurgeInvoice() {
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
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Subscription[];
    },
  });
}

export function useTrashedSubscriptions() {
  return useQuery({
    queryKey: ["subscriptions", "trashed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, clients(*)")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
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
      const { data: insertedSubItems, error: itemsError } = await supabase
        .from("subscription_items")
        .insert(items)
        .select();
      if (itemsError) throw itemsError;

      // Close the link loop: when a sub_item carries a
      // source_invoice_item_id (NewInvoice flow), stamp the inverse
      // link onto the originating invoice_item so future edits in
      // either direction can resolve the pair via a single column
      // lookup.
      const linkUpdates = (insertedSubItems ?? [])
        .filter(si => si.source_invoice_item_id)
        .map(si =>
          supabase
            .from("invoice_items")
            .update({ source_subscription_item_id: si.id })
            .eq("id", si.source_invoice_item_id!),
        );
      if (linkUpdates.length > 0) {
        const results = await Promise.all(linkUpdates);
        const firstError = results.find(r => r.error)?.error;
        if (firstError) throw firstError;
      }

      return data as Subscription;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["subscription_items"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
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
      const { error } = await supabase
        .from("subscriptions")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });
}

export function useRestoreSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("subscriptions")
        .update({ deleted_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });
}

export function usePurgeSubscription() {
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
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .is("deleted_at", null)
        .order("date", { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
  });
}

export function useTrashedPayments() {
  return useQuery({
    queryKey: ["payments", "trashed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
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
      const { error } = await supabase
        .from("payments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", payment.id);
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
    supabase.from("payments").select("amount").eq("invoice_id", invoiceId).is("deleted_at", null),
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

/**
 * All subscription_items belonging to a single client, with the parent
 * subscription joined. Used by the invoice editor's "Ligar a
 * subscrição..." picker, where the user can attach an existing invoice
 * line to any of the client's sub_items so future edits sync.
 */
export type SubscriptionItemWithSubscription = SubscriptionItem & {
  subscriptions: Tables<"subscriptions"> | null;
};

export function useClientSubscriptionItems(clientId: string | undefined | null) {
  return useQuery({
    queryKey: ["subscription_items", "by-client", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_items")
        .select("*, subscriptions!inner(*)")
        .eq("subscriptions.client_id", clientId!)
        .is("subscriptions.deleted_at", null)
        .order("position");
      if (error) throw error;
      return (data ?? []) as SubscriptionItemWithSubscription[];
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

/**
 * Result of a subscription_item update. `syncedInvoiceId` is non-null
 * when the change was propagated back into the source invoice line —
 * useful so callers can show a toast confirming the sync.
 */
export interface UpdateSubscriptionItemResult {
  item: SubscriptionItem;
  syncedInvoiceId: string | null;
}

/**
 * Result of a subscription_item update. `syncedInvoiceIds` lists every
 * invoice that picked up the change. With the bidirectional link added
 * in 20260413130000 this can include cron-generated invoices.
 */
export interface UpdateSubscriptionItemSyncedInvoice {
  invoiceId: string;
  invoiceNumber: string;
}

/**
 * Update a subscription_item and mirror the change to every linked
 * invoice_item whose parent invoice is still editable (not soft-deleted,
 * not paid, no active payments). The link is read from
 * `invoice_items.source_subscription_item_id` (populated for both
 * NewInvoice and cron-generated invoices post 20260413130000).
 *
 * Why all linked invoices and not just one: in practice each
 * subscription has 0–1 unpaid invoices at a time, but a user can rack
 * up several un-paid cron invoices. When they fix the price on the
 * subscription, every still-editable invoice should pick up the new
 * price. Paid / partially-paid invoices stay as historical snapshots.
 */
export function useUpdateSubscriptionItem() {
  const qc = useQueryClient();
  return useMutation<UpdateSubscriptionItemResult, Error, { id: string; updates: TablesUpdate<"subscription_items"> }>({
    mutationFn: async ({ id, updates }) => {
      // 1. Apply the update and capture the new row.
      const { data: updatedItem, error } = await supabase
        .from("subscription_items")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      // 2. Find every invoice_item that points back to this sub_item.
      //    The bidirectional column is the canonical link; the legacy
      //    sub_items.source_invoice_item_id is also covered as a
      //    fallback for rows the migration backfill couldn't repair
      //    (very old data, edge cases).
      const candidateInvoiceItemIds = new Set<string>();

      const { data: byForwardLink, error: fwdErr } = await supabase
        .from("invoice_items")
        .select("id")
        .eq("source_subscription_item_id", id);
      if (fwdErr) throw fwdErr;
      for (const r of byForwardLink ?? []) candidateInvoiceItemIds.add(r.id);

      if (updatedItem.source_invoice_item_id) {
        candidateInvoiceItemIds.add(updatedItem.source_invoice_item_id);
      }

      if (candidateInvoiceItemIds.size === 0) {
        return { item: updatedItem as SubscriptionItem, syncedInvoiceId: null };
      }

      // 3. Pull the candidate invoice_items + their parent invoices in
      //    one shot.
      const ids = Array.from(candidateInvoiceItemIds);
      const { data: linkedItems, error: linkErr } = await supabase
        .from("invoice_items")
        .select("id, invoice_id, description, unit_price, quantity")
        .in("id", ids);
      if (linkErr) throw linkErr;
      if (!linkedItems || linkedItems.length === 0) {
        return { item: updatedItem as SubscriptionItem, syncedInvoiceId: null };
      }

      const invoiceIds = Array.from(new Set(linkedItems.map(li => li.invoice_id)));
      const [{ data: parentInvoices, error: invErr }, { data: paymentRows, error: payErr }] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, number, status, deleted_at")
          .in("id", invoiceIds),
        supabase
          .from("payments")
          .select("invoice_id")
          .in("invoice_id", invoiceIds)
          .is("deleted_at", null),
      ]);
      if (invErr) throw invErr;
      if (payErr) throw payErr;

      const invoicesById = new Map((parentInvoices ?? []).map(i => [i.id, i]));
      const paymentsByInvoice = new Set((paymentRows ?? []).map(p => p.invoice_id as string));

      // 4. For every linked item whose parent is still editable,
      //    decide what to patch and apply.
      const syncedInvoiceIds: string[] = [];

      for (const linkedItem of linkedItems) {
        const parent = invoicesById.get(linkedItem.invoice_id);
        const editable =
          parent
          && parent.deleted_at == null
          && parent.status !== "paid"
          && !paymentsByInvoice.has(parent.id);
        if (!editable) continue;

        const patch: TablesUpdate<"invoice_items"> = {};
        if (typeof updates.description === "string" && updates.description !== linkedItem.description) {
          patch.description = updates.description;
        }
        if (updates.amount !== undefined && Number(updates.amount) !== Number(linkedItem.unit_price)) {
          patch.unit_price = Number(updates.amount);
        }
        if (Object.keys(patch).length === 0) continue;

        const { error: applyErr } = await supabase
          .from("invoice_items")
          .update(patch)
          .eq("id", linkedItem.id);
        if (applyErr) throw applyErr;

        await recalcInvoiceStatus(linkedItem.invoice_id);
        syncedInvoiceIds.push(linkedItem.invoice_id);
      }

      // Keep the existing API contract for callers (single id) but
      // pick the first synced invoice. Callers that want the full set
      // can read the broader list once we expose it.
      return {
        item: updatedItem as SubscriptionItem,
        syncedInvoiceId: syncedInvoiceIds[0] ?? null,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription_items"] });
      qc.invalidateQueries({ queryKey: ["subscription_price_history"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
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
      // maybeSingle() so a soft-deleted subscription resolves to null
      // (page falls back to its loading/empty state) instead of throwing.
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*, clients(*)")
        .eq("id", id!)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data as Subscription | null;
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
        .is("deleted_at", null)
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
        .not("subscription_id", "is", null)
        .is("deleted_at", null);
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
