import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://carbohub.com.br",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CheckoutRequest {
  requestId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // ── Authentication ────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Validate JWT using anon client (respects signing keys)
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { requestId }: CheckoutRequest = await req.json();

    if (!requestId) {
      return new Response(
        JSON.stringify({ error: "requestId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Authorization ─────────────────────────────────────────────────────────
    // Check if authenticated user is admin, CEO or gestor
    const [{ data: isAdmin }, { data: isCeo }, { data: isGestor }] = await Promise.all([
      supabase.rpc("is_admin", { _user_id: user.id }),
      supabase.rpc("is_ceo",   { _user_id: user.id }),
      supabase.rpc("is_gestor", { _user_id: user.id }),
    ]);

    const isPrivilegedUser = isAdmin || isCeo || isGestor;
    // ─────────────────────────────────────────────────────────────────────────

    // 1. Fetch the request with related data
    const { data: request, error: requestError } = await supabase
      .from("licensee_requests")
      .select(`
        *,
        service:service_catalog(*),
        licensee:licensees(*)
      `)
      .eq("id", requestId)
      .single();

    if (requestError || !request) {
      console.error("Error fetching request:", requestError);
      return new Response(
        JSON.stringify({ error: "Request not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Per-resource authorization ────────────────────────────────────────────
    // The requester must be: admin/CEO/gestor OR the owner of the licensee request
    if (!isPrivilegedUser && request.created_by !== user.id) {
      // Last chance: check if user belongs to the same licensee
      const { data: licenseeUser } = await supabase
        .from("licensee_users")
        .select("id")
        .eq("user_id", user.id)
        .eq("licensee_id", request.licensee_id)
        .single();

      if (!licenseeUser) {
        return new Response(
          JSON.stringify({ error: "Forbidden: you do not have permission to process this request" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // 2. Get licensee's subscription for SLA calculation
    const { data: subscription } = await supabase
      .from("licensee_subscriptions")
      .select(`
        *,
        plan:subscription_plans(*)
      `)
      .eq("licensee_id", request.licensee_id)
      .single();

    const slaHours = subscription?.plan?.sla_execution_hours || request.service?.default_sla_hours || 48;
    const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();

    // 3. Handle payment - deduct credits if applicable
    if (request.payment_method === "credits" && request.credits_used > 0) {
      const { data: wallet, error: walletError } = await supabase
        .from("licensee_wallets")
        .select("*")
        .eq("licensee_id", request.licensee_id)
        .single();

      if (walletError || !wallet) {
        return new Response(
          JSON.stringify({ error: "Wallet not found" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (wallet.balance < request.credits_used) {
        return new Response(
          JSON.stringify({ error: "Insufficient credits" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Deduct credits
      const newBalance = wallet.balance - request.credits_used;
      await supabase
        .from("licensee_wallets")
        .update({
          balance: newBalance,
          total_spent: wallet.total_spent + request.credits_used,
        })
        .eq("id", wallet.id);

      // Record transaction
      await supabase.from("credit_transactions").insert({
        wallet_id: wallet.id,
        amount: -request.credits_used,
        balance_after: newBalance,
        type: "checkout",
        description: `Solicitação ${request.request_number} - ${request.service?.name || request.operation_type}`,
      });
    }

    // 4. Update subscription usage counters
    if (subscription) {
      const updateData: Record<string, number> = {};
      if (request.operation_type === "carbo_vapt") {
        updateData.vapt_used = (subscription.vapt_used || 0) + 1;
      } else if (request.operation_type === "carbo_ze") {
        updateData.ze_used = (subscription.ze_used || 0) + 1;
      }
      
      if (Object.keys(updateData).length > 0) {
        await supabase
          .from("licensee_subscriptions")
          .update(updateData)
          .eq("id", subscription.id);
      }
    }

    let generatedOsId: string | null = null;
    let generatedOrderId: string | null = null;

    // 5. Generate OS based on operation type
    if (request.operation_type === "carbo_vapt") {
      // Create a Service Order for VAPT
      const { data: newOs, error: osError } = await supabase
        .from("service_orders")
        .insert({
          title: `${request.service?.name || "CarboVAPT"} - ${request.licensee?.name}`,
          description: `Solicitação do portal do licenciado: ${request.request_number}\n\nEndereço: ${request.operation_address || "N/A"}, ${request.operation_city || ""} - ${request.operation_state || ""}\n\nObservações: ${request.notes || "Nenhuma"}`,
          current_department: "venda",
          status: "open",
          created_by: request.created_by,
          due_date: slaDeadline,
          priority: 2,
          metadata: {
            licensee_request_id: request.id,
            licensee_id: request.licensee_id,
            operation_type: request.operation_type,
            payment_method: request.payment_method,
          },
        })
        .select()
        .single();

      if (osError) {
        console.error("Error creating OS:", osError);
        return new Response(
          JSON.stringify({ error: "Failed to create service order" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      generatedOsId = newOs.id;

      // Create initial stage history
      await supabase.from("os_stage_history").insert({
        service_order_id: newOs.id,
        department: "venda",
        status: "in_progress",
        started_at: new Date().toISOString(),
      });

    } else if (request.operation_type === "carbo_ze") {
      // Create a CarboZe Order
      const { data: newOrder, error: orderError } = await supabase
        .from("carboze_orders")
        .insert({
          customer_name: request.licensee?.name || "Licenciado",
          customer_email: request.licensee?.email,
          customer_phone: request.licensee?.phone,
          licensee_id: request.licensee_id,
          delivery_address: request.operation_address,
          delivery_city: request.operation_city,
          delivery_state: request.operation_state,
          delivery_zip: request.operation_zip,
          status: "pending",
          order_type: request.is_recurring ? "recorrente" : "spot",
          is_recurring: request.is_recurring,
          recurrence_interval_days: request.recurrence_interval_days,
          next_delivery_date: request.is_recurring && request.preferred_date
            ? new Date(new Date(request.preferred_date).getTime() + (request.recurrence_interval_days || 30) * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
            : null,
          notes: `Portal do Licenciado: ${request.request_number}\n${request.notes || ""}`,
          items: JSON.stringify([{
            service_id: request.service_id,
            name: request.service?.name || "Insumo CarboZé",
            quantity: 1,
            unit_price: request.service?.base_price || 0,
          }]),
          subtotal: request.service?.base_price || 0,
          total: request.service?.base_price || 0,
          created_by: request.created_by,
        })
        .select()
        .single();

      if (orderError) {
        console.error("Error creating order:", orderError);
        return new Response(
          JSON.stringify({ error: "Failed to create order" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      generatedOrderId = newOrder.id;
    }

    // 6. Update the request with generated OS/Order ID and status
    const updateData: Record<string, unknown> = {
      status: "confirmed",
      sla_deadline: slaDeadline,
    };

    if (generatedOsId) {
      updateData.service_order_id = generatedOsId;
    }
    if (generatedOrderId) {
      updateData.carboze_order_id = generatedOrderId;
    }

    await supabase
      .from("licensee_requests")
      .update(updateData)
      .eq("id", requestId);

    // 7. Create notification for the licensee user
    if (request.created_by) {
      await supabase.from("notifications").insert({
        user_id: request.created_by,
        type: "request_confirmed",
        title: "Solicitação Confirmada",
        body: `Sua solicitação ${request.request_number} foi confirmada e está sendo processada. ${generatedOsId ? "OS gerada automaticamente." : ""}`,
        reference_type: "licensee_request",
        reference_id: requestId,
      });
    }

    console.log(`Checkout processed: ${requestId} -> OS: ${generatedOsId || "N/A"}, Order: ${generatedOrderId || "N/A"}`);

    return new Response(
      JSON.stringify({
        success: true,
        requestId,
        serviceOrderId: generatedOsId,
        carbozeOrderId: generatedOrderId,
        slaDeadline,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Checkout processing error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
