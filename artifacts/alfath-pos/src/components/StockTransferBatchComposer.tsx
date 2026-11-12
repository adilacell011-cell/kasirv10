import { useMemo, useState } from "react";
import { ArrowRightLeft, Plus, Search, Send, Trash2 } from "lucide-react";
import { isProductVisibleInBranch } from "../lib/product-visibility";
import { api } from "../services/api";

type Branch = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  barcode?: string | null;
  brand?: string | null;
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
  onCreated: (items: TransferItem[]) => void;
};

export default function StockTransferBatchComposer({
  sourceBranchId,
  branches,
  products,
  stocks,
  shiftOpen,
  onCreated,
}: Props) {
  const [targetBranchId, setTargetBranchId] = useState("");
  const [search, setSearch] = useState("");
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

  const availableProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    if (!sourceBranchId || !targetBranchId || !query) return [];
    return products
      .filter((product) => product.status !== "INACTIVE" && product.status !== "ARCHIVED")
      .filter((product) => isProductVisibleInBranch(product.visibleBranchIds, sourceBranchId))
      .filter((product) => isProductVisibleInBranch(product.visibleBranchIds, targetBranchId))
      .filter((product) =>
        product.name.toLocaleLowerCase("id-ID").includes(query) ||
        String(product.barcode || "").toLocaleLowerCase("id-ID").includes(query) ||
        String(product.brand || "").toLocaleLowerCase("id-ID").includes(query),
      )
      .filter((product) => !selectedIds.includes(product.id) && getStock(product.id) > 0)
      .slice(0, 12);
  }, [products, stocks, sourceBranchId, targetBranchId, search, selectedIds]);

  const addProduct = (productId: string) => {
    setSelectedIds((current) => current.includes(productId) ? current : [...current, productId]);
    setQuantities((current) => ({ ...current, [productId]: current[productId] || "1" }));
    setSearch("");
    setError("");
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
    if (!window.confirm(
      `Kirim ${items.length} jenis produk (${totalQty} pcs) ke ${targetBranch?.name || "cabang tujuan"}? Stok sumber berkurang setelah kiriman dicatat.`,
    )) return;

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
    </section>
  );
}
