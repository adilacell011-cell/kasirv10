import { CalendarDays, Search } from "lucide-react";
import { FixturePageTitle, FixtureShell, FixtureStat, FixtureTable } from "./_FixtureShell";
import { fixtureSales, rupiah } from "./fixtures";

export function Transactions() {
  const rows = fixtureSales.map((sale) => [<span className="font-mono font-black text-blue-700">{sale.invoice}</span>, sale.time, sale.branch, `${sale.items} item`, rupiah(sale.total), <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700">{sale.status}</span>]);
  return <FixtureShell title="Riwayat Transaksi">
    <FixturePageTitle title="Riwayat Transaksi" subtitle="Daftar transaksi penjualan dan status pembayaran" />
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3"><FixtureStat label="Transaksi Hari Ini" value="86" detail="Semua cabang" /><FixtureStat label="Total Penjualan" value={rupiah(2845000)} detail="Hari ini" tone="green" /></div>
    <section className="fixture-panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className="fixture-inset min-h-10 w-full rounded-xl pl-10 text-xs" placeholder="Cari nomor transaksi..." /></div><label className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 text-[9px] font-black uppercase text-slate-500"><CalendarDays className="h-4 w-4" /> Hari ini</label></div>
      <FixtureTable headings={["No. Transaksi", "Waktu", "Cabang", "Item", "Total", "Status"]} rows={rows} mobileCards />
    </section>
    <p className="mt-3 text-[9px] font-bold uppercase tracking-widest text-slate-400">Menampilkan 3 transaksi fixture · Tidak terhubung ke data penjualan</p>
  </FixtureShell>;
}
