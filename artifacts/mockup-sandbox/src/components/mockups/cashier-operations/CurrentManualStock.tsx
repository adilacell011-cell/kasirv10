import "./_group.css";
import { Activity, Camera, CheckCircle2, Package, Plus, PlusSquare, Search } from "lucide-react";

const products = [
  { name: "Voucher Telkomsel 2GB 1 Hari", barcode: "899123456701", brand: "TELKOMSEL", stock: 12 },
  { name: "Voucher Indosat 2GB 1 Hari", barcode: "899123456702", brand: "INDOSAT", stock: 6 },
  { name: "Voucher Axis 3GB 2 Hari", barcode: "899123456703", brand: "AXIS", stock: 3 },
  { name: "Voucher XL 5GB 7 Hari", barcode: "899123456704", brand: "XL", stock: 0 },
];
const activity = [
  { product: "Voucher Telkomsel 2GB", time: "14.03", reason: "Input Kasir", qty: "+5" },
  { product: "Voucher Indosat 2GB", time: "12.51", reason: "Terjual", qty: "−1" },
  { product: "Voucher Axis 3GB", time: "11.42", reason: "Transfer diterima", qty: "+3" },
];

export function CurrentManualStock() {
  return <main className="cashier-preview flex flex-col gap-4 p-3 md:flex-row md:p-5">
    <section className="flex min-h-[400px] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><PlusSquare size={16}/></span><span className="flex-1 text-[10px] font-black uppercase tracking-widest text-slate-700">Pilih Produk Stok-In</span><button className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white"><Camera size={12}/>Scan</button></header>
      <div className="border-b border-slate-100 px-3 py-2"><div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"/><input className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-[11px] font-semibold" placeholder="Cari nama / barcode..."/></div></div>
      <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-slate-100">
        {products.map((product, index) => <div key={product.barcode} className={`flex cursor-pointer items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 ${index === 0 ? "bg-emerald-50" : ""}`}>
          <div className="min-w-0"><p className="text-[9px] font-bold text-slate-400">{product.brand}</p><p className="truncate text-[11px] font-black uppercase text-slate-800">{product.name}</p><p className="text-[9px] font-mono text-slate-400">{product.barcode}</p></div>
          <span className="shrink-0 text-[9px] font-black text-slate-500">Stok {product.stock}</span>
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${index === 0 ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"}`}>{index === 0 ? <CheckCircle2 size={14}/> : <Plus size={14}/>}</span>
        </div>)}
      </div>
    </section>
    <section className="flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:w-[300px]">
      <header className="flex items-center gap-2 border-b border-slate-100 p-3"><Package size={16} className="text-emerald-600"/><h2 className="text-[10px] font-black uppercase tracking-widest text-slate-700">Input Detail Stok</h2></header>
      <div className="space-y-3 p-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Produk dipilih</p><p className="mt-1 text-xs font-black uppercase text-slate-800">Voucher Telkomsel 2GB 1 Hari</p><p className="mt-1 text-[10px] text-slate-500">Stok saat ini 12 pcs</p></div>
        <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500">Kuantitas masuk<input type="number" defaultValue={5} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-xl font-black"/></label>
        <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500">Keterangan / supplier<input defaultValue="Stok Pusat" className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"/></label>
        <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-[10px] font-black uppercase tracking-widest text-white"><CheckCircle2 size={16}/>Simpan Stok Masuk</button>
      </div>
      <div className="min-h-[170px] flex-1 border-t border-slate-100">
        <div className="sticky top-0 flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2"><Activity size={14} className="text-slate-500"/><span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Aktivitas terakhir</span></div>
        {activity.map((item) => <div key={item.time} className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2"><div className="min-w-0"><p className="truncate text-[10px] font-bold text-slate-800">{item.product}</p><p className="text-[9px] text-slate-400">{item.reason} · {item.time}</p></div><strong className={`text-xs ${item.qty.startsWith("+") ? "text-emerald-600" : "text-rose-600"}`}>{item.qty}</strong></div>)}
      </div>
    </section>
  </main>;
}
