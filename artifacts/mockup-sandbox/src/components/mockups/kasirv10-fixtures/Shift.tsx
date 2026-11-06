import { CheckCircle2, Clock3, Info, LogOut } from "lucide-react";
import { FixtureButton, FixtureShell } from "./_FixtureShell";

export function Shift() {
  return <FixtureShell title="Manajemen Shift">
    <div className="flex flex-col items-center justify-center gap-6 xl:flex-row xl:items-start">
      <section className="fixture-panel relative w-full max-w-md shrink-0 overflow-hidden">
        <div className="fixture-shift-hero relative overflow-hidden border-b border-slate-200 p-6 text-center text-slate-900 sm:p-8"><div className="absolute -right-16 -top-16 h-32 w-32 rounded-full bg-blue-500/10" /><Clock3 className="relative z-10 mx-auto mb-4 h-14 w-14 text-blue-600" /><h1 className="relative z-10 text-2xl font-black uppercase tracking-tight">Manajemen Shift</h1><p className="relative z-10 mt-2 text-[10px] uppercase tracking-widest text-slate-500">Cendana</p></div>
        <div className="space-y-5 p-5 sm:p-8"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Shift Pagi Aktif</div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left"><p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">Penjaga pada shift ini:</p><div className="rounded-xl bg-white px-3 py-2 text-sm font-black uppercase text-slate-800">Alya Pratama</div><p className="mt-2 text-[8px] font-bold leading-relaxed text-blue-600">Untuk serah terima, tutup shift ini terlebih dahulu. Penjaga berikutnya memilih namanya saat membuka shift baru.</p></div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left"><p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">Mulai Shift:</p><div className="flex items-center justify-between"><p className="text-sm font-black uppercase text-slate-800">08:00</p><span className="rounded-lg bg-amber-100 px-2 py-0.5 text-[8px] font-black uppercase text-amber-700">Pagi</span></div></div>
          <button className="flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl bg-red-600 py-4 text-[11px] font-black uppercase tracking-widest text-white shadow-lg"><LogOut className="h-5 w-5" /> Tutup Shift Sekarang</button>
          <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50 p-3 text-left"><Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" /><p className="text-[8px] font-bold uppercase leading-relaxed text-blue-800">Sistem mencatat transaksi berdasarkan personil aktif pada shift ini.</p></div>
        </div>
      </section>
      <aside className="fixture-panel w-full max-w-md p-5"><h2 className="text-xs font-black uppercase tracking-widest text-slate-800">Ringkasan Shift Berjalan</h2><div className="mt-4 space-y-3 text-xs"><div className="flex justify-between"><span className="text-slate-500">Transaksi</span><b>24</b></div><div className="flex justify-between"><span className="text-slate-500">Total penjualan</span><b className="text-blue-700">Rp 785.000</b></div><div className="flex justify-between"><span className="text-slate-500">Kas awal</span><b>Rp 200.000</b></div></div><div className="mt-5"><FixtureButton>Rincian Shift</FixtureButton></div></aside>
    </div>
  </FixtureShell>;
}
