export type ProductSuggestionField = "brand" | "provider" | "subCategory";

export interface ProductSuggestionSource {
  category?: string | null;
  brand?: string | null;
  provider?: string | null;
  subCategory?: string | null;
}

const normalizeForMatch = (value: string) => value.trim().toLowerCase();

export function buildProductSuggestions(
  defaults: readonly string[],
  products: readonly ProductSuggestionSource[],
  category: string,
  field: ProductSuggestionField,
  brandFilter?: string,
): string[] {
  const normalizedCategory = normalizeForMatch(category);
  const normalizedBrand =
    brandFilter?.trim() ? normalizeForMatch(brandFilter) : null;

  const existingValues = products
    .filter((product) => {
      if (normalizeForMatch(product.category || "") !== normalizedCategory) {
        return false;
      }

      if (normalizedBrand && normalizeForMatch(product.brand || "") !== normalizedBrand) {
        return false;
      }

      return true;
    })
    .map((product) => {
      if (field === "provider") {
        return product.provider || product.brand || "";
      }
      return product[field] || "";
    });

  const seen = new Set<string>();
  const suggestions: string[] = [];

  for (const rawValue of [...defaults, ...existingValues]) {
    const value = rawValue.trim();
    const normalizedValue = normalizeForMatch(value);
    if (!normalizedValue || seen.has(normalizedValue)) continue;

    seen.add(normalizedValue);
    suggestions.push(value);
  }

  return suggestions;
}
