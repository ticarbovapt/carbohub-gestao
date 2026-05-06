// bling-auto-sync — Triggered by pg_cron (no user JWT required)
// Validates X-Cron-Secret header, then calls bling-sync with entity=all

Deno.serve(async (req: Request): Promise<Response> => {
  // Validate cron secret
  const cronSecret = req.headers.get("X-Cron-Secret");
  const expectedSecret = Deno.env.get("CRON_SECRET");

  if (!cronSecret || !expectedSecret || cronSecret !== expectedSecret) {
    console.warn("[bling-auto-sync] Unauthorized call — invalid or missing X-Cron-Secret");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase configuration" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const source = (body as any).source || "cron";

    console.log(`[bling-auto-sync] Starting full pipeline. Source: ${source}, Time: ${new Date().toISOString()}`);

    // Call bling-sync with entity=all, passing X-Cron-Secret so it skips user JWT validation
    const syncResponse = await fetch(
      `${supabaseUrl}/functions/v1/bling-sync`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "X-Cron-Secret": cronSecret,
        },
        body: JSON.stringify({ entity: "all", source }),
      }
    );

    const syncData = await syncResponse.json();

    if (!syncResponse.ok || !syncData.success) {
      const errMsg = syncData.error || `HTTP ${syncResponse.status}`;
      console.error("[bling-auto-sync] Pipeline failed:", errMsg);
      return new Response(JSON.stringify({ success: false, error: errMsg }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`[bling-auto-sync] Pipeline completed successfully. Source: ${source}`);

    return new Response(JSON.stringify({ success: true, source, data: syncData.data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[bling-auto-sync] Pipeline error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
