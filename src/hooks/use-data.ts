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
          // Close the inverse link automatically: when a caller passes
          // `source_subscription_item_id` on an item (e.g. the
          // /subscricoes/nova flow that auto-generates the first
          // invoice from a freshly created subscription), stamp the
          // matching `subscription_items.source_invoice_item_id` so
          // future edits in either direction can resolve the pair via
          // a single column lookup. Without this, the sub→invoice
          // direction of sync silently no-ops because there is no
          // pointer back from the sub_item to the invoice_item.
          const inverseTargets = (insertedItems ?? []).filter(
            ii => (ii as InvoiceItem).source_subscription_item_id,
          );
          if (inverseTargets.length > 0) {
            const inverseUpdates = inverseTargets.map(ii =>
              supabase
                .from("subscription_items")
                .update({ source_invoice_item_id: ii.id })
                .eq("id", (ii as InvoiceItem).source_subscription_item_id!),
            );
            const results = await Promise.all(inverseUpdates);
            const firstErr = results.find(r => r.error)?.error;
            if (firstErr) throw firstErr;
          }
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

/**
 * Returns the lock state of an invoice for the editor:
 *   - "paid" when total > 0 and paid >= total (fully settled).
 *   - "partial" when paid > 0 and paid < total (recibos issued
 *     but balance remains).
 *   - "open" otherwise — fully editable.
 *
 * Both "paid" and "partial" are write-locked: as soon as a single
 * payment is recorded, recibos exist and altering the invoice
 * after the fact is not allowed in PT (correct path = nota de
 * crédito or duplicate-and-reissue). Re-uses the same definition
 * as the UI's `effectiveStatus` so editor and hook agree — no
 * TOCTOU surprises with stale tabs.
 */
async function getInvoiceLockState(
  invoiceId: string,
): Promise<"paid" | "partial" | "open"> {
  const [itemsRes, paymentsRes] = await Promise.all([
    supabase.from("invoice_items").select("quantity, unit_price").eq("invoice_id", invoiceId),
    supabase.from("payments").select("amount").eq("invoice_id", invoiceId).is("deleted_at", null),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
  const total = (itemsRes.data ?? []).reduce(
    (sum, it) => sum + Number(it.quantity) * Number(it.unit_price),
    0,
  );
  const paid = (paymentsRes.data ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  if (total > 0 && paid >= total) return "paid";
  if (paid > 0) return "partial";
  return "open";
}

const PAID_INVOICE_LOCK_MESSAGE =
  "Esta fatura está paga e não pode ser editada (documento fiscal). Para alterações, duplica e emite uma nova.";
const PARTIAL_INVOICE_LOCK_MESSAGE =
  "Esta fatura tem pagamentos registados e não pode ser editada. Para alterações, anula os pagamentos primeiro ou duplica para emitir uma nova.";

async function assertInvoiceEditable(invoiceId: string) {
  const state = await getInvoiceLockState(invoiceId);
  if (state === "paid") throw new Error(PAID_INVOICE_LOCK_MESSAGE);
  if (state === "partial") throw new Error(PARTIAL_INVOICE_LOCK_MESSAGE);
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"invoices"> }) => {
      // Defense in depth: a stale tab might still have the edit
      // dialog open after a payment was recorded in another window.
      // Reject the write rather than silently mutating a fiscal
      // document. Both fully-paid AND partially-paid invoices are
      // locked because both have at least one recibo emitted.
      await assertInvoiceEditable(id);
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
  // Optional service period for this line. ISO date strings (yyyy-mm-dd)
  // or null when the user cleared the field. `undefined` is treated by
  // the persist step as "leave whatever is in the DB alone".
  service_start_date?: string | null;
  service_end_date?: string | null;
  // Optional FK to the service template the line was created from. Same
  // undefined/null/string convention as the link column. Lets the
  // detail-page editor pre-select the matching service on reopen.
  service_id?: string | null;
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
  // Subscriptions that were soft-deleted because the invoice line that
  // spawned them ("Criada desta fatura") was removed in this save.
  // Surfaced so the caller can mention them in the toast and the user
  // knows to look in /lixo if they want to restore.
  cascadedSubscriptionIds: string[];
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
      // Same defense in depth as useUpdateInvoice — invoices with
      // any recorded payment (full or partial) are fiscal documents
      // and must not have their items rewritten.
      await assertInvoiceEditable(invoiceId);

      const result: UpdateInvoiceItemsResult = {
        syncedSubscriptionIds: [],
        spawnedSubscriptionIds: [],
        cascadedSubscriptionIds: [],
      };

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
        // Cascade: when a line that *spawned* a subscription via the
        // "Fatura recorrente" toggle (or its later sibling, the
        // editor's per-line spawn) is removed, the subscription is
        // orphaned — it would keep billing for something that no
        // longer exists on its origin invoice. Soft-delete those subs
        // so they go to /lixo (recoverable).
        //
        // Distinguishing spawned vs manually-linked: a sub created
        // from this invoice has subscriptions.source_invoice_id set
        // to the invoice. Manual links via the picker leave that
        // column NULL, so removing the line just unlinks (clears
        // source_invoice_item_id on the sub_item) without deleting
        // the pre-existing subscription.
        const { data: linkedSubItems, error: linkErr } = await supabase
          .from("subscription_items")
          .select("id, subscription_id, source_invoice_item_id")
          .in("source_invoice_item_id", toDelete);
        if (linkErr) throw linkErr;

        const candidateSubIds = Array.from(
          new Set((linkedSubItems ?? []).map(si => si.subscription_id as string)),
        );
        let spawnedSubIds: string[] = [];
        if (candidateSubIds.length > 0) {
          const { data: candidateSubs, error: subErr } = await supabase
            .from("subscriptions")
            .select("id, source_invoice_id, deleted_at")
            .in("id", candidateSubIds);
          if (subErr) throw subErr;
          spawnedSubIds = (candidateSubs ?? [])
            .filter(s => s.source_invoice_id === invoiceId && !s.deleted_at)
            .map(s => s.id as string);
        }

        // For sub_items whose parent sub is NOT being cascaded
        // (manual link), clear the back-pointer so the FK doesn't
        // dangle once the invoice_item is gone.
        const subItemsToUnlink = (linkedSubItems ?? [])
          .filter(si => !spawnedSubIds.includes(si.subscription_id as string))
          .map(si => si.id as string);
        if (subItemsToUnlink.length > 0) {
          const { error: unlinkErr } = await supabase
            .from("subscription_items")
            .update({ source_invoice_item_id: null })
            .in("id", subItemsToUnlink);
          if (unlinkErr) throw unlinkErr;
        }

        // Drop the invoice_items first. The sub_items' FK is
        // ON DELETE SET NULL, so doing this before the cascade keeps
        // the table consistent even if the cascade fails midway.
        const { error: delError } = await supabase
          .from("invoice_items")
          .delete()
          .in("id", toDelete);
        if (delError) throw delError;

        // Cascade-soft-delete the spawned subscriptions. Reuses the
        // same helper that powers useDeleteSubscription / the
        // checkbox in DeleteInvoiceDialog so behaviour stays
        // consistent (also drags any other unpaid invoices owned by
        // those subs to /lixo).
        if (spawnedSubIds.length > 0) {
          const now = new Date().toISOString();
          for (const subId of spawnedSubIds) {
            await cascadeSoftDeleteSubscription(subId, now);
          }
          result.cascadedSubscriptionIds = spawnedSubIds;
        }
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
            // Same convention for the optional period dates: undefined
            // skips, anything else (including null to clear) gets sent.
            if (u.service_start_date !== undefined) {
              patch.service_start_date = u.service_start_date;
            }
            if (u.service_end_date !== undefined) {
              patch.service_end_date = u.service_end_date;
            }
            if (u.service_id !== undefined) {
              patch.service_id = u.service_id;
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
            // Persist the optional period if the caller provided values;
            // omit otherwise so the DB default (NULL) takes effect.
            ...(i.service_start_date !== undefined
              ? { service_start_date: i.service_start_date }
              : {}),
            ...(i.service_end_date !== undefined
              ? { service_end_date: i.service_end_date }
              : {}),
            ...(i.service_id !== undefined
              ? { service_id: i.service_id }
              : {}),
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

        // The latest service_end_date per subscription, scoped to
        // recurring lines only. Drives the
        // subscription.next_billing_date bump below — setup/addon lines
        // don't anchor the billing cycle so they're skipped on purpose.
        const latestEndBySubId = new Map<string, string>();

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
          const kindByItemId = new Map(
            (subItemRows ?? []).map(si => [si.id, si.kind]),
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

            // Track the most-recent service_end_date among recurring
            // lines so the cycle anchor (next_billing_date) can move in
            // step with the period the user just declared on the invoice.
            if (
              src.service_end_date
              && subId
              && kindByItemId.get(subItemId) === "recurring"
            ) {
              const prev = latestEndBySubId.get(subId);
              if (!prev || src.service_end_date > prev) {
                latestEndBySubId.set(subId, src.service_end_date);
              }
            }
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

        // Recalc subscription.amount = sum of `recurring` items, then
        // (for subs whose recurring line had a new service_end_date)
        // bump next_billing_date = service_end_date + 1 day so the cron
        // picks up the day after the period the user just edited.
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

            const subUpdates: TablesUpdate<"subscriptions"> = {
              amount: recurringTotal,
            };

            const endDate = latestEndBySubId.get(subId);
            if (endDate) {
              // String-only date math against the UTC midnight anchor —
              // matches how Postgres stores `date` columns and avoids
              // the off-by-one drift you'd get from local-tz Date math.
              const anchor = new Date(endDate + "T00:00:00Z");
              anchor.setUTCDate(anchor.getUTCDate() + 1);
              const nextBillingDate = anchor.toISOString().split("T")[0];

              const { data: subRow, error: subFetchErr } = await supabase
                .from("subscriptions")
                .select("next_billing_date")
                .eq("id", subId)
                .single();
              if (subFetchErr) throw subFetchErr;
              if (subRow.next_billing_date !== nextBillingDate) {
                subUpdates.next_billing_date = nextBillingDate;
              }
            }

            const { error: updErr } = await supabase
              .from("subscriptions")
              .update(subUpdates)
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
export interface DeleteInvoiceArgs {
  id: string;
  // Whether to soft-delete the invoice's non-deleted payments alongside
  // the invoice. Default true — keeping payments visible after the
  // parent invoice is gone almost always confuses the user.
  cascadePayments?: boolean;
  // Optional: also soft-delete the source subscription (and its other
  // unpaid invoices, recursively). Off by default; the InvoiceDetail
  // confirm dialog exposes this as an explicit checkbox when
  // invoice.subscription_id is set.
  cascadeSubscription?: boolean;
}

export interface DeleteInvoiceResult {
  cascadedPaymentIds: string[];
  cascadedSubscriptionId: string | null;
  cascadedInvoiceIds: string[]; // includes id; plus any sibling invoices when cascadeSubscription
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation<DeleteInvoiceResult, Error, DeleteInvoiceArgs>({
    mutationFn: async ({ id, cascadePayments = true, cascadeSubscription = false }) => {
      const now = new Date().toISOString();

      // Cascade subscription first: soft-deleting the sub will pull in
      // every other unpaid invoice (and their payments) before we
      // bother with this one's payments. Skip when off.
      let cascadedSubscriptionId: string | null = null;
      const cascadedInvoiceIds: string[] = [id];
      const cascadedPaymentIds: string[] = [];

      if (cascadeSubscription) {
        // Subs to cascade come from BOTH directions:
        //   (a) the sub that generated this invoice (cron child) →
        //       invoices.subscription_id
        //   (b) subs that this invoice itself spawned →
        //       subscriptions.source_invoice_id = id
        const [{ data: invoice, error: invErr }, { data: spawned, error: spErr }] = await Promise.all([
          supabase.from("invoices").select("subscription_id").eq("id", id).single(),
          supabase.from("subscriptions").select("id").eq("source_invoice_id", id).is("deleted_at", null),
        ]);
        if (invErr) throw invErr;
        if (spErr) throw spErr;

        const subIds = new Set<string>();
        if (invoice.subscription_id) subIds.add(invoice.subscription_id as string);
        for (const s of spawned ?? []) subIds.add(s.id as string);

        for (const subId of subIds) {
          // Pass id so the helper doesn't try to re-soft-delete the
          // invoice we're about to soft-delete ourselves below (would
          // double-tag deleted_via_subscription_id and confuse restore).
          const sub = await cascadeSoftDeleteSubscription(subId, now, id);
          cascadedSubscriptionId = sub.subscriptionId;
          cascadedInvoiceIds.push(...sub.invoiceIds.filter(i => i !== id));
          cascadedPaymentIds.push(...sub.paymentIds);
        }
      }

      if (cascadePayments) {
        const { data: pmts, error: pErr } = await supabase
          .from("payments")
          .select("id")
          .eq("invoice_id", id)
          .is("deleted_at", null);
        if (pErr) throw pErr;
        const ids = (pmts ?? []).map(p => p.id as string);
        if (ids.length > 0) {
          const { error: updErr } = await supabase
            .from("payments")
            .update({ deleted_at: now, deleted_via_invoice_id: id })
            .in("id", ids);
          if (updErr) throw updErr;
          cascadedPaymentIds.push(...ids);
        }
      }

      const { error } = await supabase
        .from("invoices")
        .update({ deleted_at: now })
        .eq("id", id);
      if (error) throw error;

      return {
        cascadedPaymentIds,
        cascadedSubscriptionId,
        cascadedInvoiceIds,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });
}

// Helper used by both useDeleteSubscription and useDeleteInvoice (when
// the user checks "also delete the source subscription"). Soft-deletes
// the subscription, every still-editable invoice it owns (effective
// paid check — same as PR #38), and the non-deleted payments on those
// invoices. Returns the ids it touched so the caller can dedupe.
//
// "Owns" includes both directions:
//   (a) cron-generated children — invoices.subscription_id = sub.id
//   (b) the spawning invoice that originally created this sub —
//       subscriptions.source_invoice_id = invoice.id
// We previously only handled (a), which silently dropped the
// spawning invoice on the floor and left it as an orphan referencing a
// deleted sub.
async function cascadeSoftDeleteSubscription(
  subscriptionId: string,
  now: string,
  excludeInvoiceId?: string,
): Promise<{ subscriptionId: string; invoiceIds: string[]; paymentIds: string[] }> {
  // 1. Find candidate invoices: cron-generated children + spawning parent.
  const [{ data: childInvoices, error: invErr }, { data: subRow, error: subRowErr }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id")
      .eq("subscription_id", subscriptionId)
      .is("deleted_at", null),
    supabase
      .from("subscriptions")
      .select("source_invoice_id")
      .eq("id", subscriptionId)
      .single(),
  ]);
  if (invErr) throw invErr;
  if (subRowErr) throw subRowErr;

  const candidateSet = new Set<string>((childInvoices ?? []).map(i => i.id as string));
  if (subRow?.source_invoice_id) {
    // Verify the spawning invoice is still alive before adding it.
    const { data: parentInv, error: parentErr } = await supabase
      .from("invoices")
      .select("id, deleted_at")
      .eq("id", subRow.source_invoice_id)
      .maybeSingle();
    if (parentErr) throw parentErr;
    if (parentInv && !parentInv.deleted_at) candidateSet.add(parentInv.id as string);
  }
  // Drop the caller-excluded invoice (the one being deleted by
  // useDeleteInvoice — its own cascade path will soft-delete it after
  // we return).
  if (excludeInvoiceId) candidateSet.delete(excludeInvoiceId);
  const candidateIds = Array.from(candidateSet);
  const cascadedInvoiceIds: string[] = [];
  const cascadedPaymentIds: string[] = [];

  if (candidateIds.length > 0) {
    // 2. Compute effective paid status using the same definition as
    //    syncSubItemToInvoices and the editor lock (PR #37): total > 0
    //    && paid >= total. Paid invoices are kept (fiscal docs).
    const [{ data: items, error: itErr }, { data: pmts, error: pErr }] = await Promise.all([
      supabase
        .from("invoice_items")
        .select("invoice_id, quantity, unit_price")
        .in("invoice_id", candidateIds),
      supabase
        .from("payments")
        .select("id, invoice_id, amount, deleted_at")
        .in("invoice_id", candidateIds)
        .is("deleted_at", null),
    ]);
    if (itErr) throw itErr;
    if (pErr) throw pErr;

    const totalByInvoice = new Map<string, number>();
    for (const it of items ?? []) {
      totalByInvoice.set(
        it.invoice_id as string,
        (totalByInvoice.get(it.invoice_id as string) ?? 0)
          + Number(it.quantity) * Number(it.unit_price),
      );
    }
    const paidByInvoice = new Map<string, number>();
    const paymentsByInvoice = new Map<string, string[]>();
    for (const p of pmts ?? []) {
      const inv = p.invoice_id as string;
      paidByInvoice.set(inv, (paidByInvoice.get(inv) ?? 0) + Number(p.amount));
      const arr = paymentsByInvoice.get(inv) ?? [];
      arr.push(p.id as string);
      paymentsByInvoice.set(inv, arr);
    }

    const unpaidInvoiceIds = candidateIds.filter(id => {
      const total = totalByInvoice.get(id) ?? 0;
      const paid = paidByInvoice.get(id) ?? 0;
      return !(total > 0 && paid >= total);
    });

    // 3. Cascade payments on those unpaid invoices first.
    const paymentIds = unpaidInvoiceIds
      .flatMap(id => paymentsByInvoice.get(id) ?? []);
    if (paymentIds.length > 0) {
      const { error: pUpdErr } = await supabase
        .from("payments")
        .update({ deleted_at: now })
        .in("id", paymentIds);
      if (pUpdErr) throw pUpdErr;
      cascadedPaymentIds.push(...paymentIds);
    }

    // 4. Then the invoices themselves, tagged so restore can find them.
    //    The spawning invoice (subRow.source_invoice_id) gets the same
    //    deleted_via_subscription_id stamp as cron-generated children,
    //    so useRestoreSubscription brings them all back symmetrically.
    if (unpaidInvoiceIds.length > 0) {
      const { error: invUpdErr } = await supabase
        .from("invoices")
        .update({ deleted_at: now, deleted_via_subscription_id: subscriptionId })
        .in("id", unpaidInvoiceIds);
      if (invUpdErr) throw invUpdErr;
      cascadedInvoiceIds.push(...unpaidInvoiceIds);
    }
  }

  // 5. Finally the subscription header.
  const { error: subErr } = await supabase
    .from("subscriptions")
    .update({ deleted_at: now })
    .eq("id", subscriptionId);
  if (subErr) throw subErr;

  return { subscriptionId, invoiceIds: cascadedInvoiceIds, paymentIds: cascadedPaymentIds };
}

export function useRestoreInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Restore payments that were soft-deleted as part of this
      // invoice's deletion. They get their deleted_via_invoice_id
      // cleared so a future restore round won't double-process them.
      const { data: cascaded, error: pSelErr } = await supabase
        .from("payments")
        .select("id")
        .eq("deleted_via_invoice_id", id)
        .not("deleted_at", "is", null);
      if (pSelErr) throw pSelErr;
      const pIds = (cascaded ?? []).map(p => p.id as string);
      if (pIds.length > 0) {
        const { error: pUpdErr } = await supabase
          .from("payments")
          .update({ deleted_at: null, deleted_via_invoice_id: null })
          .in("id", pIds);
        if (pUpdErr) throw pUpdErr;
      }

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
// /lixo. Cascaded payments (those tagged with deleted_via_invoice_id)
// are hard-deleted too — purging the parent without removing them
// would leave dangling rows in /lixo > Pagamentos that the user can
// neither restore meaningfully (parent is gone) nor easily distinguish
// from manually-deleted payments.
export function usePurgeInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("payments").delete().eq("deleted_via_invoice_id", id);
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

      // Expose inserted sub_items so callers can immediately link
      // them to a freshly-created invoice without an extra round-trip
      // (used by /subscricoes/nova when it auto-issues the first
      // invoice and needs to write `source_subscription_item_id` on
      // each invoice line).
      return {
        ...(data as Subscription),
        sub_items: (insertedSubItems ?? []) as Tables<"subscription_items">[],
      };
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

export interface UpdateSubscriptionResult {
  subscription: Subscription;
  // Invoice IDs whose linked items were actually patched as a result
  // of this edit. Empty when the sub had no linked invoices, when
  // every linked invoice was paid, or when nothing on the recurring
  // line actually changed. Used by the popup editor's toast so it
  // can report a real number instead of a hardcoded confirmation.
  syncedInvoiceIds: string[];
}

export function useUpdateSubscription() {
  const qc = useQueryClient();
  return useMutation<UpdateSubscriptionResult, Error, { id: string; updates: TablesUpdate<"subscriptions"> }>({
    mutationFn: async ({ id, updates }) => {
      // Read the previous subscription so we can detect which fields
      // actually changed and cascade only those. The popup editor in
      // /subscricoes always sends the whole form so a naive diff on
      // updates alone would mis-fire (e.g. "name" is technically
      // present but identical to oldSub.name).
      const { data: oldSub, error: oldErr } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("id", id)
        .single();
      if (oldErr) throw oldErr;

      const { data, error } = await supabase
        .from("subscriptions")
        .update(updates)
        .eq("id", id)
        .select("*, clients(*)")
        .single();
      if (error) throw error;

      // Cascade name/amount edits down to the recurring sub_item and
      // out to every still-editable linked invoice. We only auto-edit
      // when the sub has the canonical shape (1 recurring + optional
      // setup) the popup is designed for; multi-line subscriptions
      // require manual line-level edits via SubscriptionDetail to
      // avoid clobbering the user's custom breakdown.
      const amountChanged =
        updates.amount !== undefined && Number(updates.amount) !== Number(oldSub.amount);
      const nameChanged =
        typeof updates.name === "string" && updates.name !== oldSub.name;
      const nextBillingChanged =
        typeof updates.next_billing_date === "string"
        && updates.next_billing_date !== oldSub.next_billing_date;

      const allSyncedInvoiceIds: string[] = [];

      if (amountChanged || nameChanged) {
        const { data: subItems, error: siErr } = await supabase
          .from("subscription_items")
          .select("*")
          .eq("subscription_id", id);
        if (siErr) throw siErr;

        const recurringItems = (subItems ?? []).filter(si => si.kind === "recurring");

        // Recurring line: cascade amount + (rename only if seed-untouched).
        if (recurringItems.length === 1) {
          const recurringItem = recurringItems[0];
          const itemUpdates: TablesUpdate<"subscription_items"> = {};
          if (amountChanged) itemUpdates.amount = Number(updates.amount);
          // Skip the rename if the user already customized the line
          // description in SubscriptionDetail — explicit edits there
          // win over the popup's lighter "name" field.
          if (nameChanged && recurringItem.description === oldSub.name) {
            itemUpdates.description = updates.name as string;
          }

          if (Object.keys(itemUpdates).length > 0) {
            const { data: updatedItem, error: itemErr } = await supabase
              .from("subscription_items")
              .update(itemUpdates)
              .eq("id", recurringItem.id)
              .select()
              .single();
            if (itemErr) throw itemErr;

            const syncedIds = await syncSubItemToInvoices({
              subItemId: updatedItem.id,
              fallbackInvoiceItemId:
                updatedItem.source_invoice_item_id ?? recurringItem.source_invoice_item_id ?? null,
              oldDescription: recurringItem.description,
              newDescription: updatedItem.description,
              oldAmount: Number(recurringItem.amount),
              newAmount: Number(updatedItem.amount),
            });
            allSyncedInvoiceIds.push(...syncedIds);
          }
        }

        // Setup line: rename "Setup {oldName}" → "Setup {newName}" so
        // the linked invoice_item flips with prefix-replace too.
        if (nameChanged) {
          const oldSetupDesc = `Setup ${oldSub.name}`;
          const newSetupDesc = `Setup ${updates.name}`;
          const setupItems = (subItems ?? []).filter(
            si => si.kind === "setup" && si.description === oldSetupDesc,
          );

          for (const setupItem of setupItems) {
            const { data: updatedSetup, error: setupErr } = await supabase
              .from("subscription_items")
              .update({ description: newSetupDesc })
              .eq("id", setupItem.id)
              .select()
              .single();
            if (setupErr) throw setupErr;

            const syncedIds = await syncSubItemToInvoices({
              subItemId: updatedSetup.id,
              fallbackInvoiceItemId:
                updatedSetup.source_invoice_item_id ?? setupItem.source_invoice_item_id ?? null,
              oldDescription: setupItem.description,
              newDescription: updatedSetup.description,
              oldAmount: Number(setupItem.amount),
              newAmount: Number(setupItem.amount),
            });
            allSyncedInvoiceIds.push(...syncedIds);
          }
        }
      }

      // Cascade next_billing_date edits to the still-editable invoice
      // lines linked to this subscription's recurring sub_items. The
      // service period on those lines moves to end the day before the
      // new cycle anchor, mirroring the rule applied in the inverse
      // direction by useUpdateInvoiceItems.
      if (nextBillingChanged) {
        const syncedIds = await syncNextBillingDateToInvoices({
          subscriptionId: id,
          newNextBillingDate: updates.next_billing_date as string,
        });
        allSyncedInvoiceIds.push(...syncedIds);
      }

      // Same invoice can show up via both recurring and setup paths;
      // dedupe so the toast count reflects unique invoices touched.
      const uniqueSyncedInvoiceIds = Array.from(new Set(allSyncedInvoiceIds));

      return {
        subscription: data as Subscription,
        syncedInvoiceIds: uniqueSyncedInvoiceIds,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["subscription_items"] });
      qc.invalidateQueries({ queryKey: ["subscription_price_history"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export interface DeleteSubscriptionResult {
  subscriptionId: string;
  cascadedInvoiceIds: string[]; // unpaid invoices that were soft-deleted
  cascadedPaymentIds: string[]; // payments on those invoices that were soft-deleted
}

export function useDeleteSubscription() {
  const qc = useQueryClient();
  return useMutation<DeleteSubscriptionResult, Error, string>({
    mutationFn: async (id: string) => {
      const now = new Date().toISOString();
      const { invoiceIds, paymentIds } = await cascadeSoftDeleteSubscription(id, now);
      return { subscriptionId: id, cascadedInvoiceIds: invoiceIds, cascadedPaymentIds: paymentIds };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

export function useRestoreSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Symmetric to useRestoreInvoice: restore the invoices that were
      // pulled in by this subscription's deletion AND the payments
      // tagged via those invoices. Restoring just the sub leaves the
      // user hunting through /lixo, which defeats the purpose of the
      // cascade.
      const { data: cascadedInvoices, error: iSelErr } = await supabase
        .from("invoices")
        .select("id")
        .eq("deleted_via_subscription_id", id)
        .not("deleted_at", "is", null);
      if (iSelErr) throw iSelErr;
      const invIds = (cascadedInvoices ?? []).map(i => i.id as string);

      if (invIds.length > 0) {
        // Restore payments tagged with any of those invoice ids first
        // (cleaner ordering: payments depend on invoices conceptually).
        const { data: cascadedPmts, error: pSelErr } = await supabase
          .from("payments")
          .select("id")
          .in("deleted_via_invoice_id", invIds)
          .not("deleted_at", "is", null);
        if (pSelErr) throw pSelErr;
        const pIds = (cascadedPmts ?? []).map(p => p.id as string);
        if (pIds.length > 0) {
          const { error: pUpdErr } = await supabase
            .from("payments")
            .update({ deleted_at: null, deleted_via_invoice_id: null })
            .in("id", pIds);
          if (pUpdErr) throw pUpdErr;
        }

        const { error: iUpdErr } = await supabase
          .from("invoices")
          .update({ deleted_at: null, deleted_via_subscription_id: null })
          .in("id", invIds);
        if (iUpdErr) throw iUpdErr;
      }

      const { error } = await supabase
        .from("subscriptions")
        .update({ deleted_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

export function usePurgeSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Hard-purge the subscription: drop any cascaded invoices (and
      // their cascaded payments) that were tied to this sub. Without
      // this they'd be left as orphans in /lixo with a dangling
      // deleted_via_subscription_id pointing at nothing.
      const { data: cascadedInvoices, error: iSelErr } = await supabase
        .from("invoices")
        .select("id")
        .eq("deleted_via_subscription_id", id);
      if (iSelErr) throw iSelErr;
      const invIds = (cascadedInvoices ?? []).map(i => i.id as string);

      if (invIds.length > 0) {
        await supabase.from("payments").delete().in("deleted_via_invoice_id", invIds);
        await supabase.from("invoice_items").delete().in("invoice_id", invIds);
        await supabase.from("payments").update({ invoice_id: null }).in("invoice_id", invIds);
        await supabase.from("invoices").delete().in("id", invIds);
      }

      const { error } = await supabase.from("subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

// Read-only helper for the invoice delete confirm dialog: returns
// counts so the warning can show real numbers.
//
// `hasSubscription` is true when the invoice has ANY subscription
// link — either as a cron-generated child (invoices.subscription_id)
// or as the spawning parent of one or more subs
// (subscriptions.source_invoice_id = id). The dialog uses this to
// decide whether to show the "também eliminar a subscrição associada"
// checkbox.
export function useInvoiceCascadePreview(invoiceId: string | null) {
  return useQuery({
    queryKey: ["invoice_cascade_preview", invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const [{ data: invoice, error: invErr }, { data: pmts, error: pErr }, { data: spawned, error: spErr }] = await Promise.all([
        supabase.from("invoices").select("subscription_id").eq("id", invoiceId!).single(),
        supabase.from("payments").select("id").eq("invoice_id", invoiceId!).is("deleted_at", null),
        supabase.from("subscriptions").select("id").eq("source_invoice_id", invoiceId!).is("deleted_at", null),
      ]);
      if (invErr) throw invErr;
      if (pErr) throw pErr;
      if (spErr) throw spErr;

      const parentSubscriptionId = (invoice.subscription_id as string | null) ?? null;
      const spawnedSubscriptionIds = (spawned ?? []).map(s => s.id as string);
      return {
        payments: (pmts ?? []).length,
        subscriptionId: parentSubscriptionId,
        spawnedSubscriptionIds,
        hasSubscription: !!parentSubscriptionId || spawnedSubscriptionIds.length > 0,
      };
    },
  });
}

// Read-only helper for the delete confirm dialog: returns the counts
// the user is about to cascade so the warning can show real numbers.
//
// Mirrors cascadeSoftDeleteSubscription's logic: includes both
// cron-generated children (invoices.subscription_id) AND the spawning
// invoice (subscriptions.source_invoice_id) in the preview, so the
// dialog can't promise something the cascade won't do.
export function useSubscriptionCascadePreview(subscriptionId: string | null) {
  return useQuery({
    queryKey: ["subscription_cascade_preview", subscriptionId],
    enabled: !!subscriptionId,
    queryFn: async () => {
      const [{ data: invoices, error: invErr }, { data: subRow, error: subErr }] = await Promise.all([
        supabase
          .from("invoices")
          .select("id")
          .eq("subscription_id", subscriptionId!)
          .is("deleted_at", null),
        supabase
          .from("subscriptions")
          .select("source_invoice_id")
          .eq("id", subscriptionId!)
          .single(),
      ]);
      if (invErr) throw invErr;
      if (subErr) throw subErr;

      const idSet = new Set<string>((invoices ?? []).map(i => i.id as string));
      if (subRow?.source_invoice_id) {
        const { data: parentInv, error: parentErr } = await supabase
          .from("invoices")
          .select("id, deleted_at")
          .eq("id", subRow.source_invoice_id)
          .maybeSingle();
        if (parentErr) throw parentErr;
        if (parentInv && !parentInv.deleted_at) idSet.add(parentInv.id as string);
      }
      const ids = Array.from(idSet);
      if (ids.length === 0) {
        return { unpaidInvoices: 0, paidInvoices: 0, payments: 0 };
      }

      const [{ data: items, error: itErr }, { data: pmts, error: pErr }] = await Promise.all([
        supabase.from("invoice_items").select("invoice_id, quantity, unit_price").in("invoice_id", ids),
        supabase.from("payments").select("invoice_id, amount").in("invoice_id", ids).is("deleted_at", null),
      ]);
      if (itErr) throw itErr;
      if (pErr) throw pErr;

      const totalByInvoice = new Map<string, number>();
      for (const it of items ?? []) {
        totalByInvoice.set(
          it.invoice_id as string,
          (totalByInvoice.get(it.invoice_id as string) ?? 0)
            + Number(it.quantity) * Number(it.unit_price),
        );
      }
      const paidByInvoice = new Map<string, number>();
      const paymentsCountByInvoice = new Map<string, number>();
      for (const p of pmts ?? []) {
        const inv = p.invoice_id as string;
        paidByInvoice.set(inv, (paidByInvoice.get(inv) ?? 0) + Number(p.amount));
        paymentsCountByInvoice.set(inv, (paymentsCountByInvoice.get(inv) ?? 0) + 1);
      }

      let unpaidInvoices = 0;
      let paidInvoices = 0;
      let payments = 0;
      for (const id of ids) {
        const total = totalByInvoice.get(id) ?? 0;
        const paid = paidByInvoice.get(id) ?? 0;
        const isPaid = total > 0 && paid >= total;
        if (isPaid) {
          paidInvoices++;
        } else {
          unpaidInvoices++;
          payments += paymentsCountByInvoice.get(id) ?? 0;
        }
      }

      return { unpaidInvoices, paidInvoices, payments };
    },
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

/**
 * Propagate a subscription_item change to every linked invoice_item
 * whose parent invoice is still editable (not soft-deleted, not paid,
 * no active payments). Returns the set of invoice IDs that were
 * actually patched.
 *
 * Description sync uses **prefix-replace** so the appended period
 * suffix on cron / NewInvoice items survives a rename: if a linked
 * invoice_item description starts with the OLD sub_item description,
 * only that prefix is replaced. Invoice lines that have been hand-
 * edited away from the prefix are left alone — explicit customization
 * wins over the cascade.
 *
 * Both editors that mutate sub_items (the SubscriptionDetail page and
 * the Subscriptions popup) funnel through this function so behaviour
 * stays consistent across surfaces.
 */
async function syncSubItemToInvoices(opts: {
  subItemId: string;
  fallbackInvoiceItemId: string | null;
  oldDescription: string;
  newDescription: string;
  oldAmount: number;
  newAmount: number;
}): Promise<string[]> {
  const candidateInvoiceItemIds = new Set<string>();

  const { data: byForwardLink, error: fwdErr } = await supabase
    .from("invoice_items")
    .select("id")
    .eq("source_subscription_item_id", opts.subItemId);
  if (fwdErr) throw fwdErr;
  for (const r of byForwardLink ?? []) candidateInvoiceItemIds.add(r.id);

  if (opts.fallbackInvoiceItemId) {
    candidateInvoiceItemIds.add(opts.fallbackInvoiceItemId);
  }

  if (candidateInvoiceItemIds.size === 0) return [];

  const ids = Array.from(candidateInvoiceItemIds);
  const { data: linkedItems, error: linkErr } = await supabase
    .from("invoice_items")
    .select("id, invoice_id, description, unit_price, quantity")
    .in("id", ids);
  if (linkErr) throw linkErr;
  if (!linkedItems || linkedItems.length === 0) return [];

  const invoiceIds = Array.from(new Set(linkedItems.map(li => li.invoice_id)));
  // Drive the "is this invoice paid?" check off the same data the
  // manual editor uses (PR #37): compare cumulative paid amount
  // against item-derived total. Relying on `invoices.status` alone
  // would let stale rows through (e.g. payment registered but the
  // status update never landed) and skipping any invoice with a
  // payment row would over-block partially-paid invoices that the
  // user explicitly asked to keep editable.
  const [
    { data: parentInvoices, error: invErr },
    { data: allItems, error: itemsErr },
    { data: allPayments, error: payErr },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, deleted_at")
      .in("id", invoiceIds),
    supabase
      .from("invoice_items")
      .select("invoice_id, quantity, unit_price")
      .in("invoice_id", invoiceIds),
    supabase
      .from("payments")
      .select("invoice_id, amount")
      .in("invoice_id", invoiceIds)
      .is("deleted_at", null),
  ]);
  if (invErr) throw invErr;
  if (itemsErr) throw itemsErr;
  if (payErr) throw payErr;

  const invoicesById = new Map((parentInvoices ?? []).map(i => [i.id, i]));
  const totalByInvoice = new Map<string, number>();
  for (const it of allItems ?? []) {
    totalByInvoice.set(
      it.invoice_id,
      (totalByInvoice.get(it.invoice_id) ?? 0) + Number(it.quantity) * Number(it.unit_price),
    );
  }
  const paidByInvoice = new Map<string, number>();
  for (const p of allPayments ?? []) {
    paidByInvoice.set(
      p.invoice_id as string,
      (paidByInvoice.get(p.invoice_id as string) ?? 0) + Number(p.amount),
    );
  }
  const isInvoiceFullyPaid = (invoiceId: string) => {
    const total = totalByInvoice.get(invoiceId) ?? 0;
    const paid = paidByInvoice.get(invoiceId) ?? 0;
    return total > 0 && paid >= total;
  };

  const descriptionChanged = opts.newDescription !== opts.oldDescription;
  const amountChanged = Number(opts.newAmount) !== Number(opts.oldAmount);
  const syncedInvoiceIds: string[] = [];

  for (const linkedItem of linkedItems) {
    const parent = invoicesById.get(linkedItem.invoice_id);
    const editable =
      parent
      && parent.deleted_at == null
      && !isInvoiceFullyPaid(parent.id);
    if (!editable) continue;

    const patch: TablesUpdate<"invoice_items"> = {};

    if (amountChanged && Number(linkedItem.unit_price) !== Number(opts.newAmount)) {
      patch.unit_price = Number(opts.newAmount);
    }

    if (descriptionChanged && linkedItem.description.startsWith(opts.oldDescription)) {
      const suffix = linkedItem.description.slice(opts.oldDescription.length);
      const next = opts.newDescription + suffix;
      if (next !== linkedItem.description) {
        patch.description = next;
      }
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

  return syncedInvoiceIds;
}

/**
 * Cascade a subscription's new `next_billing_date` to the service
 * period of every still-editable invoice line linked to one of its
 * recurring sub_items. We rewrite `service_end_date` to
 * `next_billing_date - 1 day` so the invoice's covered period ends
 * on the day before the cycle anchor — the inverse of the rule
 * applied by `useUpdateInvoiceItems` when the user edits the period
 * on the invoice side.
 *
 * Setup/addon lines are skipped because they don't anchor the cycle
 * (the cron only advances `next_billing_date` per recurring item),
 * and paid/soft-deleted invoices are skipped to keep fiscal records
 * frozen — same editability check used by `syncSubItemToInvoices`.
 */
async function syncNextBillingDateToInvoices(opts: {
  subscriptionId: string;
  newNextBillingDate: string;
}): Promise<string[]> {
  const { data: recurringSubItems, error: siErr } = await supabase
    .from("subscription_items")
    .select("id")
    .eq("subscription_id", opts.subscriptionId)
    .eq("kind", "recurring");
  if (siErr) throw siErr;
  const recurringIds = (recurringSubItems ?? []).map(si => si.id);
  if (recurringIds.length === 0) return [];

  const { data: linkedItems, error: liErr } = await supabase
    .from("invoice_items")
    .select("id, invoice_id, service_end_date")
    .in("source_subscription_item_id", recurringIds);
  if (liErr) throw liErr;
  if (!linkedItems || linkedItems.length === 0) return [];

  const invoiceIds = Array.from(new Set(linkedItems.map(li => li.invoice_id as string)));

  // Editability check mirrors syncSubItemToInvoices: drive "is this
  // invoice paid?" off the same item-derived total + payment sum that
  // the manual editor uses, instead of trusting `invoices.status`.
  const [
    { data: parentInvoices, error: invErr },
    { data: allItems, error: itemsErr },
    { data: allPayments, error: payErr },
  ] = await Promise.all([
    supabase.from("invoices").select("id, deleted_at").in("id", invoiceIds),
    supabase
      .from("invoice_items")
      .select("invoice_id, quantity, unit_price")
      .in("invoice_id", invoiceIds),
    supabase
      .from("payments")
      .select("invoice_id, amount")
      .in("invoice_id", invoiceIds)
      .is("deleted_at", null),
  ]);
  if (invErr) throw invErr;
  if (itemsErr) throw itemsErr;
  if (payErr) throw payErr;

  const invoicesById = new Map((parentInvoices ?? []).map(i => [i.id, i]));
  const totalByInvoice = new Map<string, number>();
  for (const it of allItems ?? []) {
    totalByInvoice.set(
      it.invoice_id,
      (totalByInvoice.get(it.invoice_id) ?? 0) + Number(it.quantity) * Number(it.unit_price),
    );
  }
  const paidByInvoice = new Map<string, number>();
  for (const p of allPayments ?? []) {
    paidByInvoice.set(
      p.invoice_id as string,
      (paidByInvoice.get(p.invoice_id as string) ?? 0) + Number(p.amount),
    );
  }
  const isInvoiceFullyPaid = (invoiceId: string) => {
    const total = totalByInvoice.get(invoiceId) ?? 0;
    const paid = paidByInvoice.get(invoiceId) ?? 0;
    return total > 0 && paid >= total;
  };

  // String-only date math against the UTC midnight anchor — matches
  // how Postgres stores `date` columns and avoids local-tz drift.
  const anchor = new Date(opts.newNextBillingDate + "T00:00:00Z");
  anchor.setUTCDate(anchor.getUTCDate() - 1);
  const newEnd = anchor.toISOString().split("T")[0];

  const syncedInvoiceIds = new Set<string>();
  for (const li of linkedItems) {
    const parent = invoicesById.get(li.invoice_id as string);
    if (!parent || parent.deleted_at) continue;
    if (isInvoiceFullyPaid(parent.id as string)) continue;
    if (li.service_end_date === newEnd) continue;

    const { error: updErr } = await supabase
      .from("invoice_items")
      .update({ service_end_date: newEnd })
      .eq("id", li.id);
    if (updErr) throw updErr;
    syncedInvoiceIds.add(li.invoice_id as string);
  }

  return Array.from(syncedInvoiceIds);
}

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
      // 1. Read the row BEFORE applying changes so we can do a
      //    prefix-replace on linked invoice descriptions (preserves
      //    the appended " — Mês Ano" period suffix on each
      //    cron-issued line). Without this snapshot we'd have to do
      //    a full overwrite and lose every per-line customization.
      const { data: oldItem, error: oldErr } = await supabase
        .from("subscription_items")
        .select("*")
        .eq("id", id)
        .single();
      if (oldErr) throw oldErr;

      // 2. Apply the update and capture the new row.
      const { data: updatedItem, error } = await supabase
        .from("subscription_items")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      // 3. Cascade to every linked invoice_item via the shared
      //    helper. The helper handles both directions of the
      //    link (forward via source_subscription_item_id and the
      //    legacy fallback via sub_item.source_invoice_item_id).
      const syncedInvoiceIds = await syncSubItemToInvoices({
        subItemId: updatedItem.id,
        fallbackInvoiceItemId:
          updatedItem.source_invoice_item_id ?? oldItem.source_invoice_item_id ?? null,
        oldDescription: oldItem.description,
        newDescription: updatedItem.description,
        oldAmount: Number(oldItem.amount),
        newAmount: Number(updatedItem.amount),
      });

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
        // Carry the optional service period and service template across
        // so the duplicate arrives ready to send: typical use case is
        // "same scope of work, new month".
        const cloned = items.map((it) => ({
          invoice_id: created.id,
          description: it.description,
          quantity: it.quantity,
          unit_price: it.unit_price,
          position: it.position,
          service_start_date: it.service_start_date,
          service_end_date: it.service_end_date,
          service_id: it.service_id,
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

// ─── IVA cross-sync ───

// Propagates an IVA toggle/percentage edit across:
//   1. the client (always),
//   2. all of the client's non-deleted subscriptions,
//   3. every still-editable invoice for the client (i.e. not paid /
//      partially_paid AND with no payment rows attached).
//
// Implemented as a Postgres function so the cascade is one round-trip
// and can never be observed half-applied. Callers pass the *source*
// of the edit so we can resolve the client from any of the three
// entry points (client edit form, subscription edit popup, invoice
// edit dialog). See migration 20260508130000_iva_sync_and_history.sql.
export interface SyncIvaInput {
  source: "client" | "subscription" | "invoice";
  sourceId: string;
  hasIva: boolean;
  ivaPercentage: number;
}

export function useSyncIva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ source, sourceId, hasIva, ivaPercentage }: SyncIvaInput) => {
      const { error } = await supabase.rpc("sync_iva", {
        p_source: source,
        p_source_id: sourceId,
        p_has_iva: hasIva,
        p_iva_percentage: hasIva ? ivaPercentage : 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // The RPC may have touched all three tables; refresh everything
      // that renders an IVA badge or recomputes a total with IVA.
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });
}

// ─── Edit history (audit_log) for a single invoice ───

export interface InvoiceHistoryRow {
  id: number;
  occurred_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  table_name: string;
  row_id: string | null;
  before_data: unknown;
  after_data: unknown;
}

export function useInvoiceHistory(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["invoice_history", invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("invoice_history", {
        p_invoice_id: invoiceId!,
      });
      if (error) throw error;
      return (data ?? []) as InvoiceHistoryRow[];
    },
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
