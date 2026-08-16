import { supabase } from "./supabase";

export type Category = "food" | "drug" | "device" | "consumer";

export const CATEGORY_LABELS: Record<Category, string> = {
  food:     "Food",
  drug:     "Medicine",
  device:   "Medical Devices",
  consumer: "Consumer",
};

export const ENDPOINTS: Record<Exclude<Category, "consumer">, string> = {
  food:   "https://api.fda.gov/food/enforcement.json",
  drug:   "https://api.fda.gov/drug/enforcement.json",
  device: "https://api.fda.gov/device/enforcement.json",
};

export const SHEETBEST =
  "https://api.sheetbest.com/sheets/a5c4ecd4-7684-48f7-9cd0-8ccf090c0b7a";

export type Severity = "HIGH" | "MEDIUM" | "LOW";

export type Recall = {
  id?: string;
  product_description?: string;
  reason_for_recall?: string;
  recalling_firm?: string;
  report_date?: string;
  recall_number?: string;
  classification?: string;
  status?: string;
  severity?: Severity;
};

export function getSeverity(reason = ""): Severity {
  const n = reason.toLowerCase();
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

export function formatDate(date?: string): string {
  if (!date) return "N/A";
  // YYYYMMDD from FDA API
  if (/^\d{8}$/.test(date))
    return `${date.slice(4, 6)}/${date.slice(6, 8)}/${date.slice(0, 4)}`;
  // YYYY-MM-DD from Supabase DB
  if (/^\d{4}-\d{2}-\d{2}/.test(date))
    return `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}`;
  return date;
}

// FDA YYYYMMDD → PostgreSQL DATE string
function toDbDate(date?: string): string | null {
  if (!date) return null;
  if (/^\d{8}$/.test(date)) return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  return date;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function searchRecalls(term: string, category: Category): Promise<Recall[]> {
  if (category === "consumer") return [];

  // 1. Supabase cache — full-text search on GIN-indexed tsvector
  try {
    const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    const { data: cached, error } = await supabase
      .from("recalls")
      .select("id, product_description, reason_for_recall, recalling_firm, report_date, recall_number, classification, status, severity")
      .eq("category", category)
      .textSearch("search_vector", term, { type: "websearch", config: "english" })
      .gte("last_synced_at", cutoff)
      .order("report_date", { ascending: false })
      .limit(15);

    if (!error && cached && cached.length > 0) {
      logSearch(term, category, cached.length);
      return cached;
    }
  } catch {
    // Supabase unavailable — fall through to FDA API
  }

  // 2. FDA API fallback
  const url = `${ENDPOINTS[category as Exclude<Category, "consumer">]}?search=${encodeURIComponent(term.trim())}&limit=15`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const results: Recall[] = (data.results as Recall[]) || [];

  // 3. Background upsert — populates cache for next search on same term
  upsertRecalls(results, category).catch(() => {});
  logSearch(term, category, results.length).catch(() => {});

  return results;
}

async function upsertRecalls(recalls: Recall[], category: string): Promise<void> {
  const records = recalls
    .filter((r) => r.recall_number)
    .map((r) => ({
      recall_number:       r.recall_number,
      category,
      source:              `fda_${category}`,
      product_description: r.product_description,
      recalling_firm:      r.recalling_firm,
      reason_for_recall:   r.reason_for_recall,
      classification:      r.classification,
      status:              r.status,
      report_date:         toDbDate(r.report_date),
      severity:            getSeverity(r.reason_for_recall || ""),
      raw_fda:             r,
      last_synced_at:      new Date().toISOString(),
    }));

  if (!records.length) return;
  await supabase.from("recalls").upsert(records, { onConflict: "recall_number" });
}

async function logSearch(query: string, category: string, resultCount: number): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;
  await supabase.from("user_searches").insert({
    user_id:      session.user.id,
    query,
    category,
    result_count: resultCount,
  });
}

export function getGuidance(reason = ""): string[] {
  const r = reason.toLowerCase();
  if (r.includes("salmonella") || r.includes("listeria") || r.includes("contamination") || r.includes("e. coli")) {
    return [
      "Do not consume or use this product",
      "Dispose of it or return it to the store",
      "Wash hands and surfaces that contacted it",
    ];
  }
  if (r.includes("undeclared") || r.includes("allergen")) {
    return [
      "Avoid if you have the listed allergy or sensitivity",
      "Check the lot number on your package",
      "Return to the store for a full refund",
    ];
  }
  return [
    "Review the recall details and your product's lot number",
    "Check the FDA website for official guidance",
    "Consider returning the product as a precaution",
  ];
}
