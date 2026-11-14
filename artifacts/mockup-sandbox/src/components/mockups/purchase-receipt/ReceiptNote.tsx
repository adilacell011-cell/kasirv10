import "./_group.css";
import { Check, FileText, Printer, Share2, Store } from "lucide-react";

const receiptLines = [
  { name: "Voucher Telkomsel – 2GB 1 Hari", planned: 5, received: 5 },
  { name: "Voucher Telkomsel – 5GB 3 Hari", planned: 10, received: 10 },
  { name: "Voucher Indosat – 2GB 1 Hari", planned: 5, received: 4, note: "Barang tersedia 4 pcs; 1 pcs kurang." },
  { name: "Voucher Axis – 3GB 2 Hari", planned: 8, received: 8 },
  { name: "Voucher XL – 5GB 7 Hari", planned: 3, received: 3 },
];

export function ReceiptNote() {
  const planned = receiptLines.reduce((sum, line) => sum + line.planned, 0);
  const received = receiptLines.reduce((sum, line) => sum + line.received, 0);
  const short = receiptLines.reduce((sum, line) => sum + Math.max(line.planned - line.received, 0), 0);
  const extra = receiptLines.reduce((sum, line) => sum + Math.max(line.received - line.planned, 0), 0);

  return <main className="purchase-receipt-mockup min-h-screen overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 pb-6 pt-3 sm:px-5">
    <div className="mx-auto w-full max-w-[520px]">
      <header className="mb-3 flex min-h-12 items-center gap-3 rounded-xl border border-[#344a60] bg-[#192c42] px-3 py-2 shadow-sm">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#465a6e] bg-[#21364d] text-slate-200"><FileText size={19}/></span>
        <h1 className="min-w-0 flex-1 text-center text-base font-bold text-slate-100">Nota Penerimaan</h1>
        <span className="h-9 w-9 shrink-0"/>
      </header>

      <article className="overflow-hidden rounded-2xl border border-[#d1cbbd] bg-[#ece9e1] text-[#1d2a38] shadow-md">
        <div className="px-3 pb-3 pt-4 sm:px-5">
          <div className="text-center">
            <p className="flex items-center justify-center gap-2 text-xl font-extrabold text-[#1b2938]"><Store size={22}/> Alfath 2</p>
            <p className="mt-1 text-sm font-medium text-[#43505d]">Nota Penerimaan Barang</p>
          </div>

          <div className="my-3 border-t border-dashed border-[#a9a599]"/>
          <div className="grid grid-cols-[4.2rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-xs sm:grid-cols-[5rem_minmax(0,1fr)] sm:text-sm">
            <span className="text-[#59636d]">No. Ref</span><strong className="truncate">BLJ-141126-001</strong>
            <span className="text-[#59636d]">Tanggal</span><strong>14 Nov 2026, 14:03</strong>
            <span className="text-[#59636d]">Diperiksa</span><strong>alfath2</strong>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-y border-dashed border-[#a9a599] py-2">
            <span className="text-xs font-semibold text-[#59636d]">Status penerimaan</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#6e8a74] bg-[#dce4dc] px-2.5 py-1 text-xs font-bold text-[#365a3e]"><Check size={14}/> Sesuai sebagian</span>
          </div>

          <div className="mt-3 overflow-x-auto">
            <div className="min-w-[305px]">
              <div className="grid grid-cols-[1.2rem_minmax(0,1fr)_2.5rem_2.75rem_2.4rem] gap-1 rounded-md bg-[#dfddd5] px-1.5 py-2 text-[10px] font-bold text-[#384551] sm:grid-cols-[1.7rem_minmax(0,1fr)_3.3rem_3.6rem_3rem] sm:text-xs">
                <span>No.</span><span>Nama Produk</span><span className="text-right">Rencana</span><span className="text-right">Terima</span><span className="text-right">Selisih</span>
              </div>
              <div>
                {receiptLines.map((line, index) => {
                  const difference = line.received - line.planned;
                  const missing = line.received === 0;
                  return <div key={line.name} className="border-b border-[#cfcdc5] px-1.5 py-2">
                    <div className="grid grid-cols-[1.2rem_minmax(0,1fr)_2.5rem_2.75rem_2.4rem] items-start gap-1 text-[11px] sm:grid-cols-[1.7rem_minmax(0,1fr)_3.3rem_3.6rem_3rem] sm:text-sm">
                      <span className="text-[#606a72]">{index + 1}.</span>
                      <div className="min-w-0">
                        <p className={`break-words font-semibold ${missing ? "text-[#71716c] line-through" : "text-[#1d2a38]"}`}>{line.name}</p>
                        {line.note && <p className="mt-1 break-words text-[10px] leading-4 text-[#6f5740] sm:text-xs">{line.note}</p>}
                      </div>
                      <strong className="text-right">{line.planned}</strong>
                      <strong className="text-right">{line.received}</strong>
                      <strong className={`text-right ${difference < 0 ? "text-[#8b4843]" : difference > 0 ? "text-[#77602f]" : "text-[#3c5c45]"}`}>{difference > 0 ? `+${difference}` : difference}</strong>
                    </div>
                  </div>;
                })}
              </div>
            </div>
          </div>

          <div className="my-3 border-t border-dashed border-[#a9a599]"/>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3"><strong>Total rencana</strong><strong>{planned} pcs</strong></div>
            <div className="flex justify-between gap-3"><strong>Total diterima</strong><strong>{received} pcs</strong></div>
            <div className="flex justify-between gap-3"><strong>Total kurang</strong><strong className="text-[#8b4843]">{short} pcs</strong></div>
            <div className="flex justify-between gap-3"><strong>Total lebih</strong><strong className="text-[#77602f]">{extra} pcs</strong></div>
          </div>
          <div className="my-3 border-t border-dashed border-[#a9a599]"/>
          <div className="rounded-lg border border-[#d0cbbf] bg-[#e5e2da] p-2.5">
            <p className="text-[11px] font-bold text-[#48535e]">Catatan penerimaan</p>
            <p className="mt-1 text-xs leading-5 text-[#313d48]">Barang diterima sesuai rencana, kecuali voucher Indosat kurang 1 pcs. Kekurangan sudah tercatat untuk Owner.</p>
          </div>
        </div>
      </article>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#344c63] bg-[#1b3046] px-3 text-xs font-bold text-slate-100"><Printer size={16}/>Cetak / PDF</button>
        <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#b9aa87] bg-[#e8e1cf] px-3 text-xs font-bold text-[#55472b]"><Share2 size={16}/>Bagikan</button>
      </div>
      <p className="px-2 pb-2 pt-3 text-center text-[11px] leading-4 text-slate-400">Struk memakai kertas gading yang lembut; gulir halaman untuk melihat isi lengkap di Android.</p>
    </div>
  </main>;
}
