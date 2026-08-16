export type Category = "food" | "drug" | "device" | "consumer";

export const CATEGORY_LABELS: Record<Category, string> = {
  food: "Food",
  drug: "Medicine",
  device: "Medical Devices",
  consumer: "Consumer",
};

export const ENDPOINTS: Record<Exclude<Category, "consumer">, string> = {
  food: "https://api.fda.gov/food/enforcement.json",
  drug: "https://api.fda.gov/drug/enforcement.json",
  device: "https://api.fda.gov/device/enforcement.json",
};

export const SHEETBEST =
  "https://api.sheetbest.com/sheets/a5c4ecd4-7684-48f7-9cd0-8ccf090c0b7a";

export type Recall = {
  product_description?: string;
  reason_for_recall?: string;
  recalling_firm?: string;
  report_date?: string;
  recall_number?: string;
  classification?: string;
  status?: string;
};

export type Severity = "HIGH" | "MEDIUM" | "LOW";

export function getSeverity(reason = ""): Severity {
  const n = reason.toLowerCase();
  if (
    n.includes("listeria") ||
    n.includes("salmonella") ||
    n.includes("death") ||
    n.includes("contamination") ||
    n.includes("serious injury")
  )
    return "HIGH";
  if (
    n.includes("undeclared") ||
    n.includes("allergen") ||
    n.includes("metal") ||
    n.includes("glass") ||
    n.includes("chemical") ||
    n.includes("burn")
  )
    return "MEDIUM";
  return "LOW";
}

export function formatDate(date?: string): string {
  if (!date) return "N/A";
  if (/^\d{8}$/.test(date))
    return `${date.slice(4, 6)}/${date.slice(6, 8)}/${date.slice(0, 4)}`;
  return date;
}

export async function searchRecalls(
  term: string,
  category: Category
): Promise<Recall[]> {
  if (category === "consumer") return [];
  const url = `${ENDPOINTS[category]}?search=${encodeURIComponent(term.trim())}&limit=15`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results as Recall[]) || [];
}

export function getGuidance(reason = ""): string[] {
  const r = reason.toLowerCase();
  if (r.includes("salmonella") || r.includes("listeria") || r.includes("contamination")) {
    return [
      "Do not consume or use this product",
      "Dispose of it or return it to the store",
      "Wash hands and surfaces that touched it",
    ];
  }
  if (r.includes("undeclared") || r.includes("allergen")) {
    return [
      "Avoid if you have allergies or sensitivities",
      "Check the lot number on the package",
      "Return to the store for a refund",
    ];
  }
  return [
    "Review the recall details carefully",
    "Check your package lot or UPC number",
    "Consider returning the product",
  ];
}
