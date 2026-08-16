// @ts-nocheck
// RecallRadar — sync-recalls Edge Function
// Triggered daily via pg_cron (or manually via HTTP POST).
// Syncs FDA food/drug/device, USDA FSIS (meat/poultry/egg), and CPSC (consumer products).
// After sync: runs alert matching for all new records and recomputes brand safety scores.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Source endpoints ──────────────────────────────────────────────────────────

const FDA_ENDPOINTS: Record<string, string> = {
  food:   "https://api.fda.gov/food/enforcement.json",
  drug:   "https://api.fda.gov/drug/enforcement.json",
  device: "https://api.fda.gov/device/enforcement.json",
};

const CPSC_URL = "https://www.saferproducts.gov/RestWebServices/Recall";
const USDA_URL = "https://www.fsis.usda.gov/fsis/api/recall/v/1";

// ── Severity scoring (shared with mobile app) ─────────────────────────────────

function getSeverity(reason: string): "HIGH" | "MEDIUM" | "LOW" {
  const n = (reason || "").toLowerCase();
  if (
    n.includes("listeria") || n.includes("salmonella") || n.includes("e. coli") ||
    n.includes("death") || n.includes("contamination") || n.includes("serious injury") ||
    n.includes("fire hazard") || n.includes("burn hazard") || n.includes("electric shock") ||
    n.includes("drowning") || n.includes("choking hazard") || n.includes("strangulation") ||
    n.includes("carbon monoxide") || n.includes("explosion") || n.includes("entrapment")
  ) return "HIGH";
  if (
    n.includes("undeclared") || n.includes("allergen") || n.includes("metal") ||
    n.includes("glass") || n.includes("chemical") || n.includes("burn") ||
    n.includes("laceration") || n.includes("fall hazard") || n.includes("impact hazard") ||
    n.includes("puncture") || n.includes("ingestion")
  ) return "MEDIUM";
  return "LOW";
}

// ── Date normalisation ────────────────────────────────────────────────────────

function fmtDate(raw?: string): string | null {
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;
  if (raw.includes("T")) return raw.split("T")[0];
  return raw;
}

// ── Record normalisers ────────────────────────────────────────────────────────

function normalizeFda(r: any, category: string): object | null {
  if (!r.recall_number) return null;
  return {
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
}

function normalizeCpsc(r: any): object | null {
  const id = r.RecallID ?? r.RecallNumber;
  if (!id) return null;
  const products   = (r.Products      ?? []).map((p: any) => p.Name).filter(Boolean).join(", ");
  const hazards    = (r.Hazards       ?? []).map((h: any) => h.Name).filter(Boolean).join(", ");
  const firm       = (r.Manufacturers ?? []).map((m: any) => m.Name).filter(Boolean).join(", ");
  const reason     = hazards ? `${hazards}: ${r.Description ?? ""}` : (r.Description ?? "");
  return {
    recall_number:       `CPSC-${id}`,
    category:            "consumer",
    source:              "cpsc",
    product_description: products || r.Title,
    recalling_firm:      firm || "Unknown",
    reason_for_recall:   reason,
    report_date:         fmtDate(r.RecallDate),
    status:              "Ongoing",
    severity:            getSeverity(reason),
    raw_fda:             r,
    last_synced_at:      new Date().toISOString(),
  };
}

function normalizeUsda(r: any): object | null {
  if (!r.recall_number) return null;
  const reason = r.reason ?? "";
  return {
    recall_number:          `USDA-${r.recall_number}`,
    category:               "food",
    source:                 "usda_fsis",
    product_description:    r.products_recalled,
    recalling_firm:         r.establishment,
    reason_for_recall:      reason,
    classification:         r.recall_classification,
    status:                 r.active ? "Ongoing" : "Terminated",
    report_date:            fmtDate(r.press_release_date ?? r.recall_initiation_date),
    recall_initiation_date: fmtDate(r.recall_initiation_date),
    quantity_recalled:      r.quantity_recovered,
    affected_states:        r.states_distribution,
    severity:               getSeverity(reason),
    raw_fda:                r,
    last_synced_at:         new Date().toISOString(),
  };
}

// ── Upsert helper ─────────────────────────────────────────────────────────────

async function upsertBatch(
  supabase: ReturnType<typeof createClient>,
  records: object[],
  counters: { added: number; updated: number },
): Promise<void> {
  for (const record of records) {
    const { data, error } = await supabase
      .from("recalls")
      .upsert(record, { onConflict: "recall_number" })
      .select("id, first_seen_at")
      .single();

    if (!error && data) {
      const ageMs = Date.now() - new Date(data.first_seen_at).getTime();
      ageMs < 60_000 ? counters.added++ : counters.updated++;
    }
  }
}

// ── Edge Function handler ─────────────────────────────────────────────────────

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: logRow } = await supabase
    .from("sync_log")
    .insert({ category: "all", status: "running" })
    .select()
    .single();

  const counters = { added: 0, updated: 0 };
  const newRecallIds: string[] = [];

  try {
    // ── 1. FDA (food / drug / device) ──────────────────────────────────────
    for (const [category, endpoint] of Object.entries(FDA_ENDPOINTS)) {
      const res = await fetch(`${endpoint}?limit=100&sort=report_date:desc`, {
        headers: { "User-Agent": "RecallRadar/1.0" },
      });
      if (!res.ok) continue;
      const { results } = await res.json().catch(() => ({ results: [] }));
      const records = (results ?? []).map((r: any) => normalizeFda(r, category)).filter(Boolean);
      await upsertBatch(supabase, records as object[], counters);
    }

    // ── 2. USDA FSIS (meat, poultry, egg) ──────────────────────────────────
    const usdaRes = await fetch(USDA_URL, { headers: { "User-Agent": "RecallRadar/1.0" } });
    if (usdaRes.ok) {
      const usdaBody = await usdaRes.json().catch(() => null);
      // FSIS API may wrap in { data: [...] } or return array directly
      const usdaResults: any[] = Array.isArray(usdaBody) ? usdaBody : (usdaBody?.data ?? []);
      const records = usdaResults.map(normalizeUsda).filter(Boolean);
      await upsertBatch(supabase, records as object[], counters);
    }

    // ── 3. CPSC (consumer products) ────────────────────────────────────────
    // Pull current year + prior year to ensure good coverage
    const thisYear = new Date().getFullYear();
    for (const year of [thisYear, thisYear - 1]) {
      const cpscRes = await fetch(
        `${CPSC_URL}?format=json&RecallDateBegin=${year}-01-01&RecallDateEnd=${year}-12-31`,
        { headers: { "User-Agent": "RecallRadar/1.0" } },
      );
      if (!cpscRes.ok) continue;
      const cpscData: any[] = await cpscRes.json().catch(() => []);
      const records = cpscData.map(normalizeCpsc).filter(Boolean);
      await upsertBatch(supabase, records as object[], counters);
    }

    // ── 4. Alert matching ───────────────────────────────────────────────────
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
            if (!categories.includes(recall.category)) continue;
            if (threshold === "HIGH" && recall.severity !== "HIGH") continue;

            const matched: Record<string, string> = { category: recall.category };
            const text = `${recall.product_description ?? ""} ${recall.reason_for_recall ?? ""}`.toLowerCase();
            for (const allergen of allergies) {
              if (text.includes(allergen.toLowerCase())) { matched.allergen = allergen; break; }
            }
            alertRows.push({ user_id: user.id, recall_id: recall.id, matched_reasons: matched });
          }
        }
        if (alertRows.length > 0) await supabase.from("user_alerts").insert(alertRows);
      }
    }

    // ── 5. Brand safety scores ──────────────────────────────────────────────
    // Simple aggregation: count recalls + HIGH recalls per firm, derive 0–10 score
    await supabase.rpc("refresh_brand_safety_scores").catch(() => {});

    await supabase.from("sync_log").update({
      completed_at:    new Date().toISOString(),
      records_added:   counters.added,
      records_updated: counters.updated,
      status:          "success",
    }).eq("id", logRow?.id);

    return new Response(
      JSON.stringify({ ok: true, added: counters.added, updated: counters.updated }),
      { headers: { "Content-Type": "application/json" } },
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("sync_log").update({
      completed_at: new Date().toISOString(), status: "failed", error: message,
    }).eq("id", logRow?.id);

    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
