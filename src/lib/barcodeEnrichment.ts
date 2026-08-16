const OFF_API = "https://world.openfoodfacts.org/api/v2/product";
const FIELDS = "product_name,brands,allergens_tags,image_front_small_url,categories_tags";

export type ProductInfo = {
  name: string;
  brand: string;
  searchTerm: string;  // best term to query recalls with
  imageUrl?: string;
  allergens: string[];
  found: boolean;
};

export async function lookupBarcode(upc: string): Promise<ProductInfo> {
  const fallback: ProductInfo = {
    name: upc, brand: "", searchTerm: upc, allergens: [], found: false,
  };

  try {
    const res = await fetch(`${OFF_API}/${upc}.json?fields=${FIELDS}`, {
      headers: { "User-Agent": "RecallRadar/1.0 (recallradar.app)" },
    });
    if (!res.ok) return fallback;

    const data = await res.json();
    if (data.status !== 1 || !data.product) return fallback;

    const p = data.product;
    const name: string  = p.product_name || "";
    const brand: string = (p.brands || "").split(",")[0].trim();

    // Build the best recall search term: "Brand Name" when available, else just product name
    const searchTerm = brand && name
      ? `${brand} ${name}`
      : brand || name || upc;

    const allergens: string[] = (p.allergens_tags ?? []).map(
      (a: string) => a.replace(/^en:/, "").replace(/-/g, " ")
    );

    return {
      name: name || upc,
      brand,
      searchTerm,
      imageUrl: p.image_front_small_url,
      allergens,
      found: !!name,
    };
  } catch {
    return fallback;
  }
}
