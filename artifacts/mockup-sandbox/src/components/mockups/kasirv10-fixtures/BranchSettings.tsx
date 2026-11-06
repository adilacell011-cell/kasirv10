import { MapPin, Settings } from "lucide-react";
import { FixturePageTitle, FixtureShell } from "./_FixtureShell";
import { fixtureBranches } from "./fixtures";

export function BranchSettings() {
  return <FixtureShell title="Pengaturan Cabang">
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <FixturePageTitle title="Pengaturan Cabang" subtitle="Konfigurasi fitur global dan daftar lokasi." />
      <section className="fixture-panel p-4 sm:p-7"><h2 className="mb-5 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-800 sm:mb-8"><Settings className="h-4 w-4 text-emerald-500" /> Fitur & Hak Akses Global</h2><div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:p-6"><div><p className="text-xs font-black uppercase text-slate-700">Kasir Input Stok Cabang</p><p className="mt-1 text-[10px] font-bold uppercase text-slate-500">Izinkan kasir melakukan input stok masuk mandiri di cabang mereka.</p></div><button aria-label="Pengaturan aktif" className="relative h-7 w-14 rounded-full bg-emerald-500 shadow-inner"><span className="absolute left-8 top-1 h-5 w-5 rounded-full bg-white shadow-sm" /></button></div></section>
      <section className="fixture-panel p-4"><h2 className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3 text-xs font-bold uppercase tracking-widest text-slate-800"><MapPin className="h-4 w-4 text-blue-500" /> Registrasi Cabang Baru</h2><div className="flex flex-col gap-3 sm:flex-row"><input placeholder="Nama Cabang (Contoh: Cabang Jakarta Pusat)" className="fixture-inset min-h-10 flex-1 rounded-xl px-4 text-sm" /><button className="min-h-10 shrink-0 rounded-xl bg-blue-600 px-6 text-[11px] font-bold uppercase tracking-widest text-white">Simpan Cabang</button></div></section>
      <section className="fixture-panel overflow-hidden"><div className="border-b border-slate-200 bg-slate-50 p-4"><h2 className="text-xs font-bold uppercase tracking-widest text-slate-800">Daftar Cabang Aktif</h2></div><div className="divide-y divide-slate-200">{fixtureBranches.map((b, i) => <div key={b.id} className="flex items-center justify-between gap-3 p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 font-black text-blue-700">{i + 1}</span><div><p className="text-xs font-black uppercase text-slate-800">{b.name}</p><p className="mt-1 text-[9px] font-bold uppercase text-emerald-700">Aktif · cabang demo</p></div></div><button className="rounded-xl px-3 py-2 text-[9px] font-black uppercase text-blue-700">Atur</button></div>)}</div></section>
    </div>
  </FixtureShell>;
}
