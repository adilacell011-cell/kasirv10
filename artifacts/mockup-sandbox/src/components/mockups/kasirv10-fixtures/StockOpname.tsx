import { useState } from "react";
import { Camera, LayoutList, MapPin, Search } from "lucide-react";
import { FixtureShell } from "./_FixtureShell";
import { fixtureBranches, fixtureProducts } from "./fixtures";
import { OpnameStockInput } from "./_OpnameStockInput.fixture";

export function StockOpname() {
  const [branch, setBranch] = useState(fixtureBranches[0].id);
  return <FixtureShell title="Manajemen Stok Opname">
    <section className="fixture-panel flex min-h-[70vh] flex-col overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1"><h1 className="text-sm font-black uppercase tracking-tighter text-slate-900">Manajemen Stok Opname</h1><p className="mb-1 mt-3 text-[9px] font-bold uppercase tracking-widest text-slate-500">Target Audit Institusi Cabang:</p><div data-opname-branch><select aria-label="Pilih cabang" value={branch} onChange={(e) => setBranch(e.target.value)} className="fixture-inset min-h-10 w-full rounded-xl px-3 text-xs font-bold uppercase sm:max-w-xs">{fixtureBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div></div>
        <div className="flex w-full gap-2 sm:max-w-xs"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input placeholder="Cari SKU / Barcode..." className="fixture-inset min-h-10 w-full rounded-xl pl-9 pr-3 text-xs" /></div><button aria-label="Scan" className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Camera className="h-4 w-4" /></button></div>
        <div className="flex items-center gap-2 overflow-x-auto text-[9px] font-bold uppercase tracking-widest"><button className="flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-white"><LayoutList className="h-3 w-3" /> Semua Kategori</button><span className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">Aksesoris</span></div>
      </div>
      <div className="fixture-opname-desktop flex-1 overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-left">
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50"><tr>
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">Produk Audit</th>
            <th className="w-28 border-x border-slate-200 px-2 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">Stok Sistem</th>
            <th className="w-52 px-2 py-3 text-[10px] font-bold uppercase tracking-widest text-blue-600">Edit Fisik Stok</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 text-xs">{fixtureProducts.map((p) => {
            const stock = p.stocks[fixtureBranches.findIndex((b) => b.id === branch)] || 0;
            return <tr key={p.id} className="hover:bg-slate-50">
              <td className="px-4 py-3"><p className="font-bold uppercase tracking-tight text-slate-800">{p.name}</p><p className="mt-0.5 font-mono text-[10px] text-slate-400">{p.barcode}</p></td>
              <td className="border-x border-slate-50 px-2 py-3 text-center"><span className="inline-flex h-9 min-w-10 items-center justify-center rounded-lg bg-slate-900 px-2 text-[10px] font-black text-white">{stock}</span></td>
              <td className="px-2 py-3"><OpnameStockInput branchId={branch} productId={p.id} currentStock={stock} onSave={async () => {}} /></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className="fixture-opname-mobile space-y-3 p-3">
        {fixtureProducts.map((p) => {
          const stock = p.stocks[fixtureBranches.findIndex((b) => b.id === branch)] || 0;
          return <article key={`mobile-${p.id}`} className="fixture-panel p-3">
            <div className="mb-3 min-w-0"><h2 className="break-words text-xs font-black uppercase tracking-tight text-slate-800">{p.name}</h2><p className="mt-1 break-all font-mono text-[10px] text-slate-400">{p.barcode}</p></div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
              <div><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Stok Sistem</p><span className="mt-1 inline-flex min-h-9 min-w-10 items-center justify-center rounded-lg bg-slate-900 px-2 text-[10px] font-black text-white">{stock}</span></div>
              <div className="min-w-0 flex-1"><p className="mb-1 text-[9px] font-black uppercase tracking-widest text-blue-600">Edit Fisik Stok</p><OpnameStockInput branchId={branch} productId={p.id} currentStock={stock} onSave={async () => {}} /></div>
            </div>
          </article>;
        })}
      </div>
      <div className="border-t border-slate-200 p-3 text-[9px] font-bold uppercase tracking-widest text-slate-400"><MapPin className="mr-1 inline h-3 w-3" /> Data contoh lokal · perubahan tidak disimpan</div>
    </section>
  </FixtureShell>;
}
