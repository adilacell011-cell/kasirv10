import { useEffect, useState } from "react";
import { ArrowDownToLine, Clock3, LoaderCircle, PackageCheck } from "lucide-react";
import { api } from "../services/api";

type StockInRecord = {
  id: string;
  productId: string;
  branchId: string;
  qty: number;
  type: string;
  reason?: string | null;
  createdAt: string;
  product: { id: string; name: string; barcode?: string | null };
  branch: { id: string; name: string };
  relatedTransfer?: {
    id: string;
    batchId?: string | null;
    sourceBranch: { id: string; name: string };
    targetBranch: { id: string; name: string };
    receivedAt?: string | null;
    receivedBy?: { id: string; name: string } | null;
    returnOf?: {
      id: string;
      batchId?: string | null;
      product: { id: string; name: string; barcode?: string | null };
    } | null;
    skuCorrections?: Array<{
      receivedAt?: string | null;
      receivedBy?: { id: string; name: string } | null;
    }>;
  } | null;
};

type HistoryPage = {
  items: StockInRecord[];
  hasMore: boolean;
  nextCursor: string | null;
};

const PAGE_SIZE = 25;

const typeLabels: Record<string, string> = {
  STOCK_IN: "Stok masuk manual",
  TRANSFER_IN: "Transfer diterima",
  TRANSFER_SKU_CORRECTION_IN: "SKU koreksi diterima",
  TRANSFER_SKU_CORRECTION_RESTORE: "Pemulihan stok koreksi",
  TRANSFER_RETURN_IN: "Retur diterima",
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function StockInHistory({ branchId }: { branchId?: string | null }) {
  const [items, setItems] = useState<StockInRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setItems([]);
    setNextCursor(null);
    setHasMore(false);
    setError("");
    setLoading(true);
    api.getStockInHistory({ branchId: branchId || undefined, limit: PAGE_SIZE }, controller.signal)
      .then((page: HistoryPage) => {
        if (!page || !Array.isArray(page.items)) throw new Error("Respons riwayat stok masuk tidak valid.");
        setItems(page.items);
        setHasMore(Boolean(page.hasMore));
        setNextCursor(page.nextCursor || null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Riwayat stok masuk gagal dimuat.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [branchId]);

  const loadOlder = async () => {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const page = await api.getStockInHistory({
        branchId: branchId || undefined,
        limit: PAGE_SIZE,
        cursor: nextCursor,
      }) as HistoryPage;
      if (!page || !Array.isArray(page.items)) throw new Error("Respons riwayat stok masuk tidak valid.");
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !known.has(item.id))];
      });
      setHasMore(Boolean(page.hasMore));
      setNextCursor(page.nextCursor || null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Riwayat stok masuk gagal dimuat.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      aria-label="Riwayat stok masuk ke cabang"
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-black uppercase text-slate-800 dark:text-slate-100">
            <ArrowDownToLine className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Stok masuk ke cabang
          </h3>
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            Hanya penambahan stok yang sudah tercatat. Transfer menunggu penerimaan tidak masuk di sini.
          </p>
          <p className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            Cabang: {branchId ? items[0]?.branch.name || "Cabang terpilih" : "Semua cabang"}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {items.length} catatan
        </span>
      </header>

      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-6 text-xs text-slate-500 dark:border-slate-700">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Memuat riwayat stok masuk...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-700">
          Belum ada penambahan stok yang tercatat untuk cabang ini.
        </div>
      ) : (
        <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
          {items.map((item) => {
            const correctionReceiver = item.relatedTransfer?.skuCorrections?.[0]?.receivedBy;
            const receiver = correctionReceiver || item.relatedTransfer?.receivedBy;
            const relatedAt = item.relatedTransfer?.skuCorrections?.[0]?.receivedAt ||
              item.relatedTransfer?.receivedAt;
            const reference = item.relatedTransfer
              ? item.relatedTransfer.batchId || item.relatedTransfer.id
              : "";
            const originalReference = item.relatedTransfer?.returnOf
              ? item.relatedTransfer.returnOf.batchId || item.relatedTransfer.returnOf.id
              : "";
            return (
              <article
                key={item.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-slate-800 dark:text-slate-100">{item.product.name}</p>
                    {item.product.barcode && (
                      <p className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">{item.product.barcode}</p>
                    )}
                  </div>
                  <strong className="shrink-0 text-sm font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                    +{item.qty} pcs
                  </strong>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                    {typeLabels[item.type] || "Penambahan stok"}
                  </span>
                  <span className="rounded-full bg-white px-2 py-1 text-[9px] font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                    {item.branch.name}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[9px] text-slate-500 dark:text-slate-400">
                    <Clock3 className="h-3 w-3" /> {formatDateTime(item.createdAt)}
                  </span>
                </div>
                {item.relatedTransfer && (
                  <p className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300">
                    <PackageCheck className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      Dari {item.relatedTransfer.sourceBranch.name}
                      {reference ? ` · Rujukan ${reference.slice(0, 8).toUpperCase()}` : ""}
                      {originalReference ? ` · Transfer asal ${originalReference.slice(0, 8).toUpperCase()}` : ""}
                      {item.relatedTransfer.returnOf?.product.name ? ` · ${item.relatedTransfer.returnOf.product.name}` : ""}
                      {receiver?.name ? ` · Dikonfirmasi ${receiver.name}` : ""}
                      {relatedAt ? ` · ${formatDateTime(relatedAt)}` : ""}
                    </span>
                  </p>
                )}
                {item.reason && (
                  <p className="mt-2 break-words border-t border-slate-200 pt-2 text-[10px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Keterangan: {item.reason}
                  </p>
                )}
              </article>
            );
          })}
          {hasMore && (
            <button
              type="button"
              onClick={() => void loadOlder()}
              disabled={loadingMore}
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {loadingMore && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {loadingMore ? "Memuat..." : "Muat riwayat stok masuk sebelumnya"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
