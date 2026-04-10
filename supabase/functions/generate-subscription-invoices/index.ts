import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date().toISOString().split("T")[0];

    const { data: subs, error: subsError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("active", true)
      .lte("next_billing_date", today);

    if (subsError) throw subsError;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ message: "No subscriptions to bill", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let generated = 0;

    for (const sub of subs) {
      const year = new Date().getFullYear();
      const { data: lastInvoices } = await supabase
        .from("invoices")
        .select("number")
        .like("number", `FT ${year}/%`)
        .order("created_at", { ascending: false })
        .limit(1);

      let nextNum = 1;
      if (lastInvoices && lastInvoices.length > 0) {
        const match = lastInvoices[0].number.match(/\/(\d+)$/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
      }
      const invoiceNumber = `FT ${year}/${String(nextNum).padStart(3, "0")}`;

      const billingDate = new Date(sub.next_billing_date);
      const dueDate = new Date(billingDate);
      dueDate.setDate(dueDate.getDate() + 30);

      const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      const monthName = monthNames[billingDate.getMonth()];

      const { data: invoice, error: invError } = await supabase
        .from("invoices")
        .insert({
          number: invoiceNumber,
          client_id: sub.client_id,
          status: "pending",
          issue_date: today,
          due_date: dueDate.toISOString().split("T")[0],
          notes: `Fatura gerada automaticamente da subscrição: ${sub.name}`,
        })
        .select()
        .single();

      if (invError) {
        console.error(`Failed to create invoice for subscription ${sub.id}:`, invError);
        continue;
      }

      await supabase.from("invoice_items").insert({
        invoice_id: invoice.id,
        description: `${sub.name} — ${monthName} ${billingDate.getFullYear()}`,
        quantity: 1,
        unit_price: sub.amount,
        category_id: sub.category_id || null,
      });

      const nextDate = new Date(sub.next_billing_date);
      if (sub.frequency === "monthly") {
        nextDate.setMonth(nextDate.getMonth() + 1);
      } else if (sub.frequency === "quarterly") {
        nextDate.setMonth(nextDate.getMonth() + 3);
      } else if (sub.frequency === "yearly") {
        nextDate.setFullYear(nextDate.getFullYear() + 1);
      }

      await supabase
        .from("subscriptions")
        .update({ next_billing_date: nextDate.toISOString().split("T")[0] })
        .eq("id", sub.id);

      generated++;
    }

    return new Response(
      JSON.stringify({ message: `Generated ${generated} invoices`, count: generated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
