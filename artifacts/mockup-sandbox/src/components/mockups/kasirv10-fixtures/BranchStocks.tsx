import { Search } from "lucide-react";
import { FixturePageTitle, FixtureShell } from "./_FixtureShell";
import { fixtureBranches, fixtureProducts } from "./fixtures";

export function BranchStocks() {
  return <FixtureShell title="Stok per Cabang">
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><FixturePageTitle title="Laporan Stok per Cabang" subtitle="Stok detail setiap barang di tiap lokasi cabang." /><div className="relative w-full md:w-80"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input placeholder="Cari Barang..." className="fixture-inset min-h-11 w-full rounded-2xl py-3 pl-11 pr-4 text-sm font-bold" /></div></div>
    <section className="fixture-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-blue-50 px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-blue-800">
        <span>Geser tabel ke samping untuk melihat stok tiap cabang dan total</span>
        <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-blue-700">Geser ↔</span>
      </div>
      <div className="branch-matrix-scroll" role="region" aria-label="Matriks stok per cabang, geser horizontal untuk melihat semua kolom" tabIndex={0}>
        <table className="fixture-branch-matrix w-full min-w-[780px] border-collapse text-left">
          <thead><tr className="bg-slate-200"><th className="w-72 border-r border-slate-300 bg-slate-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700">Master Data Produk</th>{fixtureBranches.map((b) => <th key={b.id} className="min-w-[110px] border-r border-slate-300 px-2 py-3 text-center text-[9px] font-black uppercase tracking-widest text-slate-600">{b.name}</th>)}<th className="min-w-[100px] bg-slate-100 px-4 py-3 text-right text-[10px] font-black uppercase text-slate-700">Total Stok</th><th className="px-4 py-3 text-center text-[10px] font-black uppercase text-rose-600">Aksi</th></tr></thead>
          <tbody className="divide-y divide-slate-300">{fixtureProducts.map((p) => <tr key={p.id} className="hover:bg-blue-50/30"><td className="border-r border-slate-300 bg-white px-4 py-3"><p className="text-[13px] font-bold leading-tight text-slate-900">{p.name}</p><span className="mt-1 inline-block rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">{p.barcode}</span></td>{p.stocks.map((qty, i) => <td key={fixtureBranches[i].id} className={`border-r border-slate-200 px-2 py-3 text-center font-mono text-sm font-black ${qty <= p.minStock ? "bg-red-50/50 text-red-600" : "text-slate-600"}`}>{qty}</td>)}<td className="bg-slate-50 px-4 py-3 text-right font-black">{p.stocks.reduce((sum, q) => sum + q, 0)}</td><td className="px-4 py-3 text-center text-slate-400">—</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  </FixtureShell>;
}
