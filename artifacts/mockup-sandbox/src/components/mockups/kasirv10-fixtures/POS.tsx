import { Barcode, Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { FixtureButton, FixturePageTitle, FixtureShell, FixtureStat } from "./_FixtureShell";
import { fixtureProducts, rupiah } from "./fixtures";

export function POS() {
  return <FixtureShell title="Kasir · Penjualan">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <FixturePageTitle title="Kasir" subtitle="Billing · Shift aktif · Cendana" />
      <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-700">Shift Aktif</span>
    </div>
    <div className="mb-4 flex rounded-2xl bg-slate-100 p-1">{["Billing", "Riwayat", "Pemeliharaan", "Transfer"].map((tab, i) => <button key={tab} className={`flex-1 rounded-xl px-2 py-2 text-[8px] font-black uppercase tracking-wide sm:text-[10px] ${i === 0 ? "bg-white text-blue-600 shadow-sm" : "text-slate-400"}`}>{tab}</button>)}</div>
    <div className="grid gap-4 lg:grid-cols-[1.35fr_.85fr]">
      <section className="fixture-panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-200 p-3"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label="Cari produk" placeholder="Cari nama atau barcode..." className="fixture-inset min-h-10 w-full rounded-xl pl-10 pr-3 text-xs" /></div><button aria-label="Scan barcode" className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><Barcode className="h-4 w-4" /></button></div>
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 p-3">{["Semua", "Aksesoris", "Pulsa", "Voucher"].map((x, i) => <button key={x} className={`shrink-0 rounded-lg px-3 py-1.5 text-[9px] font-black uppercase ${i === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{x}</button>)}</div>
        <div className="divide-y divide-slate-200">{fixtureProducts.map((p) => <div key={p.id} className="flex items-center justify-between gap-3 p-3"><div className="min-w-0"><p className="truncate text-xs font-black uppercase text-slate-800">{p.name}</p><p className="mt-1 text-[9px] font-bold uppercase text-slate-400">{p.brand} · Stok {p.stocks[0]}</p></div><div className="flex shrink-0 items-center gap-3"><span className="text-xs font-black tabular-nums text-blue-700">{rupiah(p.sellingPrice)}</span><button className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Plus className="h-4 w-4" /></button></div></div>)}</div>
      </section>
      <section className="fixture-panel flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 p-4"><h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest"><ShoppingCart className="h-4 w-4 text-blue-600" /> Tagihan Saat Ini</h2><button aria-label="Kosongkan tagihan" className="text-rose-500"><Trash2 className="h-4 w-4" /></button></div>
        <div className="flex-1 divide-y divide-slate-200">{fixtureProducts.slice(0, 2).map((p, i) => <div key={p.id} className="p-4"><div className="flex justify-between gap-2 text-xs"><span className="font-bold text-slate-800">{p.name}</span><span className="font-black">{rupiah(p.sellingPrice * (i + 1))}</span></div><div className="mt-3 flex items-center justify-between"><span className="text-[9px] font-bold uppercase text-slate-400">Jumlah</span><div className="flex items-center gap-3"><button className="text-slate-500"><Minus className="h-4 w-4" /></button><b className="text-xs">{i + 1}</b><button className="text-blue-600"><Plus className="h-4 w-4" /></button></div></div></div>)}</div>
        <div className="space-y-3 border-t border-slate-200 p-4"><div className="flex justify-between text-xs text-slate-500"><span>Total item</span><span>3</span></div><div className="flex justify-between text-base font-black"><span>Total</span><span className="text-blue-700">{rupiah(95000)}</span></div><FixtureStat label="Metode pembayaran" value="Tunai" detail="Diterima Rp 100.000" tone="green" /><FixtureButton>Proses Pembayaran</FixtureButton></div>
      </section>
    </div>
  </FixtureShell>;
}
