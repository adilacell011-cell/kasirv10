import { useState } from "react";
import { ArrowRightLeft, Check, Clock3, PackageCheck, X } from "lucide-react";
import { api } from "../services/api";
import { getUnresolvedTransferDiscrepancyQty } from "../lib/stock-transfer-discrepancy";

type Transfer = {
  id: string;
  batchId?: string | null;
  status: "REQUESTED" | "ACCEPTED" | "IN_TRANSIT" | "RECEIVED" | "REJECTED" | "CANCELLED";
  dispatchedQty: number | null;
  receivedQty: number | null;
  createdAt: string;
  dispatchedAt?: string | null;
  receivedAt?: string | null;
  dispatchedBy?: { id: string; name?: string | null } | null;
  receivedBy?: { id: string; name?: string | null } | null;
  product: { id: string; name: string; barcode?: string | null };
  sourceBranch: { id: string; name: string };
  targetBranch: { id: string; name: string };
  discrepancyNote?: string | null;
  skuCorrections?: Array<{
    id: string;
    actualQty: number;
    note: string;
    status: "PENDING_SOURCE" | "APPROVED_PENDING_RECEIPT" | "REJECTED" | "RECEIVED";
    responseNote?: string | null;
    actualProduct: { id: string; name: string };
  }>;
};

type Props = {
  batchId: string;
  items: Transfer[];
  shiftOpen: boolean;
  isCashier: boolean;
  confirm: (message: string) => Promise<boolean>;
  onUpdated: (transfer: Transfer) => void;
};

const statusLabel = (transfer: Transfer) => {
  const correction = transfer.skuCorrections?.[0];
  const discrepancyQty = getUnresolvedTransferDiscrepancyQty(transfer);
  if (discrepancyQty > 0) return `Selisih ${discrepancyQty} pcs belum diselesaikan`;
  if (correction?.status === "PENDING_SOURCE") return "Perlu pemeriksaan pengirim";
  if (correction?.status === "APPROVED_PENDING_RECEIPT") return "Koreksi disetujui";
  if (correction?.status === "RECEIVED") return "SKU koreksi diterima";
  if (correction?.status === "REJECTED") return "Koreksi ditolak";
  if (transfer.status === "IN_TRANSIT") return "Menunggu penerima";
  if (transfer.status === "RECEIVED") return "Sudah diterima";
  if (transfer.status === "REJECTED") return "Ditolak";
  if (transfer.status === "CANCELLED") return "Dibatalkan";
  return transfer.status;
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function StockTransferBatchSenderTable({
  batchId,
  items,
  shiftOpen,
  isCashier,
  confirm,
  onUpdated,
}: Props) {
  const [responseNotes, setResponseNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const totalSent = items.reduce((total, item) => total + (item.dispatchedQty ?? 0), 0);
  const pendingCorrectionCount = items.filter((item) =>
    item.skuCorrections?.[0]?.status === "PENDING_SOURCE",
  ).length;
  const waitingCount = items.filter((item) =>
    item.status === "IN_TRANSIT" && !item.skuCorrections?.length,
  ).length;
  const unresolvedDiscrepancies = items
    .map((item) => getUnresolvedTransferDiscrepancyQty(item))
    .filter((qty) => qty > 0);
  const unresolvedDiscrepancyQty = unresolvedDiscrepancies.reduce((sum, qty) => sum + qty, 0);

  const run = async (transfer: Transfer, action: () => Promise<Transfer>) => {
    if (busyId) return;
    setBusyId(transfer.id);
    setError("");
    setMessage("");
    try {
      onUpdated(await action());
      setMessage("Pembaruan kiriman tersimpan.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Aksi kiriman gagal.");
    } finally {
      setBusyId("");
    }
  };

  const reviewCorrection = async (transfer: Transfer, action: "APPROVE" | "REJECT") => {
    const correction = transfer.skuCorrections?.[0];
    const responseNote = responseNotes[transfer.id]?.trim() || "";
    if (!correction || correction.status !== "PENDING_SOURCE") return;
    if (action === "REJECT" && !responseNote) {
      setError(`Isi alasan penolakan untuk ${transfer.product.name}.`);
      return;
    }
    if (action === "APPROVE" && !(await confirm(
      `Setujui koreksi ${transfer.product.name} menjadi ${correction.actualProduct.name}? Cabang penerima tetap harus mengonfirmasi barang aktual.`,
    ))) return;
    void run(transfer, () => api.reviewStockTransferSkuCorrection(transfer.id, correction.id, {
      action,
      responseNote: responseNote || undefined,
    }));
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-label="Daftar pengiriman satu kiriman">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-800/80">
        <div className="min-w-0">
          <h4 className="text-[11px] font-black uppercase text-slate-800 dark:text-slate-100">
            Kiriman {batchId.slice(0, 8).toUpperCase()}
          </h4>
          <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
            {items[0]?.sourceBranch.name} → {items[0]?.targetBranch.name}
            {" · "}{items.length} produk · {totalSent} pcs dikirim
            {items[0] ? ` · ${new Date(Math.max(...items.map((item) => new Date(item.createdAt).getTime()))).toLocaleString("id-ID")}` : ""}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[9px] font-bold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
          <ArrowRightLeft className="h-3 w-3" />
          {unresolvedDiscrepancies.length
            ? `${unresolvedDiscrepancies.length} selisih · ${unresolvedDiscrepancyQty} pcs belum selesai`
            : pendingCorrectionCount
            ? `${pendingCorrectionCount} koreksi perlu diperiksa`
            : waitingCount
              ? `${waitingCount} menunggu penerima`
              : "Riwayat pengirim"}
        </span>
      </header>

      {(error || message) && (
        <p role={error ? "alert" : "status"} className={`mx-3 mt-3 rounded-lg px-2.5 py-2 text-[10px] font-semibold ${error ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"}`}>
          {error || message}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="mobile-cards w-full table-fixed text-left text-[10px]" aria-label="Produk yang dikirim">
          <colgroup>
            <col className="w-[42%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[32%]" />
          </colgroup>
          <thead className="bg-slate-100 text-[9px] uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="px-2.5 py-2">Produk / SKU</th>
              <th className="px-1 py-2 text-center">Kirim</th>
              <th className="px-1 py-2 text-center">Terima</th>
              <th className="px-2 py-2">Status / tindakan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {items.map((transfer) => {
              const correction = transfer.skuCorrections?.[0];
              const isPending = correction?.status === "PENDING_SOURCE";
              const discrepancyQty = getUnresolvedTransferDiscrepancyQty(transfer);
              return (
                <tr key={transfer.id} className="align-top bg-white dark:bg-slate-900">
                  <td data-card-title className="break-words px-2.5 py-2">
                    <span className="block font-bold leading-tight text-slate-800 dark:text-slate-100">{transfer.product.name}</span>
                    {transfer.product.barcode && (
                      <span className="mt-0.5 block truncate text-[9px] text-slate-500 dark:text-slate-400">{transfer.product.barcode}</span>
                    )}
                  </td>
                  <td data-label="Dikirim" className="px-2 py-2 text-center font-black text-slate-700 dark:text-slate-200">{transfer.dispatchedQty ?? "—"}</td>
                  <td data-label="Diterima" className="px-2 py-2 text-center font-black text-slate-700 dark:text-slate-200">{transfer.receivedQty ?? "—"}</td>
                  <td data-label="Status / tindakan" className="px-2 py-2">
                    <div className="min-w-0 flex-1 text-left">
                      <span className={`block text-[9px] font-bold ${isPending ? "text-amber-800 dark:text-amber-300" : "text-slate-600 dark:text-slate-300"}`}>
                        {statusLabel(transfer)}
                      </span>
                      {(transfer.dispatchedBy?.name || transfer.dispatchedAt) && (
                        <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">
                          Dikirim{transfer.dispatchedBy?.name ? ` oleh ${transfer.dispatchedBy.name}` : ""}
                          {transfer.dispatchedAt ? ` · ${formatDateTime(transfer.dispatchedAt)}` : ""}
                        </p>
                      )}
                      {(transfer.receivedBy?.name || transfer.receivedAt) && (
                        <p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">
                          Diterima{transfer.receivedBy?.name ? ` oleh ${transfer.receivedBy.name}` : ""}
                          {transfer.receivedAt ? ` · ${formatDateTime(transfer.receivedAt)}` : ""}
                        </p>
                      )}
                      {correction && (
                        <div className="mt-1 space-y-1 rounded-lg border border-amber-200 bg-amber-50/70 p-2 dark:border-amber-800 dark:bg-amber-500/5">
                          <p className="text-[9px] font-semibold text-slate-700 dark:text-slate-200">
                            SKU aktual: {correction.actualProduct.name} · {correction.actualQty} pcs
                          </p>
                          {correction.note && <p className="break-words text-[9px] text-slate-600 dark:text-slate-300">Catatan penerima: {correction.note}</p>}
                          {correction.responseNote && <p className="break-words text-[9px] text-slate-600 dark:text-slate-300">Respons: {correction.responseNote}</p>}
                        </div>
                      )}
                      {discrepancyQty > 0 && (
                        <div role="status" className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-1 text-[9px] text-amber-900 dark:border-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
                          <p className="font-black">Selisih {discrepancyQty} pcs · belum diselesaikan</p>
                          <p>Tetap tercatat di riwayat, tidak dihitung sebagai stok tersedia.</p>
                        </div>
                      )}
                      {transfer.discrepancyNote && (
                        <p className="mt-1 break-words text-[9px] text-amber-800 dark:text-amber-300">Selisih: {transfer.discrepancyNote}</p>
                      )}
                      {isPending && (
                        <div className="mt-2 space-y-1.5">
                          <textarea
                            value={responseNotes[transfer.id] || ""}
                            onChange={(event) => setResponseNotes((state) => ({ ...state, [transfer.id]: event.target.value }))}
                            maxLength={500}
                            aria-label={`Respons koreksi ${transfer.product.name}`}
                            placeholder="Catatan persetujuan atau alasan penolakan"
                            disabled={Boolean(busyId) || (isCashier && !shiftOpen)}
                            className="min-h-14 w-full rounded-lg border border-amber-300 bg-white p-2 text-[10px] text-slate-800 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
                          />
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              disabled={Boolean(busyId) || (isCashier && !shiftOpen)}
                              onClick={() => void reviewCorrection(transfer, "APPROVE")}
                              className="flex min-h-9 items-center justify-center gap-1 rounded-lg bg-amber-500 px-2 text-[9px] font-black text-slate-950 disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" /> Setujui
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(busyId) || (isCashier && !shiftOpen)}
                              onClick={() => void reviewCorrection(transfer, "REJECT")}
                              className="flex min-h-9 items-center justify-center gap-1 rounded-lg border border-rose-300 px-2 text-[9px] font-black text-rose-700 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300"
                            >
                              <X className="h-3.5 w-3.5" /> Tolak
                            </button>
                          </div>
                        </div>
                      )}
                      {transfer.status === "IN_TRANSIT" && !isPending && correction?.status !== "APPROVED_PENDING_RECEIPT" && correction?.status !== "RECEIVED" && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[9px] text-slate-500 dark:text-slate-400">
                          <Clock3 className="h-3 w-3" /> Menunggu konfirmasi cabang tujuan.
                        </p>
                      )}
                      {correction?.status === "APPROVED_PENDING_RECEIPT" && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[9px] font-semibold text-amber-800 dark:text-amber-300">
                          <PackageCheck className="h-3 w-3" /> Menunggu konfirmasi SKU aktual.
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
