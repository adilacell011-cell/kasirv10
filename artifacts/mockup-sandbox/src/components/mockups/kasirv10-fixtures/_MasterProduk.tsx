import React from "react";
import { ArrowLeft, Search } from "lucide-react";
import { ProductTable } from "./_ProductTable";

const MasterProduk = ({ products, searchTerm, setSearchTerm, CATEGORIES, startEditing, navigateTo }: any) => {
  return (
    <div className="min-h-0 w-full min-w-0 overflow-y-auto overflow-x-hidden p-3 pb-6 sm:p-5 lg:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
        <button onClick={() => navigateTo("dashboard")} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-white/60 hover:text-slate-900">
          <ArrowLeft className="h-5 w-5" /> Kembali
        </button>
        <h1 className="text-base font-extrabold tracking-tight text-slate-800 sm:text-xl">Master Produk Global</h1>
      </div>
      <div className="mb-4 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm sm:mb-6 sm:p-4">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><input type="text" placeholder="Cari produk atau barcode..." className="w-full rounded-xl border py-2.5 pl-10 pr-4 text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <div className="master-products-table-scroll">
          <table className="fixture-mobile-cards w-full min-w-[760px]">
            <thead><tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">Item Master</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500">Kategori & Spek</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">Modal</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">Jual</th>
              <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">Aksi</th>
            </tr></thead>
            <ProductTable products={products} searchTerm={searchTerm} CATEGORIES={CATEGORIES} startEditing={startEditing} />
          </table>
        </div>
      </div>
    </div>
  );
};

export default MasterProduk;
