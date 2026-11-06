import React, { useState } from 'react';
import { Settings, Wifi, Smartphone, ArrowLeft, Search } from 'lucide-react';
import { ProductTable } from '../components/ProductTable';

const MasterProduk = ({ products, searchTerm, setSearchTerm, CATEGORIES, startEditing, navigateTo }: any) => {
  return (
    <div className="min-h-0 w-full min-w-0 overflow-y-auto overflow-x-hidden p-3 pb-6 sm:p-5 lg:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
        <button onClick={() => navigateTo('dashboard')} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-white/60 hover:text-slate-900">
          <ArrowLeft className="w-5 h-5" /> Kembali
        </button>
        <h1 className="text-base font-extrabold tracking-tight text-slate-800 sm:text-xl">Master Produk Global</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/70 p-3 mb-4 sm:mb-6 sm:p-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-500 w-4 h-4" />
          <input 
            type="text" 
            placeholder="Cari produk atau barcode..." 
            className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/70 overflow-hidden">
        <div className="max-w-full overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-left">Item Master</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-left">Kategori & Spek</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Modal</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Jual</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Aksi</th>
            </tr>
          </thead>
          <ProductTable 
             products={products} 
             searchTerm={searchTerm} 
             CATEGORIES={CATEGORIES} 
             startEditing={startEditing} 
          />
        </table>
        </div>
      </div>
    </div>
  );
};

export default MasterProduk;
