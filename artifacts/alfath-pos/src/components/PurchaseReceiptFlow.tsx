import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCashierShoppingPlanReceiptsQueryKey,
  getGetShoppingPlansQueryKey,
  getGetShoppingPlanRevisionsQueryKey,
  useConfirmShoppingPlanReceipt,
  useCreateShoppingPlan,
  useDeleteShoppingPlan,
  useGetCashierShoppingPlanReceipts,
  useGetShoppingPlanRevisions,
  useGetShoppingPlans,
  useReviseShoppingPlan,
} from "@workspace/api-client-react";
import type {
  ShoppingPlan,
  ShoppingPlanReceipt,
  ShoppingPlanReceiptConfirmationInput,
  ShoppingPlanRevisionInput,
} from "@workspace/api-client-react";
import { Check, ChevronDown, ClipboardCheck, Clock3, PackageCheck, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";

type Product = { id: string; name: string; barcode?: string | null; category?: string };
type Branch = { id: string; name: string };
type DraftItem = { productId: string; branchQtys: Record<string, string> };

const statusCopy: Record<string, string> = {
  DRAFT: "Draf",
  PUBLISHED: "Menunggu penerimaan",
  COMPLETED: "Selesai",
  PENDING: "Perlu diterima",
  CONFIRMED: "Diterima",
  SUPERSEDED: "Diperbarui",
  NO_ITEMS: "Tidak ada barang",
};

function toast(message: string, type: "success" | "error" = "success") {
  window.dispatchEvent(new CustomEvent("app-custom-alert", { detail: { message, type } }));
}

function ReceiptStatus({ status }: { status: string }) {
  const colors = status === "CONFIRMED" || status === "COMPLETED"
    ? "bg-emerald-100 text-emerald-800"
    : status === "PENDING" || status === "PUBLISHED"
      ? "bg-amber-100 text-amber-800"
      : status === "SUPERSEDED"
        ? "bg-rose-100 text-rose-700"
        : "bg-slate-200 text-slate-700";
  return <span data-testid={`status-purchase-${status.toLowerCase()}`} className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${colors}`}>{statusCopy[status] || status}</span>;
}

export function PurchasePlanAdmin({ products, branches, confirm }: {
  products: Product[];
  branches: Branch[];
  confirm: (message: string) => Promise<boolean>;
}) {
  const queryClient = useQueryClient();
  const plansQuery = useGetShoppingPlans();
  const createPlan = useCreateShoppingPlan();
  const revisePlan = useReviseShoppingPlan();
  const deletePlan = useDeleteShoppingPlan();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [search, setSearch] = useState("");
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: getGetShoppingPlansQueryKey() });
    };
    window.addEventListener("shopping-plan-updated", refresh);
    return () => window.removeEventListener("shopping-plan-updated", refresh);
  }, [queryClient]);

  const plans = (plansQuery.data || []) as ShoppingPlan[];
  const lockedBranchIds = useMemo(() => new Set(
    plans.find((plan) => plan.id === editingId)?.receipts
      ?.filter((receipt) => receipt.status === "CONFIRMED")
      .map((receipt) => receipt.branchId) || [],
  ), [plans, editingId]);
  const visibleProducts = useMemo(() => products.filter((product) =>
    `${product.name} ${product.barcode || ""}`.toLowerCase().includes(search.toLowerCase())), [products, search]);
  const reset = () => {
    setEditingId(null);
    setTitle("");
    setItems([]);
    setSearch("");
  };
  const startNew = () => {
    setEditingId(null);
    setTitle(`Belanja ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`);
    setItems([]);
  };
  const setQty = (productId: string, branchId: string, value: string) => {
    if (lockedBranchIds.has(branchId)) return;
    setItems((old) => old.map((item) => item.productId === productId
      ? { ...item, branchQtys: { ...item.branchQtys, [branchId]: value } }
      : item));
  };
  const addProduct = (product: Product) => {
    if (items.some((item) => item.productId === product.id)) return;
    setItems((old) => [...old, { productId: product.id, branchQtys: {} }]);
    setSearch("");
  };
  const savePlan = async () => {
    const prepared = items.map((item) => ({
      productId: item.productId,
      branchQtys: Object.fromEntries(Object.entries(item.branchQtys)
        .map(([id, value]) => [id, Number(value || 0)])
        .filter(([, qty]) => Number.isSafeInteger(Number(qty)) && Number(qty) > 0)),
    })).filter((item) => Object.keys(item.branchQtys).length > 0);
    if (!title.trim() || prepared.length === 0) {
      toast("Isi judul dan jumlah untuk minimal satu cabang.", "error");
      return;
    }
    const isRevision = Boolean(editingId);
    if (!(await confirm(isRevision
      ? "Terbitkan revisi rencana? Cabang yang belum mengonfirmasi akan menerima pemberitahuan."
      : "Terbitkan rencana belanja sekarang? Nota cabang akan langsung tersedia untuk kasir."))) return;
    try {
      if (editingId) {
        const data: ShoppingPlanRevisionInput = { title: title.trim(), items: prepared };
        await revisePlan.mutateAsync({ id: editingId, data });
        await queryClient.invalidateQueries({ queryKey: getGetShoppingPlanRevisionsQueryKey(editingId) });
      } else {
        await createPlan.mutateAsync({ data: { title: title.trim(), status: "PUBLISHED", items: prepared } });
      }
      await queryClient.invalidateQueries({ queryKey: getGetShoppingPlansQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetCashierShoppingPlanReceiptsQueryKey() });
      toast(isRevision ? "Revisi rencana diterbitkan." : "Rencana diterbitkan. Nota cabang siap diterima.");
      reset();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Rencana gagal disimpan.", "error");
    }
  };
  const beginRevision = (plan: ShoppingPlan) => {
    const currentItems = (plan.items || []) as Array<{ productId: string; branchQtys?: Record<string, number> }>;
    setEditingId(plan.id);
    setTitle(plan.title);
    setItems(currentItems.map((item) => ({
      productId: item.productId,
      branchQtys: Object.fromEntries(Object.entries(item.branchQtys || {})
        .map(([id, qty]) => [id, String(qty)])),
    })));
  };

  if (plansQuery.isLoading) return <div className="mx-3 my-4 rounded-2xl border border-white/10 bg-[#14233d] p-5 text-sm text-slate-200 animate-pulse">Memuat rencana pembelian…</div>;
  if (plansQuery.isError) return <div className="mx-3 my-4 rounded-2xl border border-rose-400/30 bg-[#14233d] p-5 text-sm text-rose-200"><p>Rencana belum dapat dimuat.</p><button data-testid="button-retry-purchase-plans" onClick={() => void plansQuery.refetch()} className="mt-3 min-h-11 rounded-xl border border-rose-300/30 px-4 font-bold">Coba lagi</button></div>;

  return <section data-testid="page-purchase-plans" className="min-h-full bg-[#0b172a] p-3 text-slate-100 md:p-5">
    <style>{`
      [data-testid="page-purchase-plans"] input:not([type="checkbox"]) {
        background-color: #0b172a !important;
        color: #f1f5f9 !important;
        -webkit-text-fill-color: #f1f5f9 !important;
        border-color: rgba(255,255,255,.18) !important;
        -webkit-box-shadow: inset 0 0 0 1000px #0b172a !important;
      }
      [data-testid="page-purchase-plans"] input:not([type="checkbox"]):focus {
        border-color: #c7ad79 !important;
        -webkit-box-shadow: inset 0 0 0 1000px #0b172a, 0 0 0 2px rgba(199,173,121,.24) !important;
      }
      [data-testid="page-purchase-plans"] input::placeholder { color: #94a3b8 !important; -webkit-text-fill-color: #94a3b8 !important; }
    `}</style>
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#b89c65]/35 bg-[#14233d] p-4">
        <div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#d4bd8d]">Belanja lintas cabang</p><h1 className="mt-1 text-xl font-extrabold">Rencana pembelian</h1><p className="mt-1 text-xs text-slate-300">Terbitkan sekali; setiap kasir menerima nota sesuai cabangnya.</p></div>
        {!editingId && <button data-testid="button-new-purchase-plan" onClick={startNew} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#c7ad79] px-4 text-sm font-bold text-[#17233a]"><Plus size={17}/> Rencana baru</button>}
      </header>

      {(title || editingId) ? <div className="space-y-3 rounded-2xl border border-[#b89c65]/35 bg-[#14233d] p-3 md:p-4">
        <div className="flex items-center justify-between gap-2"><h2 className="font-bold">{editingId ? "Revisi rencana" : "Rencana baru"}</h2><button data-testid="button-cancel-plan-edit" onClick={reset} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/15 text-slate-300" aria-label="Batal"><X size={18}/></button></div>
        <input data-testid="input-purchase-plan-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Judul rencana" className="w-full rounded-xl border border-white/15 bg-[#0b172a] px-3 text-sm text-white placeholder:text-slate-400"/>
        <div className="relative"><input data-testid="input-purchase-product-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari produk untuk ditambahkan" className="w-full rounded-xl border border-white/15 bg-[#0b172a] px-3 text-sm text-white placeholder:text-slate-400"/>
          {search && <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-white/15 bg-[#0b172a]">{visibleProducts.slice(0, 25).map((product) => <button key={product.id} data-testid={`button-add-purchase-product-${product.id}`} onClick={() => addProduct(product)} className="flex min-h-11 w-full items-center justify-between border-b border-white/10 px-3 text-left text-sm hover:bg-white/5"><span>{product.name}</span><Plus size={16}/></button>)}
            {visibleProducts.length === 0 && <p className="p-3 text-sm text-slate-400">Produk tidak ditemukan.</p>}</div>}
        </div>
        {items.length > 0 && <div className="overflow-x-auto rounded-xl border border-white/10"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-[#0a1425] text-[11px] uppercase text-[#d4bd8d]"><tr><th className="p-3">Produk</th>{branches.map((branch) => <th key={branch.id} className="w-24 p-2 text-center">{branch.name}{lockedBranchIds.has(branch.id) && <span className="block normal-case text-slate-400">Terkunci</span>}</th>)}<th className="w-12"/></tr></thead><tbody className="divide-y divide-white/10">{items.map((item) => {
          const product = products.find((entry) => entry.id === item.productId);
          return <tr key={item.productId} data-testid={`row-plan-product-${item.productId}`}><td className="p-3 font-semibold">{product?.name || "Produk"}</td>{branches.map((branch) => <td key={branch.id} className="p-2"><input data-testid={`input-plan-qty-${item.productId}-${branch.id}`} aria-label={`${product?.name || "Produk"} jumlah ${branch.name}`} type="number" min="0" step="1" inputMode="numeric" disabled={lockedBranchIds.has(branch.id)} value={item.branchQtys[branch.id] || ""} onChange={(event) => setQty(item.productId, branch.id, event.target.value)} className="w-full rounded-lg border border-white/15 bg-[#0b172a] px-2 text-center text-sm text-white disabled:opacity-50"/></td>)}<td className="p-2"><button data-testid={`button-remove-plan-product-${item.productId}`} onClick={() => setItems((old) => old.filter((entry) => entry.productId !== item.productId))} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-rose-300" aria-label={`Hapus ${product?.name || "produk"}`}><X size={16}/></button></td></tr>;
        })}</tbody></table></div>}
        <p className="text-xs text-slate-400">Jumlah kosong atau 0 tidak dikirim. Cabang yang sudah mengonfirmasi tidak dapat direvisi.</p>
        <button data-testid="button-publish-purchase-plan" disabled={createPlan.isPending || revisePlan.isPending} onClick={() => void savePlan()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#c7ad79] px-4 font-bold text-[#17233a] disabled:opacity-50"><Save size={17}/>{createPlan.isPending || revisePlan.isPending ? "Menerbitkan…" : "Simpan & terbitkan"}</button>
      </div> : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between px-1"><h2 className="text-sm font-bold text-[#e3d5b4]">Riwayat rencana</h2><span className="text-xs text-slate-400">{plans.length} rencana</span></div>
        {plans.length === 0 ? <div data-testid="empty-purchase-plans" className="rounded-2xl border border-dashed border-white/20 bg-[#14233d] p-6 text-center text-sm text-slate-300">Belum ada rencana. Buat rencana untuk membagikan daftar penerimaan ke cabang.</div> :
          plans.map((plan) => <PlanCard key={plan.id} plan={plan} branches={branches} onRevise={() => beginRevision(plan)} onDelete={async () => {
            if (!(await confirm("Hapus rencana ini?"))) return;
            try { await deletePlan.mutateAsync({ id: plan.id }); await queryClient.invalidateQueries({ queryKey: getGetShoppingPlansQueryKey() }); await queryClient.invalidateQueries({ queryKey: getGetCashierShoppingPlanReceiptsQueryKey() }); toast("Rencana dihapus."); }
            catch (error) { toast(error instanceof Error ? error.message : "Rencana gagal dihapus.", "error"); }
          }} expanded={expandedHistory === plan.id} onExpand={() => setExpandedHistory(expandedHistory === plan.id ? null : plan.id)} />)}
      </div>
    </div>
  </section>;
}

function PlanCard({ plan, branches, onRevise, onDelete, expanded, onExpand }: {
  plan: ShoppingPlan; branches: Branch[]; onRevise: () => void; onDelete: () => void; expanded: boolean; onExpand: () => void;
}) {
  const revisions = useGetShoppingPlanRevisions(plan.id, { query: { enabled: expanded, queryKey: getGetShoppingPlanRevisionsQueryKey(plan.id) } });
  const receipts = plan.receipts || [];
  const canRevise = plan.status === "PUBLISHED" && receipts.some((receipt) => receipt.status === "PENDING");
  return <article data-testid={`card-purchase-plan-${plan.id}`} className="rounded-2xl border border-[#b89c65]/25 bg-[#14233d] p-3 md:p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold">{plan.title}</h3><p className="mt-1 text-xs text-slate-400">{new Date(plan.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</p></div><ReceiptStatus status={plan.status}/></div>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{branches.map((branch) => {
      const receipt = receipts.filter((entry) => entry.branchId === branch.id).slice(-1)[0];
      const planned = (plan.items as Array<{ branchQtys?: Record<string, number> }> || []).reduce((sum, item) => sum + Number(item.branchQtys?.[branch.id] || 0), 0);
      const actual = receipt?.items.reduce((sum, line) => sum + (line.actualQty ?? 0), 0);
      return <div key={branch.id} data-testid={`summary-plan-branch-${plan.id}-${branch.id}`} className="rounded-xl border border-white/10 bg-[#0d1a2e] p-2"><div className="truncate text-xs font-bold">{branch.name}</div><div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-300"><span>{planned} rencana</span>{receipt?.status === "CONFIRMED" && <><span>·</span><span className={actual === planned ? "text-emerald-300" : "text-rose-300"}>{actual} aktual</span></>}</div><div className="mt-1"><ReceiptStatus status={receipt?.status || (planned > 0 ? "PENDING" : "NO_ITEMS")}/></div></div>;
    })}</div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button data-testid={`button-plan-revisions-${plan.id}`} onClick={onExpand} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-3 text-xs font-semibold text-slate-200"><Clock3 size={15}/>Riwayat revisi<ChevronDown size={14} className={expanded ? "rotate-180" : ""}/></button>
      {canRevise && <button data-testid={`button-revise-plan-${plan.id}`} onClick={onRevise} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#c7ad79] px-3 text-xs font-bold text-[#17233a]"><RotateCcw size={15}/>Revisi cabang belum menerima</button>}
      {plan.status === "DRAFT" && <button data-testid={`button-delete-plan-${plan.id}`} onClick={onDelete} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-300/30 px-3 text-xs font-semibold text-rose-200"><Trash2 size={15}/>Hapus</button>}
    </div>
    {expanded && <div className="mt-3 border-t border-white/10 pt-3">{revisions.isLoading ? <p className="text-xs text-slate-400">Memuat riwayat…</p> : revisions.isError ? <button onClick={() => void revisions.refetch()} className="min-h-11 text-xs text-rose-200">Gagal memuat. Coba lagi.</button> : <div className="space-y-1">{(revisions.data || []).map((revision) => <p key={revision.id} data-testid={`text-plan-revision-${revision.id}`} className="text-xs text-slate-300">Revisi {revision.revisionNumber} · {revision.title} · {new Date(revision.createdAt).toLocaleDateString("id-ID")}</p>)}</div>}
      {receipts.map((receipt) => <div key={`${receipt.id}-${receipt.revisionId}`} data-testid={`details-plan-receipt-${receipt.id}`} className="mt-2 rounded-lg bg-[#0d1a2e] px-3 py-2 text-xs">
        <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{receipt.branchNameSnapshot} · {receipt.receivedByNameSnapshot || "Belum dikonfirmasi"}</span><span>{receipt.status === "CONFIRMED" ? new Date(receipt.confirmedAt || "").toLocaleString("id-ID") : statusCopy[receipt.status]}</span></div>
        <div className="mt-2 space-y-1">{receipt.items.map((line) => {
          const actualQty = line.actualQty ?? 0;
          const result = receipt.status !== "CONFIRMED"
            ? "Belum diperiksa"
            : line.notAvailable
              ? "Tidak ada"
              : actualQty < line.plannedQty
                ? `Kurang ${line.plannedQty - actualQty}`
                : actualQty > line.plannedQty
                  ? `Lebih ${actualQty - line.plannedQty}`
                  : "Sesuai";
          const resultColor = receipt.status !== "CONFIRMED"
            ? "text-slate-400"
            : line.notAvailable || actualQty < line.plannedQty
              ? "text-rose-300"
              : "text-emerald-300";
          return <div key={line.productId} data-testid={`details-receipt-line-${receipt.id}-${line.productId}`} className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-t border-white/10 pt-1.5">
            <span className="min-w-0 flex-1 truncate">{line.productNameSnapshot}</span>
            <span className="text-slate-300">Rencana {line.plannedQty} · Aktual {receipt.status === "CONFIRMED" ? actualQty : "—"}</span>
            <span className={`font-bold ${resultColor}`}>{result}</span>
          </div>;
        })}</div>
      </div>)}
    </div>}
  </article>;
}

export function CashierPurchaseReceipts({ confirm }: { confirm: (message: string) => Promise<boolean> }) {
  const queryClient = useQueryClient();
  const receiptsQuery = useGetCashierShoppingPlanReceipts();
  const confirmReceipt = useConfirmShoppingPlanReceipt();
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, { actualQty: string; notAvailable: boolean }>>({});
  const receipts = (receiptsQuery.data || []) as ShoppingPlanReceipt[];
  const current = receipts.find((receipt) => receipt.id === receiptId);
  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: getGetCashierShoppingPlanReceiptsQueryKey() });
    window.addEventListener("shopping-plan-updated", refresh);
    return () => window.removeEventListener("shopping-plan-updated", refresh);
  }, [queryClient]);
  const start = (receipt: ShoppingPlanReceipt) => {
    setReceiptId(receipt.id);
    setValues(Object.fromEntries(receipt.items.map((item) => [item.productId, { actualQty: "", notAvailable: false }])));
  };
  const setActual = (productId: string, raw: string) => {
    if (!/^\d*$/.test(raw)) return;
    setValues((previous) => ({ ...previous, [productId]: { actualQty: raw, notAvailable: false } }));
  };
  const setUnavailable = (productId: string, checked: boolean) => {
    setValues((previous) => ({ ...previous, [productId]: { actualQty: checked ? "0" : "", notAvailable: checked } }));
  };
  const submit = async () => {
    if (!current) return;
    const input: ShoppingPlanReceiptConfirmationInput = { items: current.items.map((item) => ({
      productId: item.productId,
      actualQty: values[item.productId]?.notAvailable ? 0 : Number(values[item.productId]?.actualQty),
      ...(values[item.productId]?.notAvailable ? { notAvailable: true } : {}),
    })) };
    if (input.items.some((line) =>
      !Number.isSafeInteger(line.actualQty) ||
      line.actualQty < 0 ||
      (!values[line.productId]?.notAvailable && values[line.productId]?.actualQty === "") ||
      (line.actualQty === 0 && !values[line.productId]?.notAvailable))) {
      toast("Isi jumlah aktual tiap barang atau pilih “Tidak ada”.", "error");
      return;
    }
    const accepted = await confirm("Konfirmasi seluruh barang yang diterima? Jumlah aktual akan langsung menambah stok cabang.");
    if (!accepted) return;
    try {
      await confirmReceipt.mutateAsync({ receiptId: current.id, data: input });
      await queryClient.invalidateQueries({ queryKey: getGetCashierShoppingPlanReceiptsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetShoppingPlansQueryKey() });
      toast("Penerimaan dikonfirmasi. Stok aktual sudah dicatat.");
      setReceiptId(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Penerimaan gagal dikonfirmasi.", "error");
    }
  };

  return <section data-testid="cashier-purchase-receipts" className="mx-3 my-3 rounded-2xl border border-slate-200 bg-white p-3 text-slate-800 shadow-sm md:mx-4 md:p-4">
    <header className="mb-3 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#f4ecd9] text-[#7b6334]"><ClipboardCheck size={20}/></div><div><h2 className="font-extrabold">Penerimaan pembelian</h2><p className="text-xs text-slate-500">Periksa barang dari rencana Owner. Terpisah dari input stok manual.</p></div></header>
    {receiptsQuery.isLoading ? <div data-testid="status-receipts-loading" className="animate-pulse rounded-xl bg-slate-100 p-4 text-sm text-slate-500">Memuat nota cabang…</div> :
      receiptsQuery.isError ? <div data-testid="status-receipts-error" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Nota belum dapat dimuat.<button data-testid="button-retry-receipts" onClick={() => void receiptsQuery.refetch()} className="ml-3 min-h-11 rounded-lg px-3 font-bold">Coba lagi</button></div> :
      receipts.length === 0 ? <div data-testid="empty-purchase-receipts" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">Belum ada nota pembelian untuk cabang ini.</div> :
      <div className="space-y-2">{receipts.map((receipt) => <div key={receipt.id} data-testid={`card-cashier-receipt-${receipt.id}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{receipt.shoppingPlan?.title || "Rencana pembelian"}</p><p className="mt-0.5 text-xs text-slate-500">Revisi {receipt.revision?.revisionNumber || 1} · {new Date(receipt.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</p></div><ReceiptStatus status={receipt.status}/></div>
        {receipt.status === "PENDING" && <button data-testid={`button-open-receipt-${receipt.id}`} onClick={() => start(receipt)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-800 px-4 text-sm font-bold text-white"><PackageCheck size={17}/>Periksa barang</button>}
        {receipt.status === "CONFIRMED" && <p className="mt-2 text-xs text-emerald-700">Dikonfirmasi oleh {receipt.receivedByNameSnapshot || "kasir"} · {new Date(receipt.confirmedAt || "").toLocaleString("id-ID")}</p>}
        {receipt.status === "SUPERSEDED" && <p className="mt-2 text-xs text-rose-700">Nota ini digantikan oleh revisi baru.</p>}
      </div>)}</div>}
    {current && <div role="dialog" aria-modal="true" aria-labelledby="receipt-dialog-title" data-testid="dialog-confirm-purchase-receipt" className="fixed inset-0 z-[2600] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3"><div><h3 id="receipt-dialog-title" className="text-lg font-extrabold">{current.shoppingPlan?.title || "Penerimaan barang"}</h3><p className="text-xs text-slate-500">{current.branchNameSnapshot} · isi jumlah yang benar-benar diterima</p></div><button data-testid="button-close-receipt-dialog" onClick={() => setReceiptId(null)} aria-label="Tutup" className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-500"><X size={19}/></button></div>
        <div className="mt-4 space-y-2">{current.items.map((item) => <div key={item.productId} data-testid={`row-receipt-item-${item.productId}`} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">{item.productNameSnapshot}</p>{item.productBarcodeSnapshot && <p className="text-xs text-slate-500">{item.productBarcodeSnapshot}</p>}</div><span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">Rencana {item.plannedQty}</span></div><div className="mt-3 flex items-center gap-3"><label className="flex flex-1 items-center gap-2 text-xs font-semibold text-slate-600">Aktual<input data-testid={`input-receipt-actual-${item.productId}`} aria-label={`Jumlah aktual ${item.productNameSnapshot}`} type="number" inputMode="numeric" min="0" step="1" disabled={values[item.productId]?.notAvailable} value={values[item.productId]?.actualQty || ""} onChange={(event) => setActual(item.productId, event.target.value)} placeholder="0" className="w-24 rounded-lg border border-slate-300 px-2 text-center text-base font-bold text-slate-900 disabled:bg-slate-100"/></label><label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold"><input data-testid={`checkbox-receipt-unavailable-${item.productId}`} type="checkbox" checked={Boolean(values[item.productId]?.notAvailable)} onChange={(event) => setUnavailable(item.productId, event.target.checked)} className="h-4 w-4"/>Tidak ada</label></div></div>)}</div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row"><button data-testid="button-cancel-receipt" onClick={() => setReceiptId(null)} className="min-h-11 flex-1 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700">Kembali</button><button data-testid="button-confirm-receipt" disabled={confirmReceipt.isPending} onClick={() => void submit()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 text-sm font-bold text-white disabled:opacity-50"><Check size={17}/>{confirmReceipt.isPending ? "Menyimpan…" : "Konfirmasi seluruh nota"}</button></div>
        <p className="mt-2 text-center text-xs text-slate-500">Stok bertambah sesuai aktual; kekurangan ditutup tanpa sisa tertunda.</p>
      </div>
    </div>}
  </section>;
}
