---
name: AlfathPOS product naming
description: How the add-product "name" string is assembled per category and which attributes are NOT real DB columns
---

# Product name assembly (add-product popup)

The Product `name` is the source-of-truth display string, assembled per category by a single
`buildProductName()` helper in `App.tsx`. It joins only non-empty slots so there are never
double spaces or dangling " - ".

Per-category slot order:
- Aksesoris: `Merek - Model - Varian`
- Voucher: `Voucher Provider - Varian`
- Kartu Perdana Kuota / Biasa: `Perdana[ Kuota] Provider - Varian`
- Handphone: `Merek Model - Varian` (uses **brand**, NOT provider — the old code wrongly used the empty provider field, dropping the brand)
- Parfum: `Parfum Merek - Jenis - Aroma - Ukuran`
- Lain-lain / custom category: `[Kategori] - Merek - Nama` (Lain-lain prefix omitted)

**Why this matters / constraint:** Parfum `Jenis` maps to the `subCategory` DB column and `Merek`
to `brand`, but **Aroma and Ukuran (ml) are NOT separate DB columns** — they live only inside the
`name` string. So `startEditing()` recovers them by parsing `name` (size detected via `/\d\s*ml\b/i`
on the last segment). Don't assume a size/aroma column exists.

**How to apply:** Any new category or naming change must go through `buildProductName()` (and its
live preview box in the popup), and editing relies on name segments staying in the documented order.
