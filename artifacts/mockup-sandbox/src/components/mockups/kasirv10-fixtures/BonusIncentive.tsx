import { RefreshCw, Store } from "lucide-react";
import { FixturePageTitle, FixtureShell, FixtureStat } from "./_FixtureShell";
import { fixtureBranches, rupiah } from "./fixtures";

export function BonusIncentive() {
  const balances = [285000, 164000, 92000];
  return <FixtureShell title="Bonus & Insentif">
    <div className="mb-5"><FixturePageTitle title="Bonus & Insentif" subtitle="Kelola Komisi Penjualan Karyawan" /></div>
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="fixture-panel overflow-hidden lg:col-span-2">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/50 p-4 sm:p-6"><h2 className="text-[10px] font-black uppercase tracking-tight text-slate-800 sm:text-sm">Ringkasan Saldo Per Cabang</h2><Store className="h-5 w-5 text-blue-500" /></div>
        <div className="divide-y divide-slate-200">{fixtureBranches.map((b, i) => <div key={b.id} className="flex flex-col justify-between gap-4 p-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:p-6"><div className="flex items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Store className="h-6 w-6" /></div><div><p className="font-black uppercase tracking-tight text-slate-800">{b.name}</p><button className="mt-1 flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest text-blue-500"><RefreshCw className="h-3 w-3" /> Sinkronkan Data</button></div></div><div className="text-left sm:text-right"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Saldo bonus terkumpul</p><p className="mt-1 text-lg font-black tabular-nums text-blue-700">{rupiah(balances[i])}</p></div></div>)}</div>
      </section>
      <div className="space-y-4"><FixtureStat label="Bonus Periode Ini" value={rupiah(541000)} detail="3 cabang" tone="green" /><FixtureStat label="Menunggu Pembayaran" value={rupiah(126000)} detail="4 penjaga" tone="amber" /><section className="fixture-panel p-4"><h2 className="text-[10px] font-black uppercase tracking-widest text-slate-700">Skema Insentif</h2><p className="mt-3 text-xs font-bold text-slate-600">Komisi penjualan produk terpilih</p><p className="mt-1 text-[10px] text-slate-400">Perhitungan fixture hanya untuk pratinjau.</p></section></div>
    </div>
  </FixtureShell>;
}
