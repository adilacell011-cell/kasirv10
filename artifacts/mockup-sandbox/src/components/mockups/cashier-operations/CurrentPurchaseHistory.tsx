import "./_group.css";
import { ClipboardCheck, FileText, PackageCheck } from "lucide-react";

const receipts = [
  { ref: "BLJ-141126-001", title: "Belanja Cabang Alfath 2", revision: "Revisi 2", date: "14 Nov 2026 · 14.03", status: "Menunggu penerimaan", planned: "18 pcs", action: "Periksa barang" },
  { ref: "BLJ-131126-002", title: "Belanja Cabang Alfath 2", revision: "Revisi 1", date: "13 Nov 2026 · 09.42", status: "Diterima", planned: "31 pcs", action: "Lihat nota" },
  { ref: "BLJ-121126-001", title: "Belanja Cabang Alfath 2", revision: "Revisi 1", date: "12 Nov 2026 · 16.18", status: "Diperbarui", planned: "12 pcs", action: "—" },
];

export function CurrentPurchaseHistory() {
  return <main className="cashier-preview px-3 py-4">
    <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-3 text-slate-800 shadow-sm">
      <header className="mb-3 flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f4ecd9] text-[#7b6334]"><ClipboardCheck size={20}/></span>
        <div><h1 className="font-extrabold">Penerimaan pembelian</h1><p className="text-xs text-slate-500">Periksa barang dari rencana Owner.</p></div>
      </header>
      <div className="space-y-2">
        {receipts.map((receipt) => <article key={receipt.ref} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="font-bold">{receipt.title}</p><p className="mt-0.5 text-xs text-slate-500">{receipt.revision} · {receipt.date}</p><p className="mt-1 text-[11px] text-slate-500">Rencana {receipt.planned}</p></div>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">{receipt.status}</span>
          </div>
          {receipt.action !== "—" && <button className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-800 px-4 text-sm font-bold text-white"><PackageCheck size={17}/>{receipt.action}</button>}
        </article>)}
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3 text-xs text-slate-500"><FileText size={15}/>3 catatan penerimaan</div>
    </section>
  </main>;
}
