import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { FixtureButton, FixturePageTitle, FixtureShell, FixtureStat, FixtureTable } from "./_FixtureShell";
import { fixtureBranches, fixtureSales, rupiah } from "./fixtures";

export function Reports() {
  const [tab, setTab] = useState<"summary" | "excel">("summary");
  return <FixtureShell title="Laporan Shift & Cabang">
    <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <FixturePageTitle title="Laporan Shift & Cabang" subtitle="Analisis Perbandingan Pendapatan Siang vs Malam" />
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex rounded-xl bg-slate-100 p-1">{(["summary", "excel"] as const).map((key) => <button key={key} onClick={() => setTab(key)} className={`rounded-lg px-4 py-2 text-[9px] font-black uppercase tracking-widest ${tab === key ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}>{key === "summary" ? "Analisis" : "Tabel Excel"}</button>)}</div>
        <label className="text-[8px] font-black uppercase text-slate-400">Dari tanggal<input type="date" className="fixture-inset mt-1 block min-h-10 rounded-xl px-2 text-xs" defaultValue="2025-04-01" /></label>
        <label className="text-[8px] font-black uppercase text-slate-400">Sampai tanggal<input type="date" className="fixture-inset mt-1 block min-h-10 rounded-xl px-2 text-xs" defaultValue="2025-04-30" /></label>
        <select className="fixture-inset min-h-10 rounded-xl px-3 text-[10px] font-black uppercase"><option>Semua Cabang</option>{fixtureBranches.map((b) => <option key={b.id}>{b.name}</option>)}</select>
      </div>
    </div>
    {tab === "summary" ? <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid grid-cols-2 gap-3 lg:col-span-3"><FixtureStat label="Total Pendapatan" value={rupiah(2845000)} detail="01–30 Apr 2025" tone="green" /><FixtureStat label="Transaksi" value="86" detail="Periode terpilih" /><FixtureStat label="Rata-rata Transaksi" value={rupiah(33100)} detail="Semua cabang" tone="amber" /></div>
      <section className="fixture-panel p-5 lg:col-span-2"><h2 className="mb-5 flex items-center gap-2 text-xs font-black uppercase tracking-widest"><TrendingUp className="h-4 w-4 text-emerald-500" /> Perbandingan Pendapatan Cabang</h2>{fixtureBranches.map((b, i) => <div key={b.id} className="mb-4"><div className="mb-1 flex justify-between text-xs"><b>{b.name}</b><b>{rupiah([1285000, 920000, 640000][i])}</b></div><div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${[90, 67, 48][i]}%` }} /></div></div>)}</section>
      <section className="fixture-panel p-5"><h2 className="text-xs font-black uppercase tracking-widest">Komposisi Shift</h2><div className="mt-5 rounded-2xl bg-blue-50 p-4"><p className="text-[9px] font-black uppercase text-blue-700">Shift Pagi</p><p className="mt-2 text-xl font-black text-blue-800">{rupiah(1560000)}</p></div><div className="mt-3 rounded-2xl bg-indigo-50 p-4"><p className="text-[9px] font-black uppercase text-indigo-700">Shift Malam</p><p className="mt-2 text-xl font-black text-indigo-800">{rupiah(1285000)}</p></div></section>
    </div> : <section className="fixture-panel overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4"><div><h2 className="text-xs font-black uppercase tracking-widest">Tabel Excel · Penjualan Cabang</h2><p className="mt-1 text-[9px] text-slate-500">Ringkasan data fixture untuk periode demo</p></div><FixtureButton>Unduh Excel</FixtureButton></div><FixtureTable headings={["Tanggal", "Cabang", "Shift", "Jumlah Transaksi", "Pendapatan"]} rows={fixtureSales.map((s, i) => ["30 Apr 2025", s.branch, i % 2 ? "Malam" : "Pagi", String(24 + i * 5), rupiah(s.total)])} /></section>}
  </FixtureShell>;
}
