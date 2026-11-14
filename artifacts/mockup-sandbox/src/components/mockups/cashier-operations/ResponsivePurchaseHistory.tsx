import "./_group.css";
import { CalendarDays, Check, ChevronRight, ClipboardCheck, FileText, PackageCheck } from "lucide-react";

const receipts = [
  { ref: "BLJ-141126-001", title: "Belanja cabang", date: "14 Nov 2026 · 14.03", status: "Perlu diterima", planned: 18, branch: "Alfath 2", type: "pending" },
  { ref: "BLJ-131126-002", title: "Belanja cabang", date: "13 Nov 2026 · 09.42", status: "Diterima", planned: 31, branch: "Alfath 2", type: "confirmed" },
  { ref: "BLJ-121126-001", title: "Belanja cabang", date: "12 Nov 2026 · 16.18", status: "Diperbarui", planned: 12, branch: "Alfath 2", type: "updated" },
];

export function ResponsivePurchaseHistory() {
  return <main className="cashier-preview min-h-screen px-3 py-3 sm:px-5 md:px-6">
    <section className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-slate-200 px-3 py-3 sm:px-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f4ecd9] text-[#7b6334]"><ClipboardCheck size={20}/></span>
        <div className="min-w-0 flex-1"><h1 className="text-base font-extrabold sm:text-lg">Penerimaan belanja</h1><p className="text-xs text-slate-500">Nota Owner untuk cabang Alfath 2</p></div>
        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">3 nota</span>
      </header>
      <div className="space-y-2 p-3 sm:p-4">
        {receipts.map((receipt) => <article key={receipt.ref} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-slate-900">{receipt.title}</h2>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${receipt.type === "confirmed" ? "bg-emerald-100 text-emerald-800" : receipt.type === "updated" ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-800"}`}>{receipt.status}</span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1"><CalendarDays size={13}/>{receipt.date}</span>
              <span>{receipt.ref}</span>
              <span>Rencana <strong className="tabular-nums">{receipt.planned} pcs</strong></span>
            </p>
          </div>
          {receipt.type === "pending"
            ? <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 text-sm font-bold text-white hover:bg-slate-700 sm:w-auto"><PackageCheck size={17}/>Periksa barang<ChevronRight size={16}/></button>
            : <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-100 sm:w-auto">{receipt.type === "confirmed" ? <><FileText size={16}/>Lihat nota</> : <><Check size={16}/>Riwayat revisi</>}</button>}
        </article>)}
      </div>
      <footer className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600"><FileText size={15}/>Riwayat tetap tersimpan; ketuk nota untuk melihat rincian.</footer>
    </section>
  </main>;
}
