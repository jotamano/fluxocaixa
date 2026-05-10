import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// Thin HTTP wrapper around the canonical SQL function
// `public.generate_subscription_invoices()`. Self-host deployments
// schedule that function directly via pg_cron (see migration
// 20260411095000_generate_subscription_invoices_sql.sql) and don't
// need this Edge Function at all. We keep it around so hosted
// Supabase projects can still trigger the same logic on a managed
// cron / from an external scheduler — but the implementation must
// not diverge.
//
// Routing through SQL guarantees that fields like
// service_start_date / service_end_date / source_subscription_item_id
// stay populated regardless of which path runs, and means future
// changes only happen in one place.

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

    const { data, error } = await supabase.rpc("generate_subscription_invoices");
    if (error) throw error;

    const count = typeof data === "number" ? data : 0;

    return new Response(
      JSON.stringify({ message: `Generated ${count} invoices`, count }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
