import React from "react";
import { Settings, Wifi, Smartphone } from "lucide-react";

export const ProductTable = ({
  products,
  searchTerm,
  CATEGORIES,
  startEditing,
}: {
  products: any[];
  searchTerm: string;
  CATEGORIES: string[];
  startEditing: (p: any) => void;
}) => {
  return (
    <tbody className="divide-y divide-slate-100 text-sm">
      {CATEGORIES.map((category) => {
        const catProducts = products.filter((p) => {
          if (!p) return false;
          const searchMatch =
            (p.name || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
            (p.barcode || "").includes(searchTerm);
          if (!searchMatch) return false;
          return (p.category || "LAINNYA") === category;
        });
        if (catProducts.length === 0) return null;
        const brandsInCategory = Array.from(new Set(catProducts.map((p) => {
          if (p.category === "Voucher" || p.category?.includes("Perdana")) return p.provider || p.brand || category;
          return p.brand || p.subCategory || category;
        })));
        return (
          <React.Fragment key={category}>
            <tr className="bg-blue-50/50 text-blue-900">
              <td colSpan={5} className="border-b-2 border-blue-200 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] sm:px-4 sm:text-[11px]">{category}</td>
            </tr>
            {brandsInCategory.map((brand) => {
              const group = catProducts.filter((p) => {
                const pBrand = p.category === "Voucher" || p.category?.includes("Perdana")
                  ? p.provider || p.brand || category
                  : p.brand || p.subCategory || category;
                return pBrand === brand;
              }).sort((a, b) => {
                const priceA = a.discountPrice > 0 ? a.discountPrice : a.sellingPrice;
                const priceB = b.discountPrice > 0 ? b.discountPrice : b.sellingPrice;
                return priceA - priceB;
              });
              return (
                <React.Fragment key={`${category}-${brand}`}>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <td colSpan={5} className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">{brand}</td>
                  </tr>
                  {group.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-blue-50/50">
                      <td data-label="Item Master" data-card-title="" className="min-w-[220px] px-3 py-2.5 sm:px-4 sm:py-3">
                        <p className="font-bold leading-snug text-slate-800">{(() => {
                          const provider = p.provider || p.brand || "";
                          let displayName = p.name;
                          if (p.category === "Voucher" || p.category?.includes("Perdana")) {
                            if (displayName.toLowerCase().startsWith("voucher")) displayName = displayName.replace(/voucher/i, provider || "Voucher").trim();
                            else if (provider && !displayName.toLowerCase().includes(provider.toLowerCase())) displayName = `${provider} ${displayName}`.trim();
                          }
                          return displayName;
                        })()}</p>
                        <div className="mt-0.5 flex items-center gap-2"><p className="font-mono text-[10px] tabular-nums text-slate-500">{p.barcode}</p>{p.masterSN && <p className="rounded bg-purple-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-purple-700">M-SN: {p.masterSN}</p>}</div>
                      </td>
                      <td data-label="Kategori & Spek" className="px-3 py-2.5 sm:px-4 sm:py-3"><div className="flex flex-col items-start gap-1"><span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${p.category === "Voucher" || p.category?.includes("Perdana") ? "border-purple-200 bg-purple-50 text-purple-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>{p.category === "Voucher" || p.category?.includes("Perdana") ? <Wifi className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}{p.brand ? p.brand : p.provider ? p.provider : p.category}</span>{p.description && <p className="max-w-[200px] truncate text-[10px] font-medium text-slate-500">{p.description}</p>}</div></td>
                      <td data-label="Modal" className="px-3 py-2.5 text-right text-xs font-medium tabular-nums text-slate-600 sm:px-4 sm:py-3">Rp {p.purchasePrice?.toLocaleString("id-ID")}</td>
                      <td data-label="Jual" className="px-3 py-2.5 text-right sm:px-4 sm:py-3"><span className="font-bold tabular-nums text-blue-700">Rp {p.sellingPrice?.toLocaleString("id-ID")}</span>{p.discountPrice > 0 && <p className="mt-1 text-[9px] font-bold uppercase text-emerald-600">Promo: Rp {p.discountPrice.toLocaleString("id-ID")}</p>}</td>
                      <td data-label="Aksi" className="px-3 py-2.5 text-center sm:px-4 sm:py-3"><button aria-label={`Atur ${p.name}`} onClick={() => startEditing(p)} className="min-h-10 min-w-10 rounded-xl p-2 text-blue-700 transition-colors hover:bg-blue-50"><Settings className="h-4 w-4" /></button></td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        );
      })}
    </tbody>
  );
};
