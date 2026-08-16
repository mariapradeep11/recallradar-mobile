import { supabase } from "./supabase";

export type Category = "food" | "drug" | "device" | "consumer";

export const CATEGORY_LABELS: Record<Category, string> = {
  food:     "Food",
  drug:     "Medicine",
  device:   "Medical Devices",
  consumer: "Consumer",
};

export const FDA_ENDPOINTS: Record<Exclude<Category, "consumer">, string> = {
  food:   "https://api.fda.gov/food/enforcement.json",
  drug:   "https://api.fda.gov/drug/enforcement.json",
  device: "https://api.fda.gov/device/enforcement.json",
};

const CPSC_ENDPOINT = "https://www.saferproducts.gov/RestWebServices/Recall";

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
  source?: string;
};

export function getSeverity(reason = ""): Severity {
  const n = reason.toLowerCase();
  // FDA + USDA pathogen / injury language
  if (
    n.includes("listeria") || n.includes("salmonella") || n.includes("e. coli") ||
    n.includes("death") || n.includes("contamination") || n.includes("serious injury") ||
    // CPSC hazard language
    n.includes("fire hazard") || n.includes("burn hazard") || n.includes("electric shock") ||
    n.includes("drowning") || n.includes("choking hazard") || n.includes("strangulation") ||
    n.includes("carbon monoxide") || n.includes("explosion") || n.includes("entrapment")
  ) return "HIGH";
  if (
    n.includes("undeclared") || n.includes("allergen") || n.includes("metal") ||
    n.includes("glass") || n.includes("chemical") || n.includes("burn") ||
    // CPSC injury language
    n.includes("laceration") || n.includes("fall hazard") || n.includes("impact hazard") ||
    n.includes("puncture") || n.includes("ingestion")
  ) return "MEDIUM";
  return "LOW";
}

export function formatDate(date?: string): string {
  if (!date) return "N/A";
  if (/^\d{8}$/.test(date))
    return `${date.slice(4, 6)}/${date.slice(6, 8)}/${date.slice(0, 4)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(date))
    return `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}`;
  return date;
}

function toDbDate(date?: string): string | null {
  if (!date) return null;
  if (/^\d{8}$/.test(date)) return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  if (date.includes("T")) return date.split("T")[0];
  return date;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ── Main search entry point ───────────────────────────────────────────────────

export async function searchRecalls(term: string, category: Category): Promise<Recall[]> {
  // 1. Supabase cache — GIN full-text search, sub-100ms when warm
  try {
    const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    const { data: cached, error } = await supabase
      .from("recalls")
      .select("id, product_description, reason_for_recall, recalling_firm, report_date, recall_number, classification, status, severity, source")
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
    // Supabase unavailable — fall through to live APIs
  }

  // 2. Live API fallback (category-specific)
  const results = category === "consumer"
    ? await fetchCPSC(term)
    : await fetchFDA(term, category);

  upsertRecalls(results, category).catch(() => {});
  logSearch(term, category, results.length).catch(() => {});
  return results;
}

// ── FDA ───────────────────────────────────────────────────────────────────────

async function fetchFDA(term: string, category: Exclude<Category, "consumer">): Promise<Recall[]> {
  const url = `${FDA_ENDPOINTS[category]}?search=${encodeURIComponent(term.trim())}&limit=15`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results as Recall[]) || [];
}

// ── CPSC ──────────────────────────────────────────────────────────────────────

async function fetchCPSC(term: string): Promise<Recall[]> {
  const url = `${CPSC_ENDPOINT}?format=json&keyword=${encodeURIComponent(term.trim())}`;
  const res = await fetch(url, { headers: { "User-Agent": "RecallRadar/1.0" } });
  if (!res.ok) return [];
  const data: any[] = await res.json().catch(() => []);
  return data.slice(0, 15).map(normalizeCpsc).filter(Boolean) as Recall[];
}

function normalizeCpsc(r: any): Recall {
  const products: string = (r.Products ?? []).map((p: any) => p.Name).filter(Boolean).join(", ");
  const hazards: string  = (r.Hazards  ?? []).map((h: any) => h.Name).filter(Boolean).join(", ");
  const firm: string     = (r.Manufacturers ?? []).map((m: any) => m.Name).filter(Boolean).join(", ");
  const reason           = hazards ? `${hazards}: ${r.Description ?? ""}` : (r.Description ?? "");

  return {
    recall_number:       `CPSC-${r.RecallID ?? r.RecallNumber}`,
    product_description: products || r.Title,
    recalling_firm:      firm || "Unknown",
    reason_for_recall:   reason,
    report_date:         r.RecallDate ? r.RecallDate.split("T")[0] : undefined,
    classification:      "CPSC",
    status:              "Ongoing",
    severity:            getSeverity(reason),
    source:              "cpsc",
  };
}

// ── Supabase cache helpers ────────────────────────────────────────────────────

async function upsertRecalls(recalls: Recall[], category: string): Promise<void> {
  const records = recalls
    .filter((r) => r.recall_number)
    .map((r) => ({
      recall_number:       r.recall_number,
      category,
      source:              r.source ?? `fda_${category}`,
      product_description: r.product_description,
      recalling_firm:      r.recalling_firm,
      reason_for_recall:   r.reason_for_recall,
      classification:      r.classification,
      status:              r.status,
      report_date:         toDbDate(r.report_date),
      severity:            r.severity ?? getSeverity(r.reason_for_recall || ""),
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
    user_id: session.user.id, query, category, result_count: resultCount,
  });
}

// ── Guidance ──────────────────────────────────────────────────────────────────

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
  if (r.includes("fire") || r.includes("shock") || r.includes("burn") || r.includes("explosion")) {
    return [
      "Stop using the product immediately",
      "Unplug or disconnect if applicable",
      "Contact the manufacturer for a remedy (refund, repair, or replacement)",
    ];
  }
  if (r.includes("choking") || r.includes("laceration") || r.includes("strangulation")) {
    return [
      "Keep away from children immediately",
      "Stop using the product",
      "Contact the retailer or manufacturer for a refund",
    ];
  }
  return [
    "Review the recall details and your product's lot number",
    "Check the official recall page for guidance",
    "Consider returning the product as a precaution",
  ];
}
