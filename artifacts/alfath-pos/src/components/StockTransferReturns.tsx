import { useMemo, useState } from "react";
import { ArrowRightLeft, Check, Clock3, LoaderCircle, PackageCheck, RotateCcw } from "lucide-react";
import { api } from "../services/api";

type Branch = { id: string; name: string };
type Product = { id: string; name: string; barcode?: string | null };
type Transfer = {
  id: string;
  batchId?: string | null;
  returnOfId?: string | null;
  kind: "REQUEST" | "DIRECT" | "RETURN";
  status: "REQUESTED" | "ACCEPTED" | "IN_TRANSIT" | "RETURN_PENDING" | "RECEIVED" | "RETURNED" | "REJECTED" | "CANCELLED";
  requestedQty: number | null;
  approvedQty: number | null;
  dispatchedQty: number | null;
  receivedQty: number | null;
  requestNote?: string | null;
  discrepancyNote?: string | null;
  createdAt: string;
  dispatchedAt?: string | null;
  receivedAt?: string | null;
  product: Product;
  sourceBranch: Branch;
  targetBranch: Branch;
  returnOf?: {
    id: string;
    batchId?: string | null;
    status: string;
    dispatchedQty?: number | null;
    product: Product;
  } | null;
  returnableQty?: number | null;
  returnableProduct?: Product | null;
};
type Props = {
  role: string;
  branchId?: string | null;
  transfers: Transfer[];
  loading: boolean;
  error?: string;
  shiftOpen: boolean;
  confirm: (message: string) => Promise<boolean>;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onUpdated: (transfer: Transfer) => void;
};

const dateLabel = (value: string) =>
  new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const groupTransfers = (items: Transfer[]) => {
  const groups = new Map<string, Transfer[]>();
  for (const transfer of items) {
    const key = transfer.batchId || transfer.id;
    const group = groups.get(key) || [];
    group.push(transfer);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([batchId, rows]) => ({
      batchId,
      items: rows.sort((a, b) => a.product.name.localeCompare(b.product.name, "id")),
      createdAt: Math.max(...rows.map((row) => new Date(row.createdAt).getTime())),
      pending: rows.some((row) => row.status === "IN_TRANSIT"),
    }))
    .sort((a, b) =>
      Number(b.pending) - Number(a.pending) ||
      b.createdAt - a.createdAt,
    );
};

export default function StockTransferReturns({
  role,
  branchId,
  transfers,
  loading,
  error: loadError = "",
  shiftOpen,
  confirm,
  hasMore,
  loadingMore,
  onLoadMore,
  onUpdated,
}: Props) {
  const isCashier = role === "CASHIER";
  const [selectedBatch, setSelectedBatch] = useState("");
  const [selectedLines, setSelectedLines] = useState<Record<string, boolean>>({});
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [returnNote, setReturnNote] = useState("");
  const [receiptQty, setReceiptQty] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const availableGroups = useMemo(() => {
    const available = transfers.filter((transfer) =>
      transfer.kind !== "RETURN" &&
      transfer.status === "RECEIVED" &&
      (transfer.returnableQty ?? 0) > 0 &&
      (isCashier
        ? transfer.targetBranch.id === branchId
        : !branchId || transfer.targetBranch.id === branchId),
    );
    return groupTransfers(available);
  }, [branchId, isCashier, transfers]);
  const activeBatch = availableGroups.find((group) => group.batchId === selectedBatch) || availableGroups[0];
  const returnGroups = useMemo(
    () => groupTransfers(transfers.filter((transfer) => transfer.kind === "RETURN")),
    [transfers],
  );

  const activeItems = activeBatch?.items || [];
  const selectedReturnItems = activeItems.filter((item) => selectedLines[item.id]);
  const invalidReturnQty = selectedReturnItems.some((item) => {
    const qty = Number(returnQty[item.id] ?? "1");
    return !Number.isSafeInteger(qty) || qty < 1 || qty > (item.returnableQty ?? 0);
  });
  const canSubmitReturn = selectedReturnItems.length > 0 && !invalidReturnQty && (!isCashier || shiftOpen);

  const createReturn = async () => {
    if (!activeBatch || !canSubmitReturn || busyId) return;
    const lines = selectedReturnItems.map((item) => ({
      transferId: item.id,
      qty: Number(returnQty[item.id] ?? "1"),
    }));
    const total = lines.reduce((sum, item) => sum + item.qty, 0);
    if (!(await confirm(
      `Kirim retur ${lines.length} produk sebanyak ${total} pcs dari ${activeItems[0]?.targetBranch.name} ` +
      `ke ${activeItems[0]?.sourceBranch.name}? Stok cabang pengirim berkurang saat retur dikirim.`,
    ))) return;

    setBusyId(activeBatch.batchId);
    setError("");
    setMessage("");
    try {
      const result = await api.createStockTransferReturn({
        items: lines,
        note: returnNote.trim() || undefined,
      }) as { items?: Transfer[] };
      if (!Array.isArray(result?.items)) throw new Error("Respons kiriman retur tidak valid.");
      result.items.forEach(onUpdated);
      setSelectedLines({});
      setReturnQty({});
      setReturnNote("");
      setMessage("Retur dikirim. Stok cabang asal bertambah setelah cabang penerima mengonfirmasi barang.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Retur stok gagal dikirim.");
    } finally {
      setBusyId("");
    }
  };

  const receiveReturn = async (group: (typeof returnGroups)[number]) => {
    if (busyId) return;
    const receipts = group.items.map((item) => ({
      transferId: item.id,
      receivedQty: item.returnOf?.status === "RETURN_PENDING"
        ? (item.dispatchedQty ?? 0)
        : Number(receiptQty[item.id] ?? String(item.dispatchedQty ?? 0)),
    }));
    const invalid = group.items.find((item, index) => {
      const qty = receipts[index]!.receivedQty;
      const fullLineReturn = item.returnOf?.status === "RETURN_PENDING";
      return !Number.isSafeInteger(qty) || qty < 0 || qty > (item.dispatchedQty ?? 0) ||
        (fullLineReturn && qty !== item.dispatchedQty);
    });
    if (invalid) {
      setError(`${invalid.product.name}: isi jumlah yang benar-benar diterima.`);
      return;
    }
    const totalSent = group.items.reduce((sum, item) => sum + (item.dispatchedQty ?? 0), 0);
    const totalReceived = receipts.reduce((sum, item) => sum + item.receivedQty, 0);
    if (!(await confirm(
      `Konfirmasi penerimaan retur ${group.items.length} produk? Total dikirim ${totalSent} pcs, ` +
      `yang akan masuk ke stok cabang ini ${totalReceived} pcs.`,
    ))) return;

    setBusyId(group.batchId);
    setError("");
    setMessage("");
    try {
      const result = await api.receiveStockTransferReturnBatch(group.batchId, { items: receipts }) as {
        items?: Transfer[];
      };
      if (!Array.isArray(result?.items)) throw new Error("Respons konfirmasi retur tidak valid.");
      result.items.forEach(onUpdated);
      setMessage(group.items.some((item) => item.returnOf?.status === "RETURN_PENDING")
        ? "Retur SKU diterima. Stok SKU pada kiriman awal dipulihkan ke cabang asal."
        : "Penerimaan retur tercatat sesuai jumlah fisik yang dikonfirmasi.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Konfirmasi retur gagal.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <section
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      aria-label="Retur stok antar cabang"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xs font-black uppercase text-slate-800 dark:text-slate-100">
            <RotateCcw className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Retur stok antar cabang
          </h3>
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            Untuk retur biasa, stok pengirim berkurang saat barang dikirim. Untuk penolakan SKU, stok asal pulih setelah barang dikonfirmasi kembali.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          {returnGroups.length} kiriman retur
        </span>
      </header>

      {(loadError || error || message) && (
        <p
          role={loadError || error ? "alert" : "status"}
          className={`rounded-lg px-3 py-2 text-[11px] font-semibold ${
            loadError || error
              ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
              : "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
          }`}
        >
          {error || loadError || message}
        </p>
      )}

      <section className="rounded-xl border border-slate-200 p-3 dark:border-slate-700" aria-label="Buat retur">
        <div className="mb-2">
          <h4 className="text-[11px] font-black text-slate-800 dark:text-slate-100">Kirim barang kembali</h4>
          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
            Pilih kiriman yang sudah diterima, lalu catat produk dan jumlah yang benar-benar dikembalikan.
          </p>
        </div>
        {availableGroups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-[10px] text-slate-500 dark:border-slate-700">
            Belum ada produk diterima yang dapat diretur pada riwayat yang dimuat.
          </p>
        ) : (
          <>
            <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300">
              Pilih kiriman asal
              <select
                value={activeBatch?.batchId || ""}
                onChange={(event) => setSelectedBatch(event.target.value)}
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {availableGroups.map((group) => {
                  const first = group.items[0]!;
                  return (
                    <option key={group.batchId} value={group.batchId}>
                      {first.sourceBranch.name} → {first.targetBranch.name} · {group.items.length} produk · {dateLabel(first.receivedAt || first.createdAt)}
                    </option>
                  );
                })}
              </select>
            </label>
            {activeBatch && (
              <div className="mt-2 space-y-2">
                {activeItems.map((item) => {
                  const availableQty = item.returnableQty ?? 0;
                  const product = item.returnableProduct || item.product;
                  const checked = Boolean(selectedLines[item.id]);
                  return (
                    <article key={item.id} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                      <div className="flex items-start gap-2">
                        <input
                          aria-label={`Pilih ${product.name} untuk retur`}
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const isChecked = event.target.checked;
                            setSelectedLines((current) => ({ ...current, [item.id]: isChecked }));
                            if (isChecked && !returnQty[item.id]) {
                              setReturnQty((current) => ({ ...current, [item.id]: "1" }));
                            }
                          }}
                          className="mt-1 h-4 w-4 accent-amber-500"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-black text-slate-800 dark:text-slate-100">{product.name}</p>
                          {item.returnOf?.product.name !== product.name && item.returnOf?.product.name && (
                            <p className="truncate text-[9px] text-amber-700 dark:text-amber-300">
                              SKU diterima setelah koreksi dari {item.returnOf.product.name}
                            </p>
                          )}
                          <p className="text-[9px] text-slate-500 dark:text-slate-400">
                            Diterima {item.receivedQty ?? 0} pcs · Sisa dapat diretur {availableQty} pcs
                          </p>
                        </div>
                        <input
                          aria-label={`Jumlah retur ${product.name}`}
                          type="number"
                          min={1}
                          max={availableQty}
                          step={1}
                          value={returnQty[item.id] ?? "1"}
                          disabled={!checked}
                          onChange={(event) => setReturnQty((current) => ({ ...current, [item.id]: event.target.value }))}
                          className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-2 text-center text-xs font-black text-slate-800 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            <label className="mt-2 block text-[10px] font-bold text-slate-600 dark:text-slate-300">
              Catatan retur · opsional
              <input
                value={returnNote}
                onChange={(event) => setReturnNote(event.target.value)}
                maxLength={500}
                placeholder="Contoh: salah kirim SKU"
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            {isCashier && !shiftOpen && (
              <p className="mt-2 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                Buka shift sebelum mencatat pengiriman retur.
              </p>
            )}
            <button
              type="button"
              onClick={() => void createReturn()}
              disabled={!canSubmitReturn || Boolean(busyId)}
              className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 text-xs font-black text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyId === activeBatch?.batchId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
              Kirim retur terpilih
            </button>
          </>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 p-3 dark:border-slate-700" aria-label="Riwayat dan konfirmasi retur">
        <h4 className="mb-2 text-[11px] font-black text-slate-800 dark:text-slate-100">Riwayat dan konfirmasi</h4>
        {loading && returnGroups.length === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 p-4 text-[10px] text-slate-500 dark:border-slate-700">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Memuat retur...
          </div>
        ) : returnGroups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-[10px] text-slate-500 dark:border-slate-700">
            Belum ada catatan retur stok.
          </p>
        ) : (
          <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
            {returnGroups.map((group) => {
              const first = group.items[0]!;
              const allPending = group.items.every((item) => item.status === "IN_TRANSIT");
              const canReceive = !isCashier || first.targetBranch.id === branchId;
              return (
                <article key={group.batchId} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                  <header className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-200">
                        Retur {group.batchId.slice(0, 8).toUpperCase()} · {group.items.length} produk
                      </p>
                      <p className="mt-0.5 truncate text-[9px] text-slate-500 dark:text-slate-400">
                        {first.sourceBranch.name} → {first.targetBranch.name} · {dateLabel(first.dispatchedAt || first.createdAt)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${
                      allPending
                        ? "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
                        : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                    }`}>
                      {allPending ? "Menunggu penerimaan" : "Selesai"}
                    </span>
                  </header>
                  <div className="mt-2 space-y-2">
                    {group.items.map((item) => {
                      const sentQty = item.dispatchedQty ?? 0;
                      const actualQty = Number(receiptQty[item.id] ?? String(sentQty));
                      return (
                        <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900/70">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[10px] font-black text-slate-800 dark:text-slate-100">{item.product.name}</p>
                              <p className="truncate text-[9px] text-slate-500 dark:text-slate-400">
                                Untuk transfer asal {item.returnOf?.batchId?.slice(0, 8).toUpperCase() || item.returnOfId?.slice(0, 8).toUpperCase() || "—"}
                                {item.returnOf?.product.name ? ` · ${item.returnOf.product.name}` : ""}
                              </p>
                            </div>
                            <span className="shrink-0 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                              {item.receivedQty == null ? `Dikirim ${sentQty}` : `Diterima ${item.receivedQty}/${sentQty}`} pcs
                            </span>
                          </div>
                          {item.status === "IN_TRANSIT" && canReceive && (
                            <div className="mt-2">
                              {item.returnOf?.status === "RETURN_PENDING" ? (
                                <p className="text-[9px] font-semibold text-amber-800 dark:text-amber-300">
                                  Retur penolakan SKU harus diterima utuh: {sentQty} pcs.
                                </p>
                              ) : (
                                <label className="block text-[9px] font-bold text-slate-600 dark:text-slate-300">
                                  Jumlah fisik
                                  <input
                                    type="number"
                                    min={0}
                                    max={sentQty}
                                    step={1}
                                    value={receiptQty[item.id] ?? String(sentQty)}
                                    onChange={(event) => setReceiptQty((current) => ({ ...current, [item.id]: event.target.value }))}
                                    className="mt-1 min-h-9 w-24 rounded-lg border border-slate-300 bg-white px-2 text-center text-xs font-black text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                  />
                                </label>
                              )}
                              {item.returnOf?.status !== "RETURN_PENDING" && actualQty !== sentQty && (
                                <p className="mt-1 text-[9px] font-semibold text-amber-800 dark:text-amber-300">
                                  Stok hanya bertambah sesuai jumlah fisik yang dikonfirmasi.
                                </p>
                              )}
                            </div>
                          )}
                          {item.discrepancyNote && (
                            <p className="mt-2 text-[9px] text-slate-500 dark:text-slate-400">
                              Catatan tersimpan: {item.discrepancyNote}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {allPending && canReceive ? (
                    <button
                      type="button"
                      onClick={() => void receiveReturn(group)}
                      disabled={Boolean(busyId) || (isCashier && !shiftOpen)}
                      className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 text-xs font-black text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyId === group.batchId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Konfirmasi barang retur diterima
                    </button>
                  ) : allPending ? (
                    <p className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                      <Clock3 className="h-3.5 w-3.5" /> Menunggu cabang asal mengonfirmasi barang fisik.
                    </p>
                  ) : (
                    <p className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      <PackageCheck className="h-3.5 w-3.5" /> Stok cabang tujuan bertambah sesuai jumlah yang dikonfirmasi.
                    </p>
                  )}
                </article>
              );
            })}
            {hasMore && (
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                {loadingMore && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {loadingMore ? "Memuat..." : "Muat riwayat retur sebelumnya"}
              </button>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
