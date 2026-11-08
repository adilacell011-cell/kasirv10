import assert from "node:assert/strict";
import test from "node:test";
import { buildProductSuggestions } from "./product-suggestions";

const products = [
  {
    category: "Aksesoris",
    brand: "Baseus",
    subCategory: "Charger mobil",
  },
  {
    category: "aksesoris",
    brand: "  Anker ",
    subCategory: "Kabel braided",
  },
  {
    category: "Handphone",
    brand: "Samsung",
    subCategory: "Galaxy A15",
  },
  {
    category: "Handphone",
    brand: "iPhone",
    subCategory: "iPhone 15 Pro",
  },
  {
    category: "Voucher",
    brand: "Provider Baru",
  },
];

test("brand suggestions combine defaults with values from the same category", () => {
  assert.deepEqual(
    buildProductSuggestions(
      ["Robot", "Baseus"],
      products,
      "Aksesoris",
      "brand",
    ),
    ["Robot", "Baseus", "Anker"],
  );
});

test("subcategory suggestions for phones are scoped to the selected brand", () => {
  assert.deepEqual(
    buildProductSuggestions(
      ["Galaxy A55"],
      products,
      "Handphone",
      "subCategory",
      "samsung",
    ),
    ["Galaxy A55", "Galaxy A15"],
  );
});

test("provider suggestions include saved custom provider values", () => {
  assert.deepEqual(
    buildProductSuggestions(
      ["Telkomsel"],
      products,
      "Voucher",
      "provider",
    ),
    ["Telkomsel", "Provider Baru"],
  );
});

test("suggestions are case-insensitively deduplicated without changing stored data", () => {
  assert.deepEqual(
    buildProductSuggestions(
      ["Baseus"],
      products,
      "Aksesoris",
      "brand",
    ),
    ["Baseus", "Anker"],
  );
  assert.equal(products[1].brand, "  Anker ");
});

test("products from other categories and brands do not leak into suggestions", () => {
  assert.deepEqual(
    buildProductSuggestions(
      [],
      products,
      "Handphone",
      "subCategory",
      "Xiaomi",
    ),
    [],
  );
});
