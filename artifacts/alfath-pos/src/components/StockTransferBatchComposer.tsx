import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Check, Plus, Search, Send, Trash2, X } from "lucide-react";
import { isProductVisibleInBranch } from "../lib/product-visibility";
import { api } from "../services/api";

type Branch = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  barcode?: string | null;
  brand?: string | null;
  category?: string | null;
  status?: string;
  visibleBranchIds?: string | null;
};
type Stock = { productId: string; branchId: string; qty: number };
type TransferItem = { id: string; productId: string; batchId?: string | null; [key: string]: any };

type Props = {
  sourceBranchId: string;
  branches: Branch[];
  products: Product[];
  stocks: Stock[];
  shiftOpen: boolean;
  confirm: (message: string) => Promise<boolean>;
  onCreated: (items: TransferItem[]) => void;
};

export default function StockTransferBatchComposer({
  sourceBranchId,
  branches,
  products,
  stocks,
  shiftOpen,
  confirm,
  onCreated,
}: Props) {
  const [targetBranchId, setTargetBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [manualPickerOpen, setManualPickerOpen] = useState(false);
  const [manualCategory, setManualCategory] = useState("Semua");
  const [manualPickerMessage, setManualPickerMessage] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const targetBranch = branches.find((branch) => branch.id === targetBranchId);
  const selectedProducts = selectedIds
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is Product => Boolean(product));
  const getStock = (productId: string) =>
    stocks.find((stock) => stock.productId === productId && stock.branchId === sourceBranchId)?.qty ?? 0;

  const eligibleProducts = useMemo(() => {
    if (!sourceBranchId || !targetBranchId) return [];
    return products
      .filter((product) => product.status !== "INACTIVE" && product.status !== "ARCHIVED")
      .filter((product) => isProductVisibleInBranch(product.visibleBranchIds, sourceBranchId))
      .filter((product) => isProductVisibleInBranch(product.visibleBranchIds, targetBranchId))
      .filter((product) => !selectedIds.includes(product.id) && getStock(product.id) > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [products, stocks, sourceBranchId, targetBranchId, selectedIds]);

  const availableProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    if (!query) return [];
    return eligibleProducts
      .filter((product) =>
        product.name.toLocaleLowerCase("id-ID").includes(query) ||
        String(product.barcode || "").toLocaleLowerCase("id-ID").includes(query) ||
        String(product.brand || "").toLocaleLowerCase("id-ID").includes(query),
      )
      .slice(0, 12);
  }, [eligibleProducts, search]);

  const manualCategories = useMemo(() => {
    const categories = [...new Set(eligibleProducts.map((product) => product.category?.trim() || "Lainnya"))]
      .sort((a, b) => a.localeCompare(b, "id"));
    return ["Semua", ...categories];
  }, [eligibleProducts]);
  const manualProducts = useMemo(
    () => manualCategory === "Semua"
      ? eligibleProducts
      : eligibleProducts.filter((product) => (product.category?.trim() || "Lainnya") === manualCategory),
    [eligibleProducts, manualCategory],
  );
  const selectedTotalQty = selectedProducts.reduce((sum, product) => {
    const qty = Number(quantities[product.id] || 0);
    return sum + (Number.isSafeInteger(qty) && qty > 0 ? qty : 0);
  }, 0);

  useEffect(() => {
    if (!manualPickerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setManualPickerOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [manualPickerOpen]);

  const addProduct = (productId: string) => {
    const product = products.find((candidate) => candidate.id === productId);
    setSelectedIds((current) => current.includes(productId) ? current : [...current, productId]);
    setQuantities((current) => ({ ...current, [productId]: current[productId] || "1" }));
    setSearch("");
    setError("");
    if (manualPickerOpen && product) {
      setManualPickerMessage(`${product.name} ditambahkan ke daftar kiriman.`);
    }
  };

  const removeProduct = (productId: string) => {
    setSelectedIds((current) => current.filter((id) => id !== productId));
    setQuantities((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  };

  const submit = async () => {
    setError("");
    setMessage("");
    if (!shiftOpen) {
      setError("Buka shift sebelum mengirim stok.");
      return;
    }
    if (!sourceBranchId || !targetBranchId || selectedIds.length === 0) {
      setError("Pilih cabang tujuan dan tambahkan minimal satu produk.");
      return;
    }
    const items = selectedProducts.map((product) => ({
      productId: product.id,
      qty: Number(quantities[product.id] || ""),
    }));
    const invalid = items.find(({ productId, qty }) =>
      !Number.isSafeInteger(qty) || qty <= 0 || qty > getStock(productId),
    );
    if (invalid) {
      const product = products.find((candidate) => candidate.id === invalid.productId);
      setError(`Jumlah ${product?.name || "produk"} harus 1–${getStock(invalid.productId)} pcs.`);
      return;
    }
    const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
    if (!(await confirm(
      `Kirim ${items.length} jenis produk (${totalQty} pcs) ke ${targetBranch?.name || "cabang tujuan"}? Stok sumber berkurang setelah kiriman dicatat.`,
    ))) return;

    setBusy(true);
    try {
      const result = await api.transferStockBatch({
        targetBranchId,
        items,
        note: note.trim() || undefined,
      });
      onCreated(result.items || []);
      setSelectedIds([]);
      setQuantities({});
      setNote("");
      setMessage(`Kiriman berhasil dicatat: ${items.length} jenis produk, ${totalQty} pcs. Menunggu konfirmasi cabang tujuan.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pengiriman stok gagal dicatat.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-label="Buat kiriman transfer stok">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
          <ArrowRightLeft className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-xs font-black uppercase text-slate-800 dark:text-slate-100">Kirim beberapa produk</h3>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Pilih cabang, susun daftar, lalu kirim sekali.</p>
        </div>
      </div>

      <label className="mb-2 block text-[10px] font-bold text-slate-600 dark:text-slate-300">
        Cabang tujuan
        <select
          aria-label="Cabang tujuan kiriman"
          value={targetBranchId}
          onChange={(event) => {
            setTargetBranchId(event.target.value);
            setSelectedIds([]);
            setQuantities({});
            setSearch("");
            setManualCategory("Semua");
            setManualPickerMessage("");
            setError("");
          }}
          disabled={!shiftOpen || busy}
          className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-800 outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">Pilih cabang tujuan</option>
          {branches.filter((branch) => branch.id !== sourceBranchId).map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </select>
      </label>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={targetBranchId ? "Cari nama, SKU, atau barcode..." : "Pilih cabang tujuan dahulu"}
          aria-label="Cari produk untuk kiriman"
          disabled={!shiftOpen || busy || !targetBranchId}
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-xs text-slate-800 outline-none focus:border-amber-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        {search.trim() && targetBranchId && (
          <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
            {availableProducts.length ? availableProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => addProduct(product.id)}
                className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-amber-50 dark:border-slate-700 dark:hover:bg-slate-700"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">{product.name}</span>
                  <span className="block text-[10px] text-slate-500">{product.barcode || product.brand || "Produk aktif"}</span>
                </span>
                <span className="shrink-0 text-[10px] font-black text-amber-800 dark:text-amber-300">
                  Stok {getStock(product.id)} <Plus className="ml-1 inline h-3 w-3" />
                </span>
              </button>
            )) : (
              <p className="p-3 text-xs text-slate-500">Tidak ada produk yang cocok dan stoknya tersedia.</p>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          setManualPickerMessage("");
          setManualPickerOpen(true);
        }}
        disabled={!shiftOpen || busy || !targetBranchId}
        className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-amber-400 bg-amber-50 px-3 text-[10px] font-black uppercase text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/15"
      >
        <Plus className="h-4 w-4" /> Pilih produk manual · kategori
      </button>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[430px] text-left text-[10px]" aria-label="Daftar produk dalam kiriman">
          <thead className="bg-slate-100 text-[9px] uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="px-2.5 py-2">Produk</th>
              <th className="w-20 px-2 py-2 text-right">Stok</th>
              <th className="w-24 px-2 py-2 text-center">Kirim pcs</th>
              <th className="w-10 px-2 py-2 text-center">Hapus</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {selectedProducts.map((product) => (
              <tr key={product.id} className="bg-white dark:bg-slate-900">
                <td className="max-w-[180px] px-2.5 py-2">
                  <span className="block truncate font-bold text-slate-800 dark:text-slate-100">{product.name}</span>
                  {product.barcode && <span className="block truncate text-[9px] text-slate-500">{product.barcode}</span>}
                </td>
                <td className="px-2 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">{getStock(product.id)}</td>
                <td className="px-2 py-2">
                  <input
                    type="number"
                    min="1"
                    max={getStock(product.id)}
                    step="1"
                    value={quantities[product.id] ?? "1"}
                    onChange={(event) => setQuantities((current) => ({
                      ...current,
                      [product.id]: event.target.value,
                    }))}
                    aria-label={`Jumlah ${product.name} untuk dikirim`}
                    disabled={!shiftOpen || busy}
                    className="min-h-9 w-full rounded-lg border border-slate-300 bg-slate-50 px-2 text-center text-xs font-bold text-slate-800 outline-none focus:border-amber-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => removeProduct(product.id)}
                    aria-label={`Hapus ${product.name} dari kiriman`}
                    disabled={busy}
                    className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {selectedProducts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-5 text-center text-xs text-slate-500">
                  Belum ada produk. Cari produk lalu tekan Tambah.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        placeholder="Catatan kiriman (opsional)"
        disabled={!shiftOpen || busy}
        className="mt-2 min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs text-slate-800 outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      />
      {(error || message) && (
        <p role={error ? "alert" : "status"} className={`mt-2 rounded-lg px-2.5 py-2 text-[10px] font-semibold ${error ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"}`}>
          {error || message}
        </p>
      )}
      {!shiftOpen && <p className="mt-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Buka shift untuk mengirim atau memproses transfer.</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!shiftOpen || busy || selectedProducts.length === 0 || !targetBranchId}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 text-xs font-black uppercase text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Send className="h-4 w-4" />
        {busy ? "Mengirim..." : `Kirim ${selectedProducts.length} jenis produk`}
      </button>

      {manualPickerOpen && (
        <div
          className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-950/70 p-0 sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setManualPickerOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="transfer-manual-picker-title"
            className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-3 dark:border-slate-700">
              <div className="min-w-0">
                <h4 id="transfer-manual-picker-title" className="text-sm font-black text-slate-900 dark:text-slate-100">
                  Pilih produk manual
                </h4>
                <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                  {targetBranch?.name} · {eligibleProducts.length} produk tersedia · {selectedProducts.length} dipilih
                </p>
              </div>
              <button
                type="button"
                aria-label="Tutup pemilih produk"
                onClick={() => setManualPickerOpen(false)}
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <nav aria-label="Kategori produk" className="flex gap-2 overflow-x-auto border-b border-slate-200 px-3 py-2 dark:border-slate-700">
              {manualCategories.map((category) => {
                const count = category === "Semua"
                  ? eligibleProducts.length
                  : eligibleProducts.filter((product) => (product.category?.trim() || "Lainnya") === category).length;
                return (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={manualCategory === category}
                    onClick={() => setManualCategory(category)}
                    className={`min-h-9 shrink-0 rounded-lg px-3 text-[10px] font-bold ${manualCategory === category
                      ? "bg-amber-500 text-slate-950"
                      : "border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                  >
                    {category} ({count})
                  </button>
                );
              })}
            </nav>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {manualPickerMessage && (
                <p role="status" className="mb-2 flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-2 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
                  <Check className="h-3.5 w-3.5 shrink-0" /> {manualPickerMessage}
                </p>
              )}
              {manualProducts.length ? (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                  {manualProducts.map((product) => (
                    <div key={product.id} className="flex min-h-14 items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{product.name}</p>
                        <p className="truncate text-[9px] text-slate-500 dark:text-slate-400">
                          {[product.category, product.barcode || product.brand].filter(Boolean).join(" · ") || "Produk aktif"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">Stok {getStock(product.id)}</span>
                        <button
                          type="button"
                          onClick={() => addProduct(product.id)}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-amber-500 px-2.5 text-[10px] font-black text-slate-950 hover:bg-amber-400"
                        >
                          <Plus className="h-3.5 w-3.5" /> Tambah
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500 dark:border-slate-700">
                  Tidak ada produk tersedia di kategori ini.
                </p>
              )}
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-2.5 dark:border-slate-700">
              <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                Dipilih: {selectedProducts.length} jenis · {selectedTotalQty} pcs
              </p>
              <button
                type="button"
                onClick={() => setManualPickerOpen(false)}
                className="min-h-9 rounded-lg bg-slate-900 px-4 text-[10px] font-black uppercase text-white dark:bg-amber-500 dark:text-slate-950"
              >
                Selesai
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
