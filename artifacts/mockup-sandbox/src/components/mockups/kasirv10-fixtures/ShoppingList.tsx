import { PlusSquare, ShoppingCart, Sparkles } from "lucide-react";
import { FixtureButton, FixturePageTitle, FixtureShell, FixtureTable } from "./_FixtureShell";
import { fixtureShopping, rupiah } from "./fixtures";

export function ShoppingList() {
  return <FixtureShell title="Daftar Belanja">
    <div className="mb-6 flex flex-col gap-4 text-left md:flex-row md:items-end md:justify-between"><div><div className="mb-2 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><ShoppingCart className="h-5 w-5" /></div><FixturePageTitle title="Daftar Belanja" /></div><p className="text-xs font-medium text-slate-500">Restok inventori atau buat rencana belanja per cabang.</p></div><FixtureButton><PlusSquare className="mr-2 inline h-4 w-4" /> Buat Rencana Baru</FixtureButton></div>
    <section className="fixture-panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between md:p-6"><div><h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-900"><Sparkles className="h-4 w-4 text-amber-500" /> Auto-Alert: Stok Kritis</h2><p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Otomatis mendeteksi barang yang perlu segera dipesan/dikirim</p></div><div className="flex flex-wrap gap-2"><span className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[9px] font-black uppercase text-amber-700">Sistem Memantau Real-time</span><select className="fixture-inset min-h-10 rounded-xl px-3 text-[9px] font-black uppercase"><option>Semua Cabang</option></select><select className="fixture-inset min-h-10 rounded-xl px-3 text-[9px] font-black uppercase"><option>Semua Kategori</option></select></div></div>
      <FixtureTable headings={["Produk · Cabang", "Stok", "Min", "Estimasi Restok", "Status"]} rows={fixtureShopping.map((s) => [<span className="font-bold">{s.name}<small className="mt-1 block text-[9px] font-medium text-slate-400">{s.branch}</small></span>, String(s.stock), String(s.minimum), rupiah((s.minimum - s.stock) * 18000), <span className="rounded-lg bg-amber-50 px-2 py-1 text-[9px] font-black text-amber-700">{s.status}</span>])} mobileCards />
    </section>
  </FixtureShell>;
}
