import { useState } from "react";
import { Camera, Plus, PlusSquare, Search, ShoppingCart, Trash2 } from "lucide-react";
import { FixtureButton, FixturePageTitle, FixtureShell } from "./_FixtureShell";
import { fixtureProducts, rupiah } from "./fixtures";

export function CashierStockInput() {
  const [selected, setSelected] = useState(fixtureProducts[0].id);
  const product = fixtureProducts.find((p) => p.id === selected) ?? fixtureProducts[0];
  return <FixtureShell title="Input Stok Cabang">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><FixturePageTitle title="Input Stok Cabang" subtitle="Cendana · Shift aktif · Data demo lokal" /><span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-700">Shift Aktif</span></div>
    <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
      <section className="fixture-panel flex min-h-[520px] flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5"><div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><PlusSquare className="h-4 w-4" /></div><span className="flex-1 text-[10px] font-black uppercase tracking-widest text-slate-700">Pilih Produk Stok-In</span><button className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white"><Camera className="h-3 w-3" /> Scan</button></div>
        <div className="border-b border-slate-100 px-3 py-2"><div className="relative"><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" /><input placeholder="Cari nama / barcode..." className="fixture-inset min-h-10 w-full rounded-lg py-2 pl-9 pr-3 text-xs font-semibold" /></div></div>
        <div className="flex gap-2 overflow-x-auto border-b border-slate-100 p-3">{["Semua", "Aksesoris", "Voucher", "Pulsa"].map((x, i) => <button key={x} className={`shrink-0 rounded-lg px-3 py-1.5 text-[9px] font-black uppercase ${i === 0 ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}>{x}</button>)}</div>
        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">{fixtureProducts.map((p) => <button key={p.id} onClick={() => setSelected(p.id)} className={`flex w-full items-center justify-between gap-3 p-3 text-left ${selected === p.id ? "border-l-4 border-emerald-500 bg-emerald-50/50" : "hover:bg-slate-50"}`}><div className="min-w-0"><p className="truncate text-xs font-black uppercase text-slate-800">{p.name}</p><p className="mt-1 text-[9px] font-bold uppercase text-slate-400">{p.brand} · Kode {p.barcode}</p></div><div className="flex shrink-0 items-center gap-3"><span className="text-[9px] font-black text-slate-500">Stok {p.stocks[0]}</span><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><Plus className="h-4 w-4" /></span></div></button>)}</div>
      </section>
      <section className="fixture-panel flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 p-4"><ShoppingCart className="h-4 w-4 text-emerald-600" /><h2 className="text-[10px] font-black uppercase tracking-widest text-slate-700">Ringkasan Input Stok</h2></div>
        <div className="flex-1 p-4"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Produk dipilih</p><p className="mt-2 text-sm font-black uppercase text-slate-800">{product.name}</p><p className="mt-1 text-[10px] text-slate-500">{product.brand} · Stok saat ini {product.stocks[0]}</p></div><label className="mt-4 block text-[9px] font-black uppercase tracking-widest text-slate-500">Jumlah masuk<input type="number" defaultValue={6} min={1} className="fixture-inset mt-2 min-h-11 w-full rounded-xl px-3 text-sm font-black" /></label><label className="mt-4 block text-[9px] font-black uppercase tracking-widest text-slate-500">Catatan (opsional)<input placeholder="Contoh: restok rutin" className="fixture-inset mt-2 min-h-11 w-full rounded-xl px-3 text-xs font-semibold" /></label><div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4 text-xs"><span className="font-bold text-slate-500">Nilai stok masuk</span><b className="font-black text-emerald-700">{rupiah(product.purchasePrice * 6)}</b></div><button className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white"><Trash2 className="h-4 w-4" /> Catat Stok Masuk</button></div>
        <p className="border-t border-slate-200 p-3 text-[9px] font-bold uppercase tracking-widest text-slate-400">Kontrol hanya untuk pratinjau · tidak ada perubahan stok</p>
      </section>
    </div>
  </FixtureShell>;
}
