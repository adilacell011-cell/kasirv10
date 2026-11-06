import React from 'react';
import { Settings, Wifi, Smartphone } from 'lucide-react';

export const ProductTable = ({ 
  products, 
  searchTerm, 
  CATEGORIES, 
  startEditing 
}: { 
  products: any[], 
  searchTerm: string, 
  CATEGORIES: string[], 
  startEditing: (p: any) => void 
}) => {
  return (
    <tbody className="divide-y divide-slate-100 text-sm">
      {CATEGORIES.map(category => {
        const catProducts = products.filter(p => {
          if (!p) return false;
          const searchMatch = (p.name || "").toLowerCase().includes((searchTerm || "").toLowerCase()) || (p.barcode || "").includes(searchTerm);
          if (!searchMatch) return false;

          return (p.category || "LAINNYA") === category;
        });
        if (catProducts.length === 0) return null;
        
        const brandsInCategory = Array.from(new Set(catProducts.map(p => {
          if (p.category === "Voucher" || p.category?.includes("Perdana")) {
            return p.provider || p.brand || category;
          }
          return p.brand || p.subCategory || category;
        })));

        return (
          <React.Fragment key={category}>
              <tr className="bg-blue-50/50 text-blue-900">
              <td colSpan={5} className="px-3 py-2.5 font-black uppercase tracking-[0.12em] text-[10px] border-b-2 border-blue-200 sm:px-4 sm:text-[11px]">{category}</td>
            </tr>
            {brandsInCategory.map(brand => {
              const group = catProducts
                .filter(p => {
                  const pBrand = (p.category === "Voucher" || p.category?.includes("Perdana"))
                    ? (p.provider || p.brand || category)
                    : (p.brand || p.subCategory || category);
                  return pBrand === brand;
                })
                .sort((a, b) => {
                  const priceA = a.discountPrice > 0 ? a.discountPrice : a.sellingPrice;
                  const priceB = b.discountPrice > 0 ? b.discountPrice : b.sellingPrice;
                  return priceA - priceB;
                });
              return (
                <React.Fragment key={`${category}-${brand}`}>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <td colSpan={5} className="px-4 py-2 font-bold text-[10px] text-slate-600 uppercase tracking-wider">{brand}</td>
                  </tr>
                  {group.map((p) => (
                    <tr key={p.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="min-w-[220px] px-3 py-2.5 sm:px-4 sm:py-3">
                        <p className="font-bold leading-snug text-slate-800">
                          {(() => {
                            const provider = p.provider || p.brand || "";
                            let displayName = p.name;
                            if (p.category === "Voucher" || p.category?.includes("Perdana")) {
                              if (displayName.toLowerCase().startsWith("voucher")) {
                                displayName = displayName.replace(/voucher/i, provider || "Voucher").trim();
                              } else if (provider && !displayName.toLowerCase().includes(provider.toLowerCase())) {
                                displayName = `${provider} ${displayName}`.trim();
                              }
                            }
                            return displayName;
                          })()}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[10px] font-mono tabular-nums text-slate-500">{p.barcode}</p>
                          {p.masterSN && <p className="text-[9px] font-black text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded uppercase">M-SN: {p.masterSN}</p>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4 sm:py-3"><div className="flex flex-col gap-1 items-start"><span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wide border ${p.category === 'Voucher' || p.category?.includes('Perdana') ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>{p.category === 'Voucher' || p.category?.includes('Perdana') ? <Wifi className="w-3 h-3"/> : <Smartphone className="w-3 h-3"/>}{p.brand ? p.brand : p.provider ? p.provider : p.category}</span>{p.description && <p className="text-[10px] text-slate-500 font-medium max-w-[200px] truncate">{p.description}</p>}</div></td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-600 text-xs tabular-nums sm:px-4 sm:py-3">Rp {p.purchasePrice?.toLocaleString('id-ID')}</td>
                      <td className="px-3 py-2.5 text-right sm:px-4 sm:py-3"><span className="font-bold text-blue-700 tabular-nums">Rp {p.sellingPrice?.toLocaleString('id-ID')}</span>{p.discountPrice > 0 && <p className="text-[9px] font-bold text-emerald-600 mt-1 uppercase">Promo: Rp {p.discountPrice.toLocaleString('id-ID')}</p>}</td>
                      <td className="px-3 py-2.5 text-center sm:px-4 sm:py-3"><button aria-label={`Atur ${p.name}`} onClick={() => startEditing(p)} className="min-h-10 min-w-10 p-2 text-blue-700 hover:bg-blue-50 rounded-xl transition-colors"><Settings className="w-4 h-4" /></button></td>
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
