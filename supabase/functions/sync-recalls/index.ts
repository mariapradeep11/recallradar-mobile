// RecallRadar — sync-recalls Edge Function
// Triggered daily via pg_cron (or manually via HTTP POST).
// Pulls the latest FDA enforcement data for food, drug, and device endpoints,
// upserts into the recalls table, then fires alert-matching for new records.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FDA_ENDPOINTS: Record<string, string> = {
  food:   "https://api.fda.gov/food/enforcement.json",
  drug:   "https://api.fda.gov/drug/enforcement.json",
  device: "https://api.fda.gov/device/enforcement.json",
};

function getSeverity(reason: string): "HIGH" | "MEDIUM" | "LOW" {
  const n = (reason || "").toLowerCase();
  if (
    n.includes("listeria") || n.includes("salmonella") || n.includes("death") ||
    n.includes("contamination") || n.includes("serious injury") || n.includes("e. coli")
  ) return "HIGH";
  if (
    n.includes("undeclared") || n.includes("allergen") || n.includes("metal") ||
    n.includes("glass") || n.includes("chemical") || n.includes("burn")
  ) return "MEDIUM";
  return "LOW";
}

// FDA dates come as "YYYYMMDD" strings — convert to ISO for PostgreSQL DATE
function fmtDate(raw?: string): string | null {
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;
  return raw;
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Log sync start
  const { data: logRow } = await supabase
    .from("sync_log")
    .insert({ category: "all", status: "running" })
    .select()
    .single();

  let totalAdded = 0;
  let totalUpdated = 0;

  try {
    // Collect new recall_numbers from this run to run alert matching after
    const newRecallIds: string[] = [];

    for (const [category, endpoint] of Object.entries(FDA_ENDPOINTS)) {
      // Pull last 100 records sorted by most recent report date
      const url = `${endpoint}?limit=100&sort=report_date:desc`;
      const res = await fetch(url, { headers: { "User-Agent": "RecallRadar/1.0" } });
      if (!res.ok) continue;

      const { results } = await res.json().catch(() => ({ results: [] }));
      if (!results?.length) continue;

      for (const r of results) {
        if (!r.recall_number) continue;

        const record = {
          recall_number:          r.recall_number,
          category,
          source:                 `fda_${category}`,
          product_description:    r.product_description,
          recalling_firm:         r.recalling_firm,
          reason_for_recall:      r.reason_for_recall,
          classification:         r.classification,
          status:                 r.status,
          report_date:            fmtDate(r.report_date),
          recall_initiation_date: fmtDate(r.recall_initiation_date),
          affected_states:        r.distribution_pattern,
          distribution_pattern:   r.distribution_pattern,
          quantity_recalled:      r.quantity_recalled,
          code_info:              r.code_info,
          country:                r.country ?? "US",
          raw_fda:                r,
          severity:               getSeverity(r.reason_for_recall || ""),
          last_synced_at:         new Date().toISOString(),
        };

        const { data: upserted, error } = await supabase
          .from("recalls")
          .upsert(record, { onConflict: "recall_number" })
          .select("id, first_seen_at")
          .single();

        if (!error && upserted) {
          // Track IDs of records first seen in this sync run for alert matching
          const ageMs = Date.now() - new Date(upserted.first_seen_at).getTime();
          if (ageMs < 60_000) {
            newRecallIds.push(upserted.id);
            totalAdded++;
          } else {
            totalUpdated++;
          }
        }
      }
    }

    // ── Alert matching ──────────────────────────────────────────────────────
    // For each new recall, find users whose profile matches (category + allergen)
    // and insert into user_alerts.
    if (newRecallIds.length > 0) {
      const { data: newRecalls } = await supabase
        .from("recalls")
        .select("id, category, product_description, reason_for_recall, severity")
        .in("id", newRecallIds);

      const { data: users } = await supabase
        .from("users")
        .select("id, monitored_categories, allergies, alert_threshold, expo_push_token");

      if (newRecalls && users) {
        const alertRows: object[] = [];

        for (const recall of newRecalls) {
          for (const user of users) {
            const categories: string[] = user.monitored_categories ?? [];
            const allergies: string[]  = user.allergies ?? [];
            const threshold: string    = user.alert_threshold ?? "ALL";

            // Skip if this category isn't in user's watch list
            if (!categories.includes(recall.category)) continue;

            // Skip LOW severity if user only wants HIGH
            if (threshold === "HIGH" && recall.severity !== "HIGH") continue;

            // Build reason object — explains why this alert fired
            const matched: Record<string, string> = { category: recall.category };
            const text = `${recall.product_description ?? ""} ${recall.reason_for_recall ?? ""}`.toLowerCase();
            for (const allergen of allergies) {
              if (text.includes(allergen.toLowerCase())) {
                matched.allergen = allergen;
                break;
              }
            }

            alertRows.push({
              user_id:         user.id,
              recall_id:       recall.id,
              matched_reasons: matched,
            });
          }
        }

        if (alertRows.length > 0) {
          await supabase.from("user_alerts").insert(alertRows);
        }
      }
    }

    // ── Recompute brand safety scores ────────────────────────────────────────
    // Simple aggregation — run after each sync to keep scores current.
    await supabase.rpc("refresh_brand_safety_scores").catch(() => {});

    await supabase
      .from("sync_log")
      .update({
        completed_at:    new Date().toISOString(),
        records_added:   totalAdded,
        records_updated: totalUpdated,
        status:          "success",
      })
      .eq("id", logRow?.id);

    return new Response(
      JSON.stringify({ ok: true, added: totalAdded, updated: totalUpdated }),
      { headers: { "Content-Type": "application/json" } },
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await supabase
      .from("sync_log")
      .update({ completed_at: new Date().toISOString(), status: "failed", error: message })
      .eq("id", logRow?.id);

    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
