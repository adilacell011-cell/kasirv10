import "./_group.css";
import { Check, FileText, Store } from "lucide-react";

const receiptLines = [
  { name: "Voucher Telkomsel – 2GB 1 Hari", planned: 5, received: 5 },
  { name: "Voucher Telkomsel – 5GB 3 Hari", planned: 10, received: 10 },
  { name: "Voucher Indosat – 2GB 1 Hari", planned: 5, received: 4 },
  { name: "Voucher Axis – 3GB 2 Hari", planned: 8, received: 8 },
  { name: "Voucher XL – 5GB 7 Hari", planned: 3, received: 3 },
];

export function Current() {
  const planned = receiptLines.reduce((sum, line) => sum + line.planned, 0);
  const received = receiptLines.reduce((sum, line) => sum + line.received, 0);
  const short = planned - received;

  return <main className="purchase-receipt-mockup overflow-x-hidden px-3 py-4">
    <div className="mx-auto w-full max-w-[520px]">
      <header className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#182b43] px-3 py-3">
        <FileText size={22} className="shrink-0 text-[#c8ad78]"/>
        <div><h1 className="text-base font-bold text-white">Nota Penerimaan</h1><p className="text-xs text-slate-400">Rencana belanja cabang</p></div>
      </header>
      <section className="mt-3 rounded-2xl border border-white/10 bg-[#172940] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div><p className="flex items-center gap-2 font-bold text-white"><Store size={17}/> Alfath 2</p><p className="mt-1 text-xs text-slate-400">Nota penerimaan barang</p></div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/60 px-2.5 py-1 text-xs font-semibold text-emerald-200"><Check size={14}/> Diterima</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-b border-white/10 py-3 text-xs">
          <span className="text-slate-400">Referensi</span><span className="truncate text-slate-200">BLJ-141126-001</span>
          <span className="text-slate-400">Tanggal</span><span className="text-slate-200">14 Nov 2026, 14:03</span>
          <span className="text-slate-400">Diperiksa</span><span className="text-slate-200">alfath2</span>
        </div>
        <div className="mt-3 space-y-2">
          {receiptLines.map((line, index) => {
            const difference = line.received - line.planned;
            return <article key={line.name} className="rounded-xl border border-white/10 bg-[#0f2035] p-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 gap-2"><span className="text-slate-400">{index + 1}.</span><p className="min-w-0 break-words font-semibold text-slate-100">{line.name}</p></div>
                <span className={difference < 0 ? "shrink-0 font-bold text-rose-200" : "shrink-0 font-bold text-emerald-200"}>{difference < 0 ? difference : "Sesuai"}</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded-md bg-[#172940] px-1 py-1.5"><span className="block text-[10px] text-slate-400">Rencana</span><strong>{line.planned}</strong></div>
                <div className="rounded-md bg-[#172940] px-1 py-1.5"><span className="block text-[10px] text-slate-400">Diterima</span><strong>{line.received}</strong></div>
                <div className="rounded-md bg-[#172940] px-1 py-1.5"><span className="block text-[10px] text-slate-400">Selisih</span><strong>{difference}</strong></div>
              </div>
            </article>;
          })}
        </div>
        <div className="mt-3 space-y-1 border-t border-white/10 pt-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-400">Total rencana</span><strong>{planned} pcs</strong></div>
          <div className="flex justify-between"><span className="text-slate-400">Total diterima</span><strong>{received} pcs</strong></div>
          <div className="flex justify-between"><span className="text-slate-400">Total kurang</span><strong className="text-rose-200">{short} pcs</strong></div>
          <div className="flex justify-between"><span className="text-slate-400">Total lebih</span><strong>0 pcs</strong></div>
        </div>
        <p className="mt-3 border-t border-white/10 pt-3 text-xs leading-5 text-slate-300">Catatan: Penerimaan sesuai rencana, kecuali produk nomor 3 kurang 1 pcs.</p>
      </section>
    </div>
  </main>;
}
