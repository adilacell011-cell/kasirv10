import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Check,
  Clock3,
  PackageCheck,
  Send,
  X,
} from "lucide-react";
import StockTransferBatchComposer from "./StockTransferBatchComposer";
import StockTransferBatchReceiptTable from "./StockTransferBatchReceiptTable";
import StockTransferBatchSenderTable from "./StockTransferBatchSenderTable";
import { api } from "../services/api";

type Branch = { id: string; name: string };
type Product = { id: string; name: string; barcode?: string | null; brand?: string | null; status?: string };
type SkuCorrection = {
  id: string;
  actualProductId: string;
  actualQty: number;
  note: string;
  status: "PENDING_SOURCE" | "APPROVED_PENDING_RECEIPT" | "REJECTED" | "RECEIVED";
  responseNote?: string | null;
  actualProduct: { id: string; name: string; barcode?: string | null };
  reportedBy?: { name?: string | null } | null;
  reviewedBy?: { name?: string | null } | null;
  createdAt: string;
};
type Transfer = {
  id: string;
  batchId?: string | null;
  kind: "REQUEST" | "DIRECT";
  status: "REQUESTED" | "ACCEPTED" | "IN_TRANSIT" | "RECEIVED" | "REJECTED" | "CANCELLED";
  requestedQty: number | null;
  approvedQty: number | null;
  dispatchedQty: number | null;
  receivedQty: number | null;
  requestNote?: string | null;
  responseNote?: string | null;
  discrepancyNote?: string | null;
  createdAt: string;
  product: { id: string; name: string; barcode?: string | null };
  sourceBranch: Branch;
  targetBranch: Branch;
  skuCorrections?: SkuCorrection[];
};

type Props = {
  role: string;
  branchId?: string | null;
  branches: Branch[];
  products: Product[];
  stocks: Array<{ productId: string; branchId: string; qty: number }>;
  transfers: Transfer[];
  loading?: boolean;
  error?: string;
  shiftOpen: boolean;
  onUpdated: (transfer: Transfer) => void;
};

const statusLabels: Record<Transfer["status"], string> = {
  REQUESTED: "Menunggu jawaban cabang sumber",
  ACCEPTED: "Disetujui, menunggu pengiriman",
  IN_TRANSIT: "Dalam perjalanan",
  RECEIVED: "Sudah diterima",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan sebelum dikirim",
};

const isOpen = (transfer: Transfer) =>
  ["REQUESTED", "ACCEPTED", "IN_TRANSIT"].includes(transfer.status);

export default function StockTransferActivity({
  role,
  branchId,
  branches,
  products,
  stocks,
  transfers,
  loading = false,
  error: loadError = "",
  shiftOpen,
  onUpdated,
}: Props) {
  const isCashier = role === "CASHIER";
  const [acceptQty, setAcceptQty] = useState<Record<string, string>>({});
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [receiveNotes, setReceiveNotes] = useState<Record<string, string>>({});
  const [receiveIssueOpen, setReceiveIssueOpen] = useState<Record<string, boolean>>({});
  const [skuCorrectionOpen, setSkuCorrectionOpen] = useState<Record<string, boolean>>({});
  const [actualProductIdByTransfer, setActualProductIdByTransfer] = useState<Record<string, string>>({});
  const [actualQtyByTransfer, setActualQtyByTransfer] = useState<Record<string, string>>({});
  const [skuCorrectionNotes, setSkuCorrectionNotes] = useState<Record<string, string>>({});
  const [skuCorrectionResponseNotes, setSkuCorrectionResponseNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const transferGroups = useMemo(() => {
    const groups = new Map<string, Transfer[]>();
    for (const transfer of transfers) {
      const key = transfer.batchId || transfer.id;
      const rows = groups.get(key) || [];
      rows.push(transfer);
      groups.set(key, rows);
    }
    return [...groups.entries()]
      .map(([batchId, items]) => ({
        batchId,
        items: items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
        createdAt: Math.max(...items.map((item) => new Date(item.createdAt).getTime())),
        open: items.some(isOpen),
      }))
      .sort((a, b) => Number(b.open) - Number(a.open) || b.createdAt - a.createdAt)
      .slice(0, 60);
  }, [transfers]);

  const orderedTransfers = useMemo(
    () => transferGroups.flatMap((group) => group.items),
    [transferGroups],
  );
  const transferGroupById = useMemo(() => {
    const map = new Map<string, (typeof transferGroups)[number]>();
    for (const group of transferGroups) {
      for (const item of group.items) map.set(item.id, group);
    }
    return map;
  }, [transferGroups]);

  const run = async (id: string, action: () => Promise<Transfer>) => {
    if (busyId) return;
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      const transfer = await action();
      onUpdated(transfer);
      setMessage("Perubahan transfer tersimpan.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Aksi transfer gagal.");
    } finally {
      setBusyId("");
    }
  };

  const submitSkuCorrection = async (transfer: Transfer) => {
    const actualProductId = actualProductIdByTransfer[transfer.id] || "";
    const actualQty = Number(actualQtyByTransfer[transfer.id] || "");
    const note = skuCorrectionNotes[transfer.id]?.trim() || "";
    if (!actualProductId || !Number.isSafeInteger(actualQty) || actualQty <= 0 || !note) {
      setError("Pilih SKU yang benar, isi jumlah aktual, dan jelaskan koreksinya.");
      return;
    }
    if (!shiftOpen) {
      setError("Buka shift sebelum melaporkan penerimaan transfer.");
      return;
    }
    await run(transfer.id, () => api.reportStockTransferSkuCorrection(transfer.id, {
      actualProductId,
      actualQty,
      note,
    }));
    setSkuCorrectionOpen((state) => ({ ...state, [transfer.id]: false }));
  };

  const reviewSkuCorrection = async (
    transfer: Transfer,
    correction: SkuCorrection,
    action: "APPROVE" | "REJECT",
  ) => {
    const responseNote = skuCorrectionResponseNotes[transfer.id]?.trim() || "";
    if (action === "REJECT" && !responseNote) {
      setError("Alasan menolak koreksi SKU wajib diisi.");
      return;
    }
    if (action === "APPROVE" && !window.confirm(
      `Setujui koreksi ${transfer.product.name} menjadi ${correction.actualProduct.name}? ` +
      `Stok cabang pengirim akan dikoreksi dan cabang penerima harus mengonfirmasi barang aktual.`,
    )) return;
    await run(transfer.id, () => api.reviewStockTransferSkuCorrection(transfer.id, correction.id, {
      action,
      responseNote: responseNote || undefined,
    }));
  };

  const confirmCorrectedReceipt = (transfer: Transfer, correction: SkuCorrection) =>
    void run(transfer.id, () => api.receiveStockTransferSkuCorrection(transfer.id, correction.id));

  return (
    <section className="mt-4 space-y-3 text-left" aria-label="Aktivitas transfer stok">
      {isCashier && branchId && (
        <StockTransferBatchComposer
          sourceBranchId={branchId}
          branches={branches}
          products={products}
          stocks={stocks}
          shiftOpen={shiftOpen}
          onCreated={(items) => {
            for (const item of items) onUpdated(item as unknown as Transfer);
          }}
        />
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-black uppercase text-slate-800 dark:text-slate-100">Kiriman & penerimaan</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">Stok tujuan masuk setelah kasir penerima mengonfirmasi.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{orderedTransfers.length}</span>
        </div>

        {loadError && (
          <p role="alert" className="mb-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {loadError}
          </p>
        )}
        {(error || message) && (
          <p role={error ? "alert" : "status"} className={`mb-2 rounded-lg px-2.5 py-2 text-[11px] font-semibold ${error ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"}`}>
            {error || message}
          </p>
        )}

        {loading && orderedTransfers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500 dark:border-slate-700">
            Memuat daftar transfer...
          </div>
        ) : orderedTransfers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500 dark:border-slate-700">
            Belum ada kiriman atau penerimaan stok.
          </div>
        ) : (
          <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
            {orderedTransfers.map((transfer) => {
              const group = transferGroupById.get(transfer.id);
              const isFirstInGroup = group?.items[0]?.id === transfer.id;
              const canManageSource = role !== "CASHIER" || transfer.sourceBranch.id === branchId;
              const canReceive = isCashier && transfer.targetBranch.id === branchId;
              const isBusy = busyId === transfer.id;
              const corrections = transfer.skuCorrections || [];
              const activeCorrection = corrections.find((correction) =>
                correction.status === "PENDING_SOURCE" || correction.status === "APPROVED_PENDING_RECEIPT",
              );
              const latestCorrection = corrections[0];
              const canReportSkuCorrection = transfer.status === "IN_TRANSIT" &&
                canReceive && !activeCorrection && latestCorrection?.status !== "RECEIVED";
              const alternativeProducts = products.filter((product) =>
                product.id !== transfer.product.id &&
                product.status !== "INACTIVE" &&
                product.status !== "ARCHIVED",
              );
              const currentAcceptQty = acceptQty[transfer.id] ?? String(transfer.requestedQty ?? "");
              const currentReceiveQty = receiveQty[transfer.id] ?? String(transfer.dispatchedQty ?? "");
              const currentActualQty = actualQtyByTransfer[transfer.id] ?? "";
              const acceptQtyNumber = Number(currentAcceptQty);
              const receiveQtyNumber = Number(currentReceiveQty);
              const canSubmitAccept = Number.isSafeInteger(acceptQtyNumber) &&
                acceptQtyNumber > 0 &&
                acceptQtyNumber <= (transfer.requestedQty ?? 0);
              const canSubmitReceiptIssue = currentReceiveQty.trim() !== "" &&
                Number.isSafeInteger(receiveQtyNumber) &&
                receiveQtyNumber >= 0 &&
                receiveQtyNumber <= (transfer.dispatchedQty ?? 0) &&
                receiveQtyNumber !== transfer.dispatchedQty &&
                Boolean(receiveNotes[transfer.id]?.trim());
              const isDirectGroup = Boolean(group) &&
                group!.items.every((item) => item.kind === "DIRECT");

              if (isDirectGroup && group && canReceive) {
                if (!isFirstInGroup || !group) return null;
                return (
                  <StockTransferBatchReceiptTable
                    key={group.batchId}
                    batchId={group.batchId}
                    items={group.items}
                    products={products}
                    shiftOpen={shiftOpen}
                    onUpdated={(updated) => onUpdated(updated as Transfer)}
                  />
                );
              }
              if (isDirectGroup && group && canManageSource) {
                if (!isFirstInGroup) return null;
                return (
                  <StockTransferBatchSenderTable
                    key={group.batchId}
                    batchId={group.batchId}
                    items={group.items}
                    shiftOpen={shiftOpen}
                    isCashier={isCashier}
                    onUpdated={(updated) => onUpdated(updated as Transfer)}
                  />
                );
              }

              return (
                <div key={transfer.id} className="space-y-2">
                {isFirstInGroup && group && (
                  <header className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase text-slate-800 dark:text-slate-100">
                        Kiriman {group.batchId.slice(0, 8).toUpperCase()} · {group.items.length} produk
                      </p>
                      <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                        {transfer.sourceBranch.name} → {transfer.targetBranch.name} · {new Date(group.createdAt).toLocaleString("id-ID")}
                      </p>
                    </div>
                    {canReceive && group!.items.some((item) => item.skuCorrections?.length) && (
                      <span className="text-[9px] font-semibold text-amber-800 dark:text-amber-300">
                        Selesaikan koreksi SKU per produk sebelum konfirmasi semua.
                      </span>
                    )}
                  </header>
                )}
                <article className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-slate-800 dark:text-slate-100">{transfer.product.name}</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {transfer.sourceBranch.name} <ArrowRightLeft className="mx-1 inline h-3 w-3" /> {transfer.targetBranch.name}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${isOpen(transfer) ? "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>
                      {statusLabels[transfer.status]}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                    {transfer.requestedQty != null && <span>Diminta {transfer.requestedQty} pcs</span>}
                    {transfer.approvedQty != null && <span>Disetujui {transfer.approvedQty} pcs</span>}
                    {transfer.dispatchedQty != null && <span>Dikirim {transfer.dispatchedQty} pcs</span>}
                    {transfer.receivedQty != null && <span>Diterima {transfer.receivedQty} pcs</span>}
                  </div>
                  {transfer.requestNote && <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Catatan: {transfer.requestNote}</p>}
                  {transfer.responseNote && <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Respons: {transfer.responseNote}</p>}
                  {transfer.discrepancyNote && <p className="mt-1 text-[10px] font-semibold text-amber-800 dark:text-amber-300">Selisih: {transfer.discrepancyNote}</p>}

                  {transfer.status === "REQUESTED" && canManageSource && (
                    <div className="mt-2 space-y-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                      <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300">
                        Jumlah yang akan diberikan
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={currentAcceptQty}
                          onChange={(event) => setAcceptQty((state) => ({ ...state, [transfer.id]: event.target.value }))}
                          disabled={Boolean(busyId) || (isCashier && !shiftOpen)}
                          className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={Boolean(busyId) || (isCashier && !shiftOpen) || !canSubmitAccept}
                          onClick={() => void run(transfer.id, () => api.respondStockTransfer(transfer.id, {
                            action: "ACCEPT",
                            qty: Number(currentAcceptQty),
                          }))}
                          className="flex min-h-10 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 text-[10px] font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" /> Setujui
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyId) || (isCashier && !shiftOpen)}
                          onClick={() => void run(transfer.id, () => api.respondStockTransfer(transfer.id, {
                            action: "REJECT",
                            note: "Stok tidak tersedia atau tidak dapat diberikan.",
                          }))}
                          className="flex min-h-10 items-center justify-center gap-1 rounded-lg border border-rose-300 px-2 text-[10px] font-black uppercase text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
                        >
                          <X className="h-3.5 w-3.5" /> Tolak
                        </button>
                      </div>
                    </div>
                  )}

                  {transfer.status === "ACCEPTED" && canManageSource && (
                    <button
                      type="button"
                      disabled={Boolean(busyId) || (isCashier && !shiftOpen)}
                      onClick={() => void run(transfer.id, () => api.dispatchStockTransfer(transfer.id))}
                      className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 text-[10px] font-black uppercase text-white hover:bg-slate-900 disabled:opacity-50 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400"
                    >
                      <Send className="h-3.5 w-3.5" /> Catat barang dikirim
                    </button>
                  )}

                  {transfer.status === "IN_TRANSIT" && canReceive && !latestCorrection && (
                    <div className="mt-2 space-y-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                      <p className="text-[10px] text-slate-600 dark:text-slate-300">
                        Pengirim mencatat {transfer.dispatchedQty ?? 0} pcs. Konfirmasi ini menjadi bukti serah-terima cabang.
                      </p>
                      {!receiveIssueOpen[transfer.id] ? (
                        <>
                          <button
                            type="button"
                            disabled={Boolean(busyId) || !shiftOpen || transfer.dispatchedQty == null}
                            onClick={() => void run(transfer.id, () => api.receiveStockTransfer(transfer.id, {
                              receivedQty: transfer.dispatchedQty ?? 0,
                            }))}
                            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-[10px] font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <PackageCheck className="h-4 w-4" /> Konfirmasi sesuai
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(busyId) || !shiftOpen}
                            onClick={() => setReceiveIssueOpen((state) => ({ ...state, [transfer.id]: true }))}
                            className="min-h-9 w-full rounded-lg border border-amber-300 px-3 text-[10px] font-bold uppercase text-amber-800 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-500/10"
                          >
                            Jumlah tidak sesuai
                          </button>
                        </>
                      ) : (
                        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/70 p-2 dark:border-amber-800 dark:bg-amber-500/5">
                          <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-200">
                            Jumlah yang benar-benar diterima
                            <input
                              type="number"
                              min="0"
                              max={transfer.dispatchedQty ?? undefined}
                              step="1"
                              value={currentReceiveQty}
                              onChange={(event) => setReceiveQty((state) => ({ ...state, [transfer.id]: event.target.value }))}
                              disabled={Boolean(busyId) || !shiftOpen}
                              className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                            />
                          </label>
                          <textarea
                            value={receiveNotes[transfer.id] || ""}
                            onChange={(event) => setReceiveNotes((state) => ({ ...state, [transfer.id]: event.target.value }))}
                            maxLength={500}
                            placeholder="Jelaskan jumlah yang berbeda"
                            disabled={Boolean(busyId) || !shiftOpen}
                            className="min-h-16 w-full rounded-lg border border-amber-300 bg-white p-2 text-xs text-slate-800 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <p className="text-[10px] text-amber-900 dark:text-amber-200">
                            Selisih dicatat untuk ditelusuri. Stok pengirim tidak otomatis bertambah; retur harus diterima secara fisik.
                          </p>
                          {currentReceiveQty.trim() !== "" && receiveQtyNumber === transfer.dispatchedQty && (
                            <p className="text-[10px] font-semibold text-amber-900 dark:text-amber-200">
                              Jumlah sama dengan yang dikirim. Gunakan “Konfirmasi sesuai”.
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={Boolean(busyId) || !shiftOpen || !canSubmitReceiptIssue}
                              onClick={() => void run(transfer.id, () => api.receiveStockTransfer(transfer.id, {
                                receivedQty: receiveQtyNumber,
                                discrepancyNote: receiveNotes[transfer.id]?.trim(),
                              }))}
                              className="flex min-h-10 items-center justify-center gap-1 rounded-lg bg-amber-500 px-2 text-[10px] font-black uppercase text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                            >
                              <PackageCheck className="h-4 w-4" /> Catat selisih
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(busyId)}
                              onClick={() => setReceiveIssueOpen((state) => ({ ...state, [transfer.id]: false }))}
                              className="min-h-10 rounded-lg border border-slate-300 px-2 text-[10px] font-bold uppercase text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                              Kembali
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {transfer.status === "IN_TRANSIT" && canReportSkuCorrection && (
                    <div className="mt-2 space-y-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                      {latestCorrection?.status === "REJECTED" && (
                        <p className="rounded-lg border border-rose-300 bg-rose-50 p-2 text-[10px] font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-500/10 dark:text-rose-200">
                          Koreksi sebelumnya ditolak: {latestCorrection.responseNote || "SKU aktual belum disepakati."}
                          {" "}Stok belum dipindahkan. Periksa kembali barang dan ajukan koreksi baru bila perlu.
                        </p>
                      )}
                      {!skuCorrectionOpen[transfer.id] ? (
                        <button
                          type="button"
                          disabled={Boolean(busyId) || !shiftOpen}
                          onClick={() => setSkuCorrectionOpen((state) => ({ ...state, [transfer.id]: true }))}
                          className="min-h-10 w-full rounded-lg border border-amber-300 px-3 text-[10px] font-black uppercase text-amber-900 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-500/10"
                        >
                          {latestCorrection?.status === "REJECTED" ? "Ajukan koreksi SKU lagi" : "SKU pada catatan berbeda"}
                        </button>
                      ) : (
                        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/70 p-2 dark:border-amber-800 dark:bg-amber-500/5">
                          <p className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">
                            Pilih SKU dan jumlah yang benar-benar diterima. Stok belum berubah sampai cabang pengirim menyetujui.
                          </p>
                          <select
                            aria-label={`SKU aktual untuk transfer ${transfer.product.name}`}
                            value={actualProductIdByTransfer[transfer.id] || ""}
                            onChange={(event) => setActualProductIdByTransfer((state) => ({
                              ...state,
                              [transfer.id]: event.target.value,
                            }))}
                            disabled={Boolean(busyId) || !shiftOpen}
                            className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          >
                            <option value="">Pilih SKU yang diterima</option>
                            {alternativeProducts.map((product) => (
                              <option key={product.id} value={product.id}>{product.name}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={currentActualQty}
                            onChange={(event) => setActualQtyByTransfer((state) => ({
                              ...state,
                              [transfer.id]: event.target.value,
                            }))}
                            placeholder="Jumlah SKU aktual"
                            aria-label="Jumlah SKU aktual"
                            disabled={Boolean(busyId) || !shiftOpen}
                            className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <textarea
                            value={skuCorrectionNotes[transfer.id] || ""}
                            onChange={(event) => setSkuCorrectionNotes((state) => ({
                              ...state,
                              [transfer.id]: event.target.value,
                            }))}
                            maxLength={500}
                            placeholder="Contoh: kasir memilih SKU 2GB, barang yang diserahkan 3GB"
                            aria-label="Alasan koreksi SKU"
                            disabled={Boolean(busyId) || !shiftOpen}
                            className="min-h-16 w-full rounded-lg border border-amber-300 bg-white p-2 text-xs text-slate-800 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={Boolean(busyId) || !shiftOpen}
                              onClick={() => void submitSkuCorrection(transfer)}
                              className="min-h-10 rounded-lg bg-amber-500 px-2 text-[10px] font-black uppercase text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                            >
                              Kirim ke pengirim
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(busyId)}
                              onClick={() => setSkuCorrectionOpen((state) => ({ ...state, [transfer.id]: false }))}
                              className="min-h-10 rounded-lg border border-slate-300 px-2 text-[10px] font-bold uppercase text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                              Kembali
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {transfer.status === "IN_TRANSIT" && canReceive && activeCorrection && (
                    <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50/70 p-2 dark:border-amber-800 dark:bg-amber-500/5">
                      {activeCorrection.status === "PENDING_SOURCE" ? (
                        <p className="text-[10px] font-semibold text-amber-900 dark:text-amber-200">
                          Menunggu cabang pengirim memeriksa koreksi: {activeCorrection.actualProduct.name}, {activeCorrection.actualQty} pcs.
                        </p>
                      ) : (
                        <>
                          <p className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">
                            Pengirim menyetujui SKU {activeCorrection.actualProduct.name}, {activeCorrection.actualQty} pcs.
                            Pastikan barang fisik sesuai sebelum konfirmasi.
                          </p>
                          <button
                            type="button"
                            disabled={Boolean(busyId) || !shiftOpen}
                            onClick={() => confirmCorrectedReceipt(transfer, activeCorrection)}
                            className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 text-[10px] font-black uppercase text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                          >
                            <PackageCheck className="h-4 w-4" /> Konfirmasi SKU aktual diterima
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {transfer.status === "IN_TRANSIT" && canManageSource && activeCorrection && (
                    <div className="mt-2 space-y-2 rounded-lg border border-amber-300 bg-amber-50/70 p-2 dark:border-amber-800 dark:bg-amber-500/5">
                      {activeCorrection.status === "PENDING_SOURCE" ? (
                        <>
                          <p className="text-[10px] font-semibold text-slate-800 dark:text-slate-100">
                            Penerima melaporkan SKU aktual <strong>{activeCorrection.actualProduct.name}</strong> ({activeCorrection.actualQty} pcs),
                            sedangkan catatan pengiriman adalah <strong>{transfer.product.name}</strong> ({transfer.dispatchedQty} pcs).
                          </p>
                          <p className="text-[10px] text-slate-600 dark:text-slate-300">
                            Alasan penerima: {activeCorrection.note}
                          </p>
                          <textarea
                            value={skuCorrectionResponseNotes[transfer.id] || ""}
                            onChange={(event) => setSkuCorrectionResponseNotes((state) => ({
                              ...state,
                              [transfer.id]: event.target.value,
                            }))}
                            maxLength={500}
                            placeholder="Catatan persetujuan atau alasan penolakan"
                            aria-label="Catatan respons koreksi SKU"
                            disabled={Boolean(busyId) || (isCashier && !shiftOpen)}
                            className="min-h-14 w-full rounded-lg border border-amber-300 bg-white p-2 text-xs text-slate-800 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={Boolean(busyId) || (isCashier && !shiftOpen)}
                              onClick={() => void reviewSkuCorrection(transfer, activeCorrection, "APPROVE")}
                              className="flex min-h-10 items-center justify-center gap-1 rounded-lg bg-amber-500 px-2 text-[10px] font-black uppercase text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" /> Setujui koreksi
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(busyId) || (isCashier && !shiftOpen)}
                              onClick={() => void reviewSkuCorrection(transfer, activeCorrection, "REJECT")}
                              className="flex min-h-10 items-center justify-center gap-1 rounded-lg border border-rose-300 px-2 text-[10px] font-black uppercase text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
                            >
                              <X className="h-3.5 w-3.5" /> Tolak koreksi
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="text-[10px] font-semibold text-amber-900 dark:text-amber-200">
                          Koreksi SKU disetujui. Menunggu cabang penerima mengonfirmasi barang aktual.
                        </p>
                      )}
                    </div>
                  )}

                  {latestCorrection?.status === "RECEIVED" && (
                    <p className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-[10px] font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
                      SKU dikoreksi dari {transfer.product.name} menjadi {latestCorrection.actualProduct.name};
                      {" "}{latestCorrection.actualQty} pcs diterima dan stok diperbarui setelah konfirmasi kedua cabang.
                    </p>
                  )}

                  {isCashier && transfer.targetBranch.id === branchId &&
                    ["REQUESTED", "ACCEPTED"].includes(transfer.status) && (
                      <button
                        type="button"
                        disabled={Boolean(busyId) || !shiftOpen}
                        onClick={() => void run(transfer.id, () => api.cancelStockTransfer(transfer.id, "Dibatalkan oleh cabang peminta."))}
                        className="mt-2 min-h-9 w-full rounded-lg border border-slate-300 px-3 text-[10px] font-bold uppercase text-slate-600 hover:bg-white disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        Batalkan permintaan sebelum dikirim
                      </button>
                    )}

                  {transfer.status === "IN_TRANSIT" && !canReceive && !activeCorrection && (
                    <p className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                      <Clock3 className="h-3.5 w-3.5" /> Menunggu konfirmasi kasir cabang tujuan.
                    </p>
                  )}
                </article>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
