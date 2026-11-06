export const fixtureBranches = [
  { id: "branch-cendana", name: "Cendana" },
  { id: "branch-puspa", name: "Puspa Indah" },
  { id: "branch-meranti", name: "Meranti" },
];

export const fixtureProducts = [
  { id: "product-101", name: "Kabel Data Type-C 1 m", category: "Aksesoris", brand: "Orbit", barcode: "89911000101", description: "Kabel pengisian daya", purchasePrice: 18000, sellingPrice: 25000, discountPrice: 0, minStock: 5, stocks: [12, 3, 7] },
  { id: "product-102", name: "Headset Stereo Basic", category: "Aksesoris", brand: "Nusa", barcode: "89911000102", description: "Headset kabel", purchasePrice: 24000, sellingPrice: 35000, discountPrice: 32000, minStock: 4, stocks: [2, 8, 5] },
  { id: "product-103", name: "Voucher PLN 20.000", category: "Voucher", provider: "PLN", brand: "PLN", barcode: "89911000103", description: "Token listrik prabayar", purchasePrice: 20100, sellingPrice: 22000, discountPrice: 0, minStock: 8, stocks: [14, 5, 9] },
  { id: "product-104", name: "Pulsa 25.000", category: "Pulsa", brand: "Telkomsel", barcode: "89911000104", description: "Pulsa reguler", purchasePrice: 25100, sellingPrice: 27000, discountPrice: 0, minStock: 5, stocks: [20, 17, 11] },
];

export const fixtureSales = [
  { invoice: "INV-DEMO-2401", time: "09:18", branch: "Cendana", items: 2, total: 57000, status: "Selesai" },
  { invoice: "INV-DEMO-2402", time: "10:06", branch: "Cendana", items: 1, total: 32000, status: "Selesai" },
  { invoice: "INV-DEMO-2403", time: "10:42", branch: "Puspa Indah", items: 3, total: 92000, status: "Selesai" },
];

export const fixtureEmployees = [
  { name: "Alya Pratama", role: "KASIR", branch: "Cendana", status: "Aktif" },
  { name: "Raka Wibowo", role: "ADMIN", branch: "Puspa Indah", status: "Aktif" },
  { name: "Nadia Putri", role: "AUDIT", branch: "Meranti", status: "Aktif" },
];

export const fixtureShopping = [
  { name: "Headset Stereo Basic", branch: "Cendana", stock: 2, minimum: 4, status: "Kritis" },
  { name: "Kabel Data Type-C 1 m", branch: "Puspa Indah", stock: 3, minimum: 5, status: "Perlu restok" },
];

export const rupiah = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;
