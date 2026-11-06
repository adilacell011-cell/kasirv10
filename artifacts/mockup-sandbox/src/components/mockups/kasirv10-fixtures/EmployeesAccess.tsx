import { Plus, Users } from "lucide-react";
import { FixturePageTitle, FixtureShell, FixtureTable } from "./_FixtureShell";
import { fixtureEmployees } from "./fixtures";

export function EmployeesAccess() {
  return <FixtureShell title="Karyawan & Akses">
    <section className="fixture-panel flex min-h-[70vh] flex-col overflow-hidden">
      <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/60 p-3 sm:flex-row sm:items-center sm:p-4"><div className="flex items-start gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Users className="h-4 w-4" /></div><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-xs font-black uppercase tracking-tight text-slate-800">Karyawan & Akses</h1><span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[9px] font-black uppercase text-blue-700">{fixtureEmployees.length} Akun</span></div><p className="mt-1 hidden max-w-2xl text-[9px] font-medium leading-relaxed text-slate-400 sm:block">Satu akun cabang dapat dipakai bergantian. Isi nama penjaga agar semuanya muncul di pilihan shift.</p></div></div><button className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white shadow-sm"><Plus className="h-3.5 w-3.5" /> Tambah Akun Login</button></div>
      <div className="flex-1">
        <div className="divide-y divide-slate-100 md:hidden">{fixtureEmployees.map((emp) => <div key={emp.name} className="space-y-2 p-3"><div className="flex items-center gap-2"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-xs font-black text-blue-600">{emp.name[0]}</div><input readOnly value={emp.name} className="fixture-inset min-h-9 min-w-0 flex-1 rounded-lg px-2 text-xs font-bold text-slate-800" /><span className="rounded-lg bg-blue-50 px-2 py-1 text-[8px] font-black text-blue-700">{emp.role}</span></div><div className="flex justify-between pl-10 text-[9px]"><span className="text-slate-500">{emp.branch}</span><span className="font-black text-emerald-700">{emp.status}</span></div></div>)}</div>
        <div className="hidden md:block"><FixtureTable headings={["Nama Penjaga", "Hak Akses", "Cabang", "Status"]} rows={fixtureEmployees.map((emp) => [emp.name, <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black text-blue-700">{emp.role}</span>, emp.branch, <span className="font-black text-emerald-700">{emp.status}</span>])} /></div>
      </div>
    </section>
  </FixtureShell>;
}
