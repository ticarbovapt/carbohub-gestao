import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

// SECURITY FIX: Restrict CORS to known origins
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://carbohub.com.br",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");

    const { data: { user: callingUser }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !callingUser) {
      throw new Error("Unauthorized");
    }

    const { requestId, action }: { requestId: string; action: "approve" | "reject" } = await req.json();

    if (!requestId || !action) {
      throw new Error("Missing requestId or action");
    }

    // Get the reset request
    const { data: resetRequest, error: fetchError } = await supabaseAdmin
      .from("password_reset_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (fetchError || !resetRequest) {
      throw new Error("Reset request not found");
    }

    // Verify caller is the manager or admin
    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: callingUser.id });
    const { data: isCeo } = await supabaseAdmin.rpc("is_ceo", { _user_id: callingUser.id });
    const isManagerOfUser = resetRequest.manager_user_id === callingUser.id;

    if (!isAdmin && !isCeo && !isManagerOfUser) {
      throw new Error("Unauthorized: Only the direct manager or admin can resolve reset requests");
    }

    if (action === "reject") {
      await supabaseAdmin
        .from("password_reset_requests")
        .update({
          status: "rejected",
          resolved_at: new Date().toISOString(),
          resolved_by: callingUser.id,
        })
        .eq("id", requestId);

      return new Response(
        JSON.stringify({ success: true, action: "rejected" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Approve: generate new temp password and update user
    const { data: tempPassword } = await supabaseAdmin.rpc("generate_temp_password");
    if (!tempPassword) {
      throw new Error("Failed to generate temporary password");
    }

    // Update the user's password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      resetRequest.user_id,
      { password: tempPassword }
    );

    if (updateError) {
      throw new Error(`Failed to update password: ${updateError.message}`);
    }

    const tempPasswordExpiresAt = new Date();
    tempPasswordExpiresAt.setHours(tempPasswordExpiresAt.getHours() + 24);

    // Update profile
    await supabaseAdmin.from("profiles").update({
      password_must_change: true,
      temp_password_sent_at: new Date().toISOString(),
      temp_password_expires_at: tempPasswordExpiresAt.toISOString(),
    }).eq("id", resetRequest.user_id);

    // Update request
    await supabaseAdmin
      .from("password_reset_requests")
      .update({
        status: "approved",
        resolved_at: new Date().toISOString(),
        resolved_by: callingUser.id,
        new_temp_password_set: true,
      })
      .eq("id", requestId);

    // Log audit
    await supabaseAdmin.from("flow_audit_logs").insert({
      user_id: callingUser.id,
      action_type: "password_reset_approved",
      resource_type: "password_reset_request",
      resource_id: requestId,
      reason: `Password reset approved for user ${resetRequest.user_id}`,
      severity: "info",
      details: { target_user_id: resetRequest.user_id },
    });

    // SECURITY FIX: Never return tempPassword in API response
    // The password is sent via email to the user
    // Send welcome/reset email with temp password
    const { data: userProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, username")
      .eq("id", resetRequest.user_id)
      .single();

    if (userProfile) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(resetRequest.user_id);
      if (userData?.user?.email) {
        await fetch(`${supabaseUrl}/functions/v1/send-welcome-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            email: userData.user.email,
            fullName: userProfile.full_name || "Usuário",
            username: userProfile.username || "",
            tempPassword,
            platformUrl: Deno.env.get("PLATFORM_URL") || "https://carbohub.com.br",
            managerName: "Gestor (reset de senha)",
          }),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        action: "approved",
        message: "Nova senha temporária enviada por e-mail ao usuário.",
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in resolve-password-reset:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
