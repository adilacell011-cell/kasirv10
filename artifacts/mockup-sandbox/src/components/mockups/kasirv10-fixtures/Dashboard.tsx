import { Activity, Boxes, TrendingUp } from "lucide-react";
import { FixturePageTitle, FixtureShell, FixtureStat } from "./_FixtureShell";
import { fixtureBranches, fixtureSales, rupiah } from "./fixtures";

export function Dashboard() {
  return <FixtureShell title="Dashboard Pusat">
    <div className="fixture-panel mb-5 p-4 sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <FixturePageTitle title="Dashboard Pusat" subtitle="Ringkasan operasional hari ini" />
        <div className="flex flex-nowrap gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1">{["Harian", "Mingguan", "Bulanan", "Semua"].map((p, i) => <button key={p} className={`shrink-0 rounded-xl px-3 py-2 text-[9px] font-black uppercase ${i === 0 ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}>{p}</button>)}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{["Ringkasan", "Penjualan", "Stok & Audit"].map((t, i) => <button key={t} className={`rounded-xl px-4 py-2 text-[9px] font-black uppercase tracking-widest ${i === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{t}</button>)}</div>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <FixtureStat label="Penjualan Hari Ini" value={rupiah(2845000)} detail="+8,4% dibanding kemarin" tone="green" />
      <FixtureStat label="Transaksi" value="86" detail="3 cabang aktif" />
      <FixtureStat label="Produk Terjual" value="124" detail="Berbagai kategori" tone="amber" />
      <FixtureStat label="Stok Kritis" value="2 item" detail="Perlu diperiksa" tone="rose" />
    </div>
    <div className="mt-5 grid gap-4 lg:grid-cols-3">
      <section className="fixture-panel p-4 sm:p-5 lg:col-span-2">
        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-800"><TrendingUp className="h-4 w-4 text-emerald-500" /> Ringkasan Pendapatan Cabang</h2>
        <div className="mt-5 space-y-4">{fixtureBranches.map((branch, i) => <div key={branch.id}><div className="mb-1 flex justify-between text-xs"><span className="font-bold text-slate-700">{branch.name}</span><span className="font-black tabular-nums">{rupiah([1285000, 920000, 640000][i])}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600" style={{ width: `${[90, 67, 48][i]}%` }} /></div></div>)}</div>
      </section>
      <section className="fixture-panel p-4 sm:p-5"><h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-800"><Activity className="h-4 w-4 text-blue-600" /> Aktivitas</h2><p className="mt-3 text-xs text-slate-500">Penjualan tercatat pada seluruh cabang demo.</p><div className="mt-4 rounded-xl bg-blue-50 p-3 text-xs font-bold text-blue-800"><Boxes className="mr-1 inline h-4 w-4" /> 2 stok berada di bawah batas minimum.</div></section>
    </div>
    <section className="fixture-panel mt-5 overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-4"><h2 className="text-xs font-black uppercase tracking-widest text-slate-800">Transaksi Terbaru</h2></div>
      <div className="divide-y divide-slate-200">{fixtureSales.slice(0, 3).map((sale) => <div key={sale.invoice} className="flex items-center justify-between gap-3 px-4 py-3 text-xs"><div><p className="font-black text-slate-800">{sale.invoice}</p><p className="mt-1 text-[10px] text-slate-500">{sale.time} · {sale.branch}</p></div><span className="font-black tabular-nums text-blue-700">{rupiah(sale.total)}</span></div>)}</div>
    </section>
  </FixtureShell>;
}
