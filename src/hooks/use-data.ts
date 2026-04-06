import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Client = Tables<"clients">;
export type Invoice = Tables<"invoices"> & { invoice_items: InvoiceItem[]; clients?: Client };
export type InvoiceRow = Tables<"invoices">;
export type InvoiceItem = Tables<"invoice_items">;
export type Subscription = Tables<"subscriptions"> & { clients?: Client };
export type Payment = Tables<"payments">;

// Clients
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

// Invoices with items
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

// Subscriptions
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

export function useToggleSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("subscriptions").update({ active }).eq("id", id);
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

// Payments
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
        const [invoiceItemsResult, invoiceResult, invoicePaymentsResult] = await Promise.all([
          supabase.from("invoice_items").select("quantity, unit_price").eq("invoice_id", payment.invoice_id),
          supabase.from("invoices").select("due_date").eq("id", payment.invoice_id).single(),
          supabase.from("payments").select("amount").eq("invoice_id", payment.invoice_id),
        ]);

        if (invoiceItemsResult.error) throw invoiceItemsResult.error;
        if (invoiceResult.error) throw invoiceResult.error;
        if (invoicePaymentsResult.error) throw invoicePaymentsResult.error;

        const invoiceTotal = (invoiceItemsResult.data ?? []).reduce(
          (sum, item) => sum + item.quantity * Number(item.unit_price),
          0,
        );
        const paidTotal = (invoicePaymentsResult.data ?? []).reduce((sum, item) => sum + Number(item.amount), 0);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dueDate = new Date(invoiceResult.data.due_date);
        dueDate.setHours(0, 0, 0, 0);

        const nextStatus: TablesUpdate<"invoices">["status"] =
          invoiceTotal > 0 && paidTotal >= invoiceTotal ? "paid" : dueDate < today ? "overdue" : "pending";

        const { error: updateInvoiceError } = await supabase
          .from("invoices")
          .update({ status: nextStatus })
          .eq("id", payment.invoice_id);

        if (updateInvoiceError) throw updateInvoiceError;
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
