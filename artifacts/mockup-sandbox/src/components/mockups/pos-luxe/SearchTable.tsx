import { useMemo, useState } from "react";
import {
  Camera,
  ChevronDown,
  Grid2X2,
  Hand,
  Minus,
  Moon,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  Trash2,
  X,
} from "lucide-react";
import "./_group.css";

type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  barcode: string;
  price: number;
  stock: number;
};

type CartLine = { product: Product; qty: number };

const products: Product[] = [
  { id: "axis-55", name: "Voucher Axis · 5,5GB / 3h", brand: "AXIS", category: "Voucher", barcode: "89911000101", price: 12500, stock: 12 },
  { id: "axis-3", name: "Voucher Axis · 3GB / 1h", brand: "AXIS", category: "Voucher", barcode: "89911000102", price: 9000, stock: 7 },
  { id: "indosat-7", name: "Indosat · 7GB / 1h", brand: "INDOSAT", category: "Voucher", barcode: "89911000103", price: 10000, stock: 30 },
  { id: "tri-6", name: "Tri · 6GB / 3h", brand: "TRI", category: "Voucher", barcode: "89911000104", price: 15000, stock: 18 },
  { id: "xl-4", name: "XL · 4GB / 3h", brand: "XL", category: "Voucher", barcode: "89911000105", price: 15000, stock: 0 },
  { id: "pulsa-25", name: "Pulsa Telkomsel · Rp 25.000", brand: "TELKOMSEL", category: "Pulsa", barcode: "89911000106", price: 27000, stock: 16 },
  { id: "cable", name: "Kabel Data Type-C · 1 m", brand: "AKSESORI", category: "Aksesoris", barcode: "89911000107", price: 25000, stock: 8 },
];

const categories = ["Semua", "Voucher", "Pulsa", "Aksesoris"];
const money = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;

export function SearchTable() {
  const [query, setQuery] = useState("voucher");
  const [category, setCategory] = useState("Semua");
  const [cart, setCart] = useState<CartLine[]>([
    { product: products[0], qty: 1 },
    { product: products[5], qty: 1 },
  ]);
  const resultRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === "Semua" || product.category === category;
      const matchesTerm = !term || `${product.name} ${product.brand} ${product.barcode} ${product.category}`.toLowerCase().includes(term);
      return matchesCategory && matchesTerm;
    });
  }, [query, category]);
  const total = cart.reduce((sum, line) => sum + line.product.price * line.qty, 0);

  const addProduct = (product: Product) => {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      return existing
        ? current.map((line) => line.product.id === product.id ? { ...line, qty: line.qty + 1 } : line)
        : [...current, { product, qty: 1 }];
    });
    setQuery("");
  };
  const updateQty = (id: string, delta: number) => {
    setCart((current) => current
      .map((line) => line.product.id === id ? { ...line, qty: line.qty + delta } : line)
      .filter((line) => line.qty > 0));
  };

  return (
    <main className="pos-current flex min-h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3">
        <div className="flex min-w-0 items-center gap-2">
          <button aria-label="Menu" className="flex h-8 w-8 items-center justify-center rounded-lg text-blue-700"><Grid2X2 className="h-4 w-4" /></button>
          <div className="flex min-w-0 items-center gap-2">
            <Store className="h-4 w-4 shrink-0 text-blue-700" />
            <div className="min-w-0">
              <p className="truncate text-[9px] font-black uppercase tracking-wide text-slate-800">Sistem Kasir Aksesori & Voucher</p>
              <p className="text-[8px] font-semibold text-slate-400">Alfath Pulsa · Pratinjau katalog</p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-slate-500">
          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-black uppercase text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Shift aktif</span>
          <button aria-label="Tampilan" className="flex h-8 w-8 items-center justify-center rounded-lg"><Moon className="h-4 w-4" /></button>
        </div>
      </header>

      <section className="shrink-0 border-b border-slate-200 bg-white px-3 pb-2 pt-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-400">Kasir · Shift Pagi</p>
            <h1 className="truncate text-sm font-black tracking-tight text-slate-900">Pulsa & Voucher</h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1.5 text-[8px] font-black text-emerald-700"><TrendingUp className="h-3 w-3" /> Omzet Rp 45.000</span>
            <span className="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1.5 text-[8px] font-black text-blue-700"><Sparkles className="h-3 w-3" /> Bonus Rp 2.500</span>
          </div>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          {["Billing", "Riwayat", "Transfer Stok"].map((tab, index) => (
            <button key={tab} className={`flex-1 rounded-lg px-2 py-1.5 text-[8px] font-black uppercase tracking-wide ${index === 0 ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{tab}</button>
          ))}
        </div>
      </section>

      <div className="pos-current-layout min-h-0 flex-1">
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-slate-200">
          <div className="relative z-20 shrink-0 border-b border-slate-200 bg-slate-100 p-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                aria-label="Cari atau pindai produk"
                placeholder="CARI ATAU PINDAI BARCODE..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-20 text-[10px] font-black tracking-wide text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <div className="absolute inset-y-0 right-1 flex items-center gap-1">
                {query && <button aria-label="Hapus pencarian" onClick={() => setQuery("")} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400"><X className="h-4 w-4" /></button>}
                <button aria-label="Scan barcode" className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white"><Camera className="h-4 w-4" /></button>
              </div>
              {query.trim() && (
                <div className="absolute left-[-3px] right-[-3px] top-[calc(100%+8px)] z-30 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_14px_32px_rgba(15,35,64,.18)]">
                  <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_3.25rem_5rem] border-b border-slate-300 text-[9px] font-black uppercase tracking-wide">
                    <span className="border-r border-slate-200 bg-slate-100 py-2 text-center text-slate-500">#</span>
                    <span className="border-r border-blue-100 bg-blue-50 px-2 py-2 text-blue-800">Nama Produk</span>
                    <span className="border-r border-emerald-100 bg-emerald-50 py-2 text-center text-emerald-800">Stok</span>
                    <span className="bg-indigo-50 px-1.5 py-2 text-right text-indigo-800">Harga</span>
                  </div>
                  <div className="max-h-[270px] overflow-y-auto">
                    {resultRows.length ? resultRows.map((product, index) => {
                      const outOfStock = product.stock <= 0;
                      return (
                        <button
                          key={product.id}
                          onClick={() => addProduct(product)}
                          className="group grid min-h-[46px] w-full grid-cols-[1.5rem_minmax(0,1fr)_3.25rem_5rem] border-b border-slate-200 text-left transition-colors last:border-b-0 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                        >
                          <span className="flex items-center justify-center border-r border-slate-200 bg-slate-50 text-[9px] font-semibold tabular-nums text-slate-500">{index + 1}</span>
                          <span className="flex min-w-0 items-center border-r border-blue-100 bg-white px-2 py-1 text-[10px] font-bold leading-tight text-slate-800 group-hover:bg-blue-50/60">
                            <span className="min-w-0">
                              <span className="block line-clamp-2">{product.name}</span>
                              <span className="mt-0.5 block truncate text-[8px] font-semibold uppercase tracking-wide text-slate-400">{product.brand} · {product.barcode}</span>
                            </span>
                          </span>
                          <span className={`flex items-center justify-center border-r border-emerald-100 text-[10px] font-black tabular-nums ${outOfStock ? "bg-rose-50 text-rose-700" : "bg-emerald-50/70 text-emerald-800"}`}>
                            {outOfStock ? "HABIS" : product.stock}
                          </span>
                          <span className="flex items-center justify-end bg-indigo-50/70 px-1.5 text-[10px] font-black tabular-nums text-indigo-900">{money(product.price)}</span>
                        </button>
                      );
                    }) : (
                      <div className="px-3 py-5 text-center text-[9px] font-semibold text-slate-500">Produk tidak ditemukan. Periksa nama atau barcode.</div>
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-2.5 py-1.5">
                    <span className="text-[7px] font-bold uppercase tracking-wide text-slate-500">{resultRows.length} hasil · ketuk baris untuk menambahkan</span>
                    <span className="text-[7px] font-semibold text-blue-700">Nama · stok · harga</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-2 py-2">
            {categories.map((item) => (
              <button key={item} onClick={() => setCategory(item)} className={`min-h-8 shrink-0 rounded-lg px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wide ${category === item ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-500"}`}>{item}</button>
            ))}
            <button className="ml-auto flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[8px] font-bold text-slate-500">Semua merek <ChevronDown className="h-3 w-3" /></button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-2">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[8px] font-black uppercase tracking-widest text-slate-600">Katalog rak: {category}</h2>
              <span className="text-[8px] font-bold text-slate-400">{products.filter((product) => category === "Semua" || product.category === category).length} produk</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {products.filter((product) => category === "Semua" || product.category === category).map((product) => (
                <button key={product.id} onClick={() => addProduct(product)} className="flex min-h-[102px] flex-col justify-between rounded-xl border-2 border-slate-300 bg-white p-2.5 text-left shadow-sm hover:border-blue-500">
                  <div>
                    <div className="mb-1.5 flex items-start justify-between gap-1">
                      <span className="rounded-md bg-blue-50 px-1.5 py-1 text-[7px] font-black uppercase text-blue-700">{product.brand}</span>
                      <span className={`rounded-md px-1.5 py-1 text-[7px] font-black ${product.stock ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{product.stock ? `STOK: ${product.stock}` : "HABIS"}</span>
                    </div>
                    <h3 className="line-clamp-2 min-h-[2.4em] text-[9px] font-black uppercase leading-snug text-slate-900">{product.name}</h3>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-1.5">
                    <span className="text-[10px] font-black text-slate-900">{money(product.price)}</span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Plus className="h-3.5 w-3.5" /></span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col overflow-hidden bg-white">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 px-2.5">
            <h2 className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-800"><ShoppingCart className="h-4 w-4 text-blue-700" /> Nota ({cart.reduce((sum, line) => sum + line.qty, 0)})</h2>
            <div className="flex items-center gap-1">
              <button className="flex h-8 items-center gap-1 rounded-lg px-1.5 text-[8px] font-black uppercase text-amber-700"><Hand className="h-3 w-3" /> Tahan</button>
              <button aria-label="Kosongkan nota" onClick={() => setCart([])} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
            {cart.map(({ product, qty }) => (
              <div key={product.id} className="p-2.5">
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 text-[9px] font-black uppercase leading-snug text-slate-800">{product.name}</h3>
                    <p className="mt-1 text-[8px] font-bold text-blue-700">@ {money(product.price)}</p>
                  </div>
                  <span className="shrink-0 text-[9px] font-black text-slate-900">{money(product.price * qty)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[8px] font-bold uppercase text-slate-400">Jumlah</span>
                  <div className="flex items-center gap-2">
                    <button aria-label={`Kurangi ${product.name}`} onClick={() => updateQty(product.id, -1)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600"><Minus className="h-3 w-3" /></button>
                    <span className="w-4 text-center text-[9px] font-black">{qty}</span>
                    <button aria-label={`Tambah ${product.name}`} onClick={() => updateQty(product.id, 1)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-blue-700"><Plus className="h-3 w-3" /></button>
                  </div>
                </div>
              </div>
            ))}
            {!cart.length && <p className="p-4 text-center text-[9px] font-bold text-slate-400">Nota kosong</p>}
          </div>
          <div className="shrink-0 border-t border-slate-200 bg-white p-2.5">
            <div className="mb-2 flex items-center justify-between text-[8px] font-bold text-slate-500"><span>Estimasi bonus</span><span className="text-emerald-700">Rp 1.000</span></div>
            <div className="mb-2 flex items-end justify-between">
              <span className="text-[8px] font-black uppercase tracking-wide text-slate-500">Total tagihan</span>
              <span className="text-sm font-black leading-none text-slate-900">{money(total)}</span>
            </div>
            <button className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-[9px] font-black uppercase tracking-widest text-white"><ShoppingCart className="h-3.5 w-3.5" /> Bayar & Cetak Nota</button>
            <button className="mt-1.5 flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[8px] font-black uppercase tracking-widest text-slate-500"><Hand className="h-3.5 w-3.5" /> Tahan Transaksi</button>
            <p className="mt-1.5 text-center text-[7px] font-semibold text-slate-400">Tampilan contoh · transaksi tidak disimpan</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
