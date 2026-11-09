import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Barcode,
  Check,
  ChevronDown,
  CircleDollarSign,
  Hand,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  stock: number;
  incentive: number;
  bestSeller?: boolean;
};

type CartLine = { product: Product; qty: number };

const products: Product[] = [
  { id: "axis-55", name: "Voucher Axis · 5,5GB / 3h", brand: "AXIS", category: "Voucher", price: 12500, stock: 12, incentive: 300, bestSeller: true },
  { id: "indosat-7", name: "Indosat · 7GB / 1h", brand: "INDOSAT", category: "Voucher", price: 10000, stock: 30, incentive: 250, bestSeller: true },
  { id: "tri-6", name: "Tri · 6GB / 3h", brand: "TRI", category: "Voucher", price: 15000, stock: 18, incentive: 350 },
  { id: "xl-4", name: "XL · 4GB / 3h", brand: "XL", category: "Voucher", price: 15000, stock: 21, incentive: 350 },
  { id: "pulsa-25", name: "Pulsa Telkomsel · Rp 25.000", brand: "TELKOMSEL", category: "Pulsa", price: 27000, stock: 16, incentive: 500, bestSeller: true },
  { id: "pulsa-10", name: "Pulsa Indosat · Rp 10.000", brand: "INDOSAT", category: "Pulsa", price: 11500, stock: 24, incentive: 200 },
  { id: "cable", name: "Kabel Data Type-C · 1 m", brand: "AKSESORI", category: "Aksesoris", price: 25000, stock: 8, incentive: 750 },
  { id: "charger", name: "Adaptor Fast Charge 20W", brand: "AKSESORI", category: "Aksesoris", price: 68000, stock: 5, incentive: 1500 },
];

const categories = ["Semua", "Voucher", "Pulsa", "Aksesoris"];
const money = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;

export function Theme() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Semua");
  const [brandOpen, setBrandOpen] = useState(false);
  const [brand, setBrand] = useState("Semua merek");
  const [cart, setCart] = useState<CartLine[]>([
    { product: products[0], qty: 1 },
    { product: products[4], qty: 1 },
  ]);
  const [held, setHeld] = useState<CartLine[][]>([]);
  const [dialog, setDialog] = useState<"scan" | "held" | "checkout" | "paid" | "clear" | null>(null);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [notice, setNotice] = useState("");

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => {
      const byCategory = category === "Semua" || product.category === category;
      const byBrand = brand === "Semua merek" || product.brand.toLowerCase() === brand.toLowerCase();
      const byQuery = !term || `${product.name} ${product.brand} ${product.id}`.toLowerCase().includes(term);
      return byCategory && byBrand && byQuery;
    });
  }, [query, category, brand]);

  const total = cart.reduce((sum, line) => sum + line.product.price * line.qty, 0);
  const incentiveTotal = cart.reduce((sum, line) => sum + line.product.incentive * line.qty, 0);
  const itemCount = cart.reduce((sum, line) => sum + line.qty, 0);

  const addProduct = (product: Product) => {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      return existing
        ? current.map((line) => line.product.id === product.id ? { ...line, qty: line.qty + 1 } : line)
        : [...current, { product, qty: 1 }];
    });
    setNotice(`${product.name} ditambahkan`);
    window.setTimeout(() => setNotice(""), 1700);
  };

  const updateQty = (id: string, delta: number) => {
    setCart((current) => current
      .map((line) => line.product.id === id ? { ...line, qty: line.qty + delta } : line)
      .filter((line) => line.qty > 0));
  };

  const holdTransaction = () => {
    if (!cart.length) return;
    setHeld((current) => [...current, cart]);
    setCart([]);
    setDialog(null);
    setNotice("Transaksi ditahan");
    window.setTimeout(() => setNotice(""), 1700);
  };

  const confirmBarcode = () => {
    if (barcodeValue.trim()) setQuery(barcodeValue.trim());
    setDialog(null);
    setBarcodeValue("");
  };

  const brands = ["Semua merek", ...Array.from(new Set(products.map((product) => product.brand)))];

  return (
    <main className="pos-premium flex min-h-[100dvh] flex-col overflow-hidden">
      <style>{`
        .pos-premium {
          --premium-ink: #1d3447;
          --premium-muted: #6f7f8b;
          --premium-line: #dfe7ea;
          --premium-blue: #315f86;
          --premium-blue-deep: #244764;
          --premium-blue-wash: #edf3f7;
          min-height: 100dvh;
          height: 100dvh;
          color: var(--premium-ink);
          background: #f1f5f9;
          font-family: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
          -webkit-font-smoothing: antialiased;
        }
        .premium-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 242px;
        }
        .premium-surface { background: #fff; }
        .premium-scroll { scrollbar-width: thin; scrollbar-color: #c8d7de transparent; }
        .premium-enter { animation: premium-enter .24s ease-out both; }
        @keyframes premium-enter { from { opacity: .5; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 560px) {
          .premium-layout { grid-template-columns: minmax(0, 1fr); overflow-y: auto; }
          .premium-catalog { min-height: 390px; }
          .premium-cart { min-height: 300px; border-top: 1px solid var(--premium-line); }
          .premium-top-metrics { display: none; }
        }
      `}</style>

      <header className="flex h-[54px] shrink-0 items-center justify-between border-b border-[#dfe7ea] bg-white px-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-[#edf3f7] text-[#315f86]">
            <Store className="h-[17px] w-[17px]" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-extrabold tracking-[.015em] text-[#1d3447]">Alfath Pulsa</p>
            <p className="truncate text-[9px] font-medium text-[#6f7f8b]">Kasir · Toko Cempaka</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="premium-top-metrics flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-lg bg-[#f3f6f7] px-2.5 py-1.5 text-[9px] font-bold text-[#556a82]">
              <TrendingUp className="h-3.5 w-3.5 text-[#315f86]" /> Omzet <b className="text-[#1d3447]">Rp 45.000</b>
            </span>
            <span className="flex items-center gap-1.5 rounded-lg bg-[#f3f6f7] px-2.5 py-1.5 text-[9px] font-bold text-[#556a82]">
              <Sparkles className="h-3.5 w-3.5 text-[#315f86]" /> Insentif <b className="text-[#315f86]">Rp 2.500</b>
            </span>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-[#dceee6] bg-[#f0f6f3] px-2.5 py-1.5 text-[8px] font-bold tracking-wide text-[#47755f]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#6b9a7a]" /> SHIFT AKTIF
          </span>
        </div>
      </header>

      <section className="shrink-0 border-b border-[#dfe7ea] bg-white px-3.5 pb-2.5 pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[8px] font-bold uppercase tracking-[.18em] text-[#82939d]">Billing · Shift pagi</p>
            <h1 className="mt-0.5 truncate text-[17px] font-extrabold leading-tight tracking-[-.035em] text-[#1d3447]">Pulsa & voucher</h1>
          </div>
          <div className="rounded-xl border border-[#e2e9ec] bg-[#fbfcfc] px-3 py-1.5 text-right">
            <p className="text-[8px] font-semibold uppercase tracking-[.12em] text-[#8595a1]">Kasir</p>
            <p className="text-[10px] font-bold text-[#3a5062]">Nadia P.</p>
          </div>
        </div>
      </section>

      <div className="premium-layout min-h-0 flex-1">
        <section className="premium-catalog flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-[#dfe7ea]">
          <div className="shrink-0 bg-[#f1f5f9] px-3 py-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#80939e]" />
              <input
                aria-label="Cari atau pindai produk"
                placeholder="Cari nama, merek, atau barcode"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-10 w-full rounded-xl border border-[#d8e2e9] bg-white pl-9 pr-[76px] text-[10px] font-semibold text-[#253c50] outline-none transition focus:border-[#88a8bd] focus:ring-2 focus:ring-[#315f86]/10 placeholder:text-[#8b9ca5]"
              />
              {query && <button aria-label="Hapus pencarian" onClick={() => setQuery("")} className="absolute right-[42px] top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#80939e] hover:bg-[#f1f5f9]"><X className="h-4 w-4" /></button>}
              <button aria-label="Pindai barcode" onClick={() => setDialog("scan")} className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-[#315f86] text-white transition hover:bg-[#244764]">
                <Barcode className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="premium-surface flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[#e4eaed] px-3 py-2">
            <span className="mr-0.5 flex shrink-0 items-center gap-1.5 text-[8px] font-extrabold uppercase tracking-[.12em] text-[#607783]">
              <BadgeCheck className="h-3.5 w-3.5 text-[#315f86]" /> Terlaris
            </span>
            {products.filter((product) => product.bestSeller).map((product) => (
              <button key={product.id} onClick={() => addProduct(product)} className="shrink-0 rounded-lg border border-[#e0e8ed] bg-white px-2.5 py-1.5 text-left transition hover:border-[#9ab5c6] hover:bg-[#f5f9fa]">
                <span className="block max-w-[112px] truncate text-[8px] font-bold text-[#3c5365]">{product.name}</span>
                <span className="mt-0.5 block text-[8px] font-semibold tabular-nums text-[#738792]">{money(product.price)}</span>
              </button>
            ))}
          </div>

          <div className="premium-surface relative flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[#e4eaed] px-3 py-2">
            {categories.map((item) => (
              <button key={item} onClick={() => setCategory(item)} className={`min-h-8 shrink-0 rounded-lg px-3 text-[9px] font-bold transition ${category === item ? "bg-[#315f86] text-white" : "bg-[#f1f5f6] text-[#627985] hover:bg-[#e7eef1]"}`}>
                {item}
                {category === item && <span className="ml-1.5 text-[8px] opacity-75">{item === "Semua" ? products.length : products.filter((p) => p.category === item).length}</span>}
              </button>
            ))}
            <div className="relative ml-auto">
              <button onClick={() => setBrandOpen((value) => !value)} className="flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-[#e0e8ed] bg-white px-2.5 text-[8px] font-semibold text-[#607783]">
                {brand === "Semua merek" ? "Merek" : brand} <ChevronDown className="h-3 w-3" />
              </button>
              {brandOpen && (
                <div className="absolute right-0 top-9 z-20 min-w-[132px] rounded-xl border border-[#dce5e9] bg-white p-1.5 shadow-[0_12px_30px_rgba(21,40,68,.13)]">
                  {brands.map((item) => <button key={item} onClick={() => { setBrand(item); setBrandOpen(false); }} className={`block w-full rounded-lg px-2.5 py-2 text-left text-[9px] font-semibold ${brand === item ? "bg-[#edf3f7] text-[#315f86]" : "text-[#586f7f] hover:bg-[#f3f6f7]"}`}>{item}</button>)}
                </div>
              )}
            </div>
          </div>

          <div className="premium-scroll min-h-0 flex-1 overflow-y-auto bg-[#f4f7f8] p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-[8px] font-extrabold uppercase tracking-[.16em] text-[#607783]">Katalog rak <span className="font-semibold normal-case tracking-normal text-[#95a4ad]">/ {category}</span></h2>
              <span className="text-[8px] font-semibold text-[#83949e]">{filteredProducts.length} produk</span>
            </div>
            {filteredProducts.length ? (
              <div className="grid grid-cols-2 gap-2">
                {filteredProducts.map((product) => (
                  <button key={product.id} onClick={() => addProduct(product)} className="premium-enter group flex min-h-[120px] flex-col justify-between rounded-xl border border-[#dce5e9] bg-white p-2.5 text-left transition duration-150 hover:border-[#91adbb] hover:shadow-[0_5px_14px_rgba(32,67,111,.07)] active:scale-[.99]">
                    <div className="w-full">
                      <div className="mb-2 flex items-center justify-between gap-1">
                        <span className="truncate rounded-md bg-[#edf3f7] px-1.5 py-1 text-[7px] font-extrabold tracking-[.06em] text-[#3b6688]">{product.brand}</span>
                        <span className={`shrink-0 rounded-md px-1.5 py-1 text-[7px] font-bold ${product.stock <= 5 ? "bg-[#fbf4e9] text-[#94703c]" : "bg-[#f0f6f3] text-[#507763]"}`}>Stok {product.stock}</span>
                      </div>
                      <h3 className="line-clamp-2 min-h-[2.5em] text-[10px] font-bold leading-[1.3] text-[#253c50]">{product.name}</h3>
                    </div>
                    <div className="mt-2 flex w-full items-end justify-between border-t border-[#edf1f5] pt-2">
                      <span className="text-[11px] font-extrabold tracking-[-.02em] tabular-nums text-[#20384c]">{money(product.price)}</span>
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#edf3f7] text-[#315f86] transition group-hover:bg-[#315f86] group-hover:text-white"><Plus className="h-4 w-4" /></span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-[#d7e1e5] bg-white px-5 text-center">
                <ShoppingBag className="mb-2 h-6 w-6 text-[#9aabc0]" />
                <p className="text-[10px] font-bold text-[#425a76]">Produk belum ditemukan</p>
                <p className="mt-1 max-w-[220px] text-[9px] leading-relaxed text-[#84969f]">Coba kata kunci atau kategori lain untuk melanjutkan pencarian.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="premium-cart flex min-h-0 flex-col overflow-hidden bg-white">
          <div className="flex h-[48px] shrink-0 items-center justify-between border-b border-[#e3e9ec] px-3">
            <h2 className="flex items-center gap-2 text-[10px] font-extrabold tracking-[.04em] text-[#253c50]">
              <ShoppingCart className="h-4 w-4 text-[#315f86]" /> Nota <span className="rounded-md bg-[#edf3f7] px-1.5 py-0.5 text-[8px] text-[#3b6688]">{itemCount}</span>
            </h2>
            <div className="flex items-center gap-1">
              <button onClick={() => setDialog("held")} className="flex h-8 items-center gap-1 rounded-lg px-2 text-[8px] font-bold text-[#8a7043] hover:bg-[#faf7f0]"><Hand className="h-3.5 w-3.5" /> Ditahan{held.length > 0 && <span className="ml-0.5 rounded-full bg-[#f2eadc] px-1.5 py-0.5 text-[7px]">{held.length}</span>}</button>
              <button aria-label="Kosongkan nota" disabled={!cart.length} onClick={() => setDialog("clear")} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#83949e] hover:bg-[#f2f5f6] disabled:opacity-35"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          <div className="premium-scroll min-h-0 flex-1 overflow-y-auto">
            {cart.length ? cart.map(({ product, qty }) => (
              <article key={product.id} className="border-b border-[#edf1f5] px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-[9px] font-bold leading-snug text-[#2b4254]">{product.name}</h3>
                    <p className="mt-1 text-[8px] font-semibold text-[#718592]">@ {money(product.price)}</p>
                  </div>
                  <span className="shrink-0 text-[9px] font-extrabold tabular-nums text-[#253c50]">{money(product.price * qty)}</span>
                </div>
                <div className="mt-2.5 flex items-center justify-between">
                  <span className="text-[8px] font-semibold text-[#95a4ad]">Jumlah</span>
                  <div className="flex items-center gap-2">
                    <button aria-label={`Kurangi ${product.name}`} onClick={() => updateQty(product.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#e0e7eb] bg-white text-[#647a94] hover:bg-[#f0f5f6]"><Minus className="h-3 w-3" /></button>
                    <span className="w-4 text-center text-[10px] font-bold tabular-nums text-[#2a4155]">{qty}</span>
                    <button aria-label={`Tambah ${product.name}`} onClick={() => updateQty(product.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#d9e5e8] bg-[#f1f6f7] text-[#315f86] hover:bg-[#eaf1f3]"><Plus className="h-3 w-3" /></button>
                  </div>
                </div>
              </article>
            )) : (
              <div className="flex min-h-[210px] flex-col items-center justify-center px-5 text-center">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f0f5f6] text-[#8fa2ba]"><ShoppingCart className="h-5 w-5" /></div>
                <p className="text-[9px] font-extrabold uppercase tracking-[.12em] text-[#586f7f]">Nota kosong</p>
                <p className="mt-1.5 max-w-[180px] text-[8px] leading-relaxed text-[#8b9ca5]">Pilih produk dari katalog untuk memulai transaksi.</p>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-[#e1e8eb] bg-white px-3 pb-3 pt-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[8px] font-semibold text-[#8292a5]">Insentif kamu</span>
              <span className="flex items-center gap-1 text-[9px] font-bold tabular-nums text-[#315f86]"><Sparkles className="h-3 w-3" /> +{money(incentiveTotal)}</span>
            </div>
            <div className="mb-2.5 flex items-end justify-between border-t border-dashed border-[#e2e8eb] pt-2">
              <span className="text-[8px] font-bold uppercase tracking-[.12em] text-[#6f7f8b]">Total tagihan</span>
              <span className="text-[17px] font-extrabold leading-none tracking-[-.04em] tabular-nums text-[#20384c]">{money(total)}</span>
            </div>
            <button onClick={() => setDialog("checkout")} disabled={!cart.length} className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-[#315f86] px-3 text-[9px] font-extrabold uppercase tracking-[.12em] text-white shadow-[0_4px_10px_rgba(36,88,168,.18)] transition hover:bg-[#244764] disabled:cursor-not-allowed disabled:bg-[#b6c3d3] disabled:shadow-none">
              <CircleDollarSign className="h-4 w-4" /> Bayar & cetak nota
            </button>
            <button onClick={holdTransaction} disabled={!cart.length} className="mt-1.5 flex min-h-[36px] w-full items-center justify-center gap-2 rounded-xl border border-[#dfe7ea] bg-white text-[8px] font-bold uppercase tracking-[.11em] text-[#667b95] transition hover:border-[#ddd0b4] hover:bg-[#faf7f0] hover:text-[#8a7043] disabled:cursor-not-allowed disabled:opacity-45">
              <Hand className="h-3.5 w-3.5" /> Tahan transaksi
            </button>
            <p className="mt-2 text-center text-[7px] font-medium text-[#98a6ae]">Pratinjau lokal · tidak menyimpan transaksi</p>
          </div>
        </aside>
      </div>

      {notice && <div role="status" className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#253c50] px-3.5 py-2.5 text-[9px] font-semibold text-white shadow-lg"><Check className="h-3.5 w-3.5 text-[#c1d9ca]" />{notice}</div>}

      {dialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#1c3448]/35 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
          <div role="dialog" aria-modal="true" className="w-full max-w-[330px] rounded-2xl border border-[#e0e8ed] bg-white p-4 shadow-[0_18px_50px_rgba(21,40,68,.2)]">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="text-[8px] font-extrabold uppercase tracking-[.16em] text-[#84969f]">Alfath Pulsa</p>
                <h3 className="mt-1 text-[14px] font-extrabold text-[#253c50]">
                  {dialog === "scan" ? "Pindai barcode" : dialog === "held" ? "Transaksi ditahan" : dialog === "checkout" ? "Konfirmasi pembayaran" : dialog === "paid" ? "Pembayaran selesai" : "Kosongkan nota?"}
                </h3>
              </div>
              <button aria-label="Tutup" onClick={() => setDialog(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#84969f] hover:bg-[#f0f5f6]"><X className="h-4 w-4" /></button>
            </div>

            {dialog === "scan" && (
              <div>
                <p className="mb-3 text-[9px] leading-relaxed text-[#6f7f8b]">Masukkan kode contoh untuk mencari produk di katalog.</p>
                <input autoFocus value={barcodeValue} onChange={(event) => setBarcodeValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") confirmBarcode(); }} placeholder="Contoh: pulsa-25" className="h-10 w-full rounded-xl border border-[#d8e2e9] px-3 text-[10px] outline-none focus:border-[#88a8bd] focus:ring-2 focus:ring-[#315f86]/10" />
                <button onClick={confirmBarcode} className="mt-3 h-10 w-full rounded-xl bg-[#315f86] text-[9px] font-bold uppercase tracking-wider text-white hover:bg-[#244764]">Cari produk</button>
              </div>
            )}

            {dialog === "held" && (
              <div>
                {held.length ? <div className="max-h-[220px] space-y-2 overflow-y-auto">
                  {held.map((lines, index) => {
                    const heldTotal = lines.reduce((sum, line) => sum + line.product.price * line.qty, 0);
                    return <button key={`held-${index}`} onClick={() => { setCart(lines); setHeld((current) => current.filter((_, i) => i !== index)); setDialog(null); }} className="flex min-h-[54px] w-full items-center justify-between rounded-xl border border-[#e1e8eb] px-3 text-left hover:border-[#9ab5c6] hover:bg-[#f5f9fa]">
                      <span><b className="block text-[9px] text-[#3c5365]">Nota ditahan {index + 1}</b><small className="mt-1 block text-[8px] text-[#84969f]">{lines.reduce((sum, line) => sum + line.qty, 0)} item · ketuk untuk lanjutkan</small></span>
                      <span className="text-[9px] font-bold text-[#253c50]">{money(heldTotal)}</span>
                    </button>;
                  })}
                </div> : <p className="rounded-xl bg-[#f3f6f7] p-4 text-center text-[9px] text-[#8493a5]">Belum ada transaksi yang ditahan.</p>}
                <button onClick={() => setDialog(null)} className="mt-3 h-9 w-full rounded-xl border border-[#dfe7ea] text-[9px] font-bold text-[#607783]">Tutup</button>
              </div>
            )}

            {dialog === "checkout" && (
              <div>
                <p className="mb-3 text-[9px] text-[#6f7f8b]">Periksa ringkasan berikut. Aksi hanya simulasi lokal.</p>
                <div className="mb-3 rounded-xl bg-[#f3f6f7] px-3 py-2.5">
                  <div className="flex justify-between text-[9px] text-[#6f7f8b]"><span>{itemCount} item</span><span>Insentif {money(incentiveTotal)}</span></div>
                  <div className="mt-2 flex items-center justify-between border-t border-[#dfe7ea] pt-2"><b className="text-[9px] uppercase tracking-wide text-[#586f7f]">Total</b><b className="text-[13px] text-[#253c50]">{money(total)}</b></div>
                </div>
                <button onClick={() => setDialog("paid")} className="h-10 w-full rounded-xl bg-[#315f86] text-[9px] font-bold uppercase tracking-wider text-white hover:bg-[#244764]">Konfirmasi bayar</button>
              </div>
            )}

            {dialog === "paid" && (
              <div>
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-[#f0f6f3] p-3 text-[#47755f]"><Check className="h-4 w-4" /><span className="text-[9px] font-semibold">Nota siap dicetak · simulasi pratinjau</span></div>
                <p className="mb-3 text-[9px] text-[#6f7f8b]">Total dibayar <b className="text-[#253c50]">{money(total)}</b>. Tidak ada transaksi yang disimpan.</p>
                <button onClick={() => { setCart([]); setDialog(null); setNotice("Nota siap dicetak"); window.setTimeout(() => setNotice(""), 1700); }} className="h-10 w-full rounded-xl bg-[#315f86] text-[9px] font-bold uppercase tracking-wider text-white hover:bg-[#244764]">Selesai & mulai nota baru</button>
              </div>
            )}

            {dialog === "clear" && (
              <div>
                <p className="mb-4 text-[9px] leading-relaxed text-[#6f7f8b]">Semua item pada nota saat ini akan dihapus dari pratinjau.</p>
                <div className="flex gap-2">
                  <button onClick={() => setDialog(null)} className="h-10 flex-1 rounded-xl border border-[#dfe7ea] text-[9px] font-bold text-[#607783]">Batal</button>
                  <button onClick={() => { setCart([]); setDialog(null); }} className="h-10 flex-1 rounded-xl bg-[#315f86] text-[9px] font-bold text-white hover:bg-[#244764]">Kosongkan nota</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
