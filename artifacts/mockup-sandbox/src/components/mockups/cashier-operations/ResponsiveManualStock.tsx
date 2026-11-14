import "./_group.css";
import { Activity, Camera, CheckCircle2, Package, Plus, PlusSquare, Search } from "lucide-react";

const products = [
  { name: "Voucher Telkomsel 2GB 1 Hari", barcode: "899123456701", brand: "TELKOMSEL", stock: 12 },
  { name: "Voucher Indosat 2GB 1 Hari", barcode: "899123456702", brand: "INDOSAT", stock: 6 },
  { name: "Voucher Axis 3GB 2 Hari", barcode: "899123456703", brand: "AXIS", stock: 3 },
  { name: "Voucher XL 5GB 7 Hari", barcode: "899123456704", brand: "XL", stock: 0 },
];
const activity = [
  { product: "Voucher Telkomsel 2GB 1 Hari", time: "14.03", reason: "Input manual", qty: "+5" },
  { product: "Voucher Indosat 2GB 1 Hari", time: "12.51", reason: "Terjual", qty: "−1" },
  { product: "Voucher Axis 3GB 2 Hari", time: "11.42", reason: "Transfer diterima", qty: "+3" },
];

export function ResponsiveManualStock() {
  return <main className="cashier-preview p-3 sm:p-4">
    <div className="mx-auto max-w-6xl">
      <header className="mb-3 flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f4ecd9] text-[#7b6334]"><PlusSquare size={20}/></span>
        <div className="min-w-0 flex-1"><h1 className="font-extrabold sm:text-lg">Input stok manual</h1><p className="text-xs text-slate-500">Cendana · Shift aktif</p></div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">Diizinkan</span>
      </header>
      <div className="grid gap-3 md:h-[min(760px,calc(100dvh-10rem))] md:min-h-[560px] md:grid-cols-[minmax(0,1.3fr)_minmax(280px,.9fr)]">
        <section className="flex min-h-[370px] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:min-h-0">
          <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5 sm:px-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><Package size={17}/></span>
            <div className="min-w-0 flex-1"><h2 className="text-sm font-bold">Pilih produk</h2><p className="text-[11px] text-slate-500">Pilih satu produk untuk mencatat stok masuk.</p></div>
            <button className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-slate-800 px-3 text-xs font-bold text-white"><Camera size={15}/>Scan</button>
          </header>
          <div className="border-b border-slate-200 p-3 sm:px-4">
            <label className="sr-only" htmlFor="stock-preview-search">Cari produk</label>
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input id="stock-preview-search" className="min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-3 text-sm" placeholder="Cari nama atau barcode"/></div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {products.map((product, index) => <button key={product.barcode} className={`flex min-h-[68px] w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left sm:px-4 ${index === 0 ? "bg-blue-50/70" : "hover:bg-slate-50"}`}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${index === 0 ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-500"}`}>{index === 0 ? <CheckCircle2 size={17}/> : <Plus size={17}/>}</span>
              <span className="min-w-0 flex-1"><span className="block text-[11px] font-bold uppercase text-slate-500">{product.brand}</span><span className="block break-words text-sm font-bold leading-5 text-slate-900">{product.name}</span><span className="block break-all text-[11px] text-slate-500">{product.barcode}</span></span>
              <span className="shrink-0 text-right"><span className="block text-[11px] text-slate-500">Stok</span><strong className="text-sm tabular-nums text-slate-800">{product.stock} pcs</strong></span>
            </button>)}
          </div>
        </section>
        <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5 sm:px-4"><Package size={17} className="text-blue-700"/><div><h2 className="text-sm font-bold">Catat stok masuk</h2><p className="text-[11px] text-slate-500">Jumlah yang dimasukkan akan ditambahkan.</p></div></header>
          <div className="space-y-3 p-3 sm:p-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3"><p className="text-[11px] font-semibold text-slate-500">Produk dipilih</p><p className="mt-1 break-words text-sm font-bold text-slate-900">Voucher Telkomsel 2GB 1 Hari</p><p className="mt-1 text-xs text-slate-600">Stok saat ini <strong>12 pcs</strong></p></div>
            <label className="block text-xs font-bold text-slate-700">Jumlah masuk (pcs)<input type="number" defaultValue={5} min={1} inputMode="numeric" className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-lg font-bold tabular-nums"/></label>
            <label className="block text-xs font-bold text-slate-700">Keterangan / supplier <span className="font-normal text-slate-500">(opsional)</span><input defaultValue="Stok Pusat" className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm"/></label>
            <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 text-sm font-bold text-white hover:bg-slate-700"><CheckCircle2 size={17}/>Simpan stok masuk</button>
          </div>
          <div className="min-h-[190px] flex-1 border-t border-slate-200 md:min-h-0">
            <header className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-4"><span className="inline-flex items-center gap-2 text-xs font-bold text-slate-700"><Activity size={15}/>Aktivitas terakhir</span><span className="text-[11px] text-slate-500">3 catatan</span></header>
            <div className="max-h-[250px] overflow-y-auto overscroll-contain md:max-h-none md:h-[calc(100%-42px)]">
              {activity.map((item) => <div key={item.time} className="flex min-h-14 items-center gap-3 border-b border-slate-100 px-3 py-2.5 sm:px-4"><div className="min-w-0 flex-1"><p className="break-words text-xs font-semibold text-slate-800">{item.product}</p><p className="mt-0.5 text-[11px] text-slate-500">{item.reason} · {item.time}</p></div><strong className={`shrink-0 rounded-lg px-2.5 py-1 text-sm tabular-nums ${item.qty.startsWith("+") ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{item.qty}</strong></div>)}
            </div>
          </div>
        </section>
      </div>
    </div>
  </main>;
}
