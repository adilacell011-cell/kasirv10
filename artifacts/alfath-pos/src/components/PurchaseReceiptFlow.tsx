import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import { Check, ChevronDown, ClipboardCheck, Clock3, FileText, PackageCheck, Plus, Printer, RotateCcw, Save, Share2, Store, Trash2, X, WandSparkles } from "lucide-react";
import {
  buildBranchPurchaseSuggestions,
  buildBranchShoppingBasketCandidates,
} from "../lib/branch-purchase-suggestions";
import { isProductVisibleInBranch } from "../lib/product-visibility";

type Product = { id: string; name: string; barcode?: string | null; category?: string | null; minStock?: number | string | null; visibleBranchIds?: string | null };
type Branch = { id: string; name: string };
type Stock = { productId: string; branchId: string; qty: number };
type DraftItem = {
  productId: string;
  branchQtys: Record<string, string>;
  suggestedBranchQtys?: Record<string, number>;
};
type ReceiptExceptionType = "SHORTAGE" | "NOT_AVAILABLE" | "EXTRA";
type ReceiptCheck = { exceptionType: ReceiptExceptionType | ""; differenceQty: string; note: string };

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

function getPurchasePlanErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object" && "error" in data) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function buildReceiptShareText(receipt: ShoppingPlanReceipt) {
  const rows = receipt.items.map((line, index) => {
    const received = line.actualQty ?? 0;
    const difference = received - line.plannedQty;
    const variance = difference > 0 ? `+${difference}` : `${difference}`;
    return `${index + 1}. ${line.productNameSnapshot} — rencana ${line.plannedQty}, diterima ${received}, selisih ${variance} pcs${line.note ? `; ${line.note}` : ""}`;
  });
  return [
    "NOTA PENERIMAAN BARANG",
    `Cabang: ${receipt.branchNameSnapshot}`,
    `Referensi: ${receipt.id.slice(0, 8).toUpperCase()}`,
    `Tanggal: ${new Date(receipt.confirmedAt || receipt.createdAt).toLocaleString("id-ID")}`,
    `Diperiksa: ${receipt.receivedByNameSnapshot || "Kasir"}`,
    "",
    ...rows,
  ].join("\n");
}

async function sharePurchaseReceipt(receipt: ShoppingPlanReceipt) {
  const text = buildReceiptShareText(receipt);
  try {
    if (navigator.share) {
      await navigator.share({ title: "Nota Penerimaan Barang", text });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      toast("Ringkasan nota disalin untuk dibagikan.");
    } else {
      toast("Fitur berbagi tidak tersedia di perangkat ini.", "error");
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    toast("Nota tidak dapat dibagikan.", "error");
  }
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

export function PurchasePlanAdmin({ products, branches, shoppingBranches, confirm, stocks, getSalesTotals }: {
  products: Product[];
  branches: Branch[];
  shoppingBranches: Branch[];
  confirm: (message: string) => Promise<boolean>;
  stocks: Stock[];
  getSalesTotals: (branchId: string, signal: AbortSignal) => Promise<Record<string, number>>;
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
  const [draftSearch, setDraftSearch] = useState("");
  const [draftPage, setDraftPage] = useState(1);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [targetDays, setTargetDays] = useState("");
  const [criteriaConfirmed, setCriteriaConfirmed] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");
  const requestRef = useRef<{ controller: AbortController; epoch: number } | null>(null);
  const requestEpoch = useRef(0);

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
  const categories = useMemo(() => Array.from(new Set(products
    .filter((product) => shoppingBranches.some((branch) => isProductVisibleInBranch(product.visibleBranchIds, branch.id)))
    .map((product) => product.category?.trim())
    .filter((category): category is string => Boolean(category)))).sort((a, b) =>
    a.localeCompare(b, "id", { numeric: true })), [products, shoppingBranches]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const validDays = Number.isSafeInteger(Number(targetDays.trim())) && Number(targetDays.trim()) > 0
    ? Number(targetDays.trim())
    : null;
  const stockByBranchProduct = useMemo(
    () => new Map(stocks.map((stock) => [`${stock.branchId}:${stock.productId}`, stock.qty])),
    [stocks],
  );
  const stockFor = (branchId: string, productId: string) =>
    Math.max(0, Math.trunc(stockByBranchProduct.get(`${branchId}:${productId}`) || 0));
  const visibleInBranch = (product: Product, branchId: string) =>
    isProductVisibleInBranch(product.visibleBranchIds, branchId);
  const invalidateSuggestions = () => {
    requestRef.current?.controller.abort();
    requestRef.current = null;
    requestEpoch.current += 1;
    setSuggestionsLoading(false);
    setSuggestionError("");
    setCriteriaConfirmed(false);
    setItems([]);
    setDraftPage(1);
  };
  const toggleCategory = (category: string) => {
    invalidateSuggestions();
    setSelectedCategories((current) => current.includes(category)
      ? current.filter((entry) => entry !== category)
      : [...current, category]);
  };
  const toggleBranch = (branchId: string) => {
    invalidateSuggestions();
    setSelectedBranchIds((current) => current.includes(branchId)
      ? current.filter((entry) => entry !== branchId)
      : [...current, branchId]);
  };
  const categoryProducts = useMemo(() => products.filter((product) =>
    selectedCategories.length === 0 || selectedCategories.includes(product.category || "")), [products, selectedCategories]);
  const visibleProducts = useMemo(() => categoryProducts.filter((product) =>
    `${product.name} ${product.barcode || ""}`.toLowerCase().includes(search.toLowerCase()) &&
    selectedBranchIds.some((branchId) => visibleInBranch(product, branchId))), [categoryProducts, search, selectedBranchIds]);
  const automaticCartCandidates = useMemo(() => buildBranchShoppingBasketCandidates({
    products: categoryProducts,
    branchIds: selectedBranchIds.filter((branchId) =>
      shoppingBranches.some((branch) => branch.id === branchId)),
    stockForProduct: (branchId, productId) =>
      stockByBranchProduct.get(`${branchId}:${productId}`) || 0,
  }), [categoryProducts, selectedBranchIds, shoppingBranches, stockByBranchProduct]);
  const automaticCartDraftItems = useMemo(() => {
    const byProduct = new Map<string, DraftItem>();
    for (const candidate of automaticCartCandidates) {
      const editableBranchQtys = Object.fromEntries(selectedBranchIds
        .filter((branchId) => visibleInBranch(candidate.product, branchId))
        .map((branchId) => [branchId, ""]));
      const item: DraftItem = byProduct.get(candidate.product.id) || {
        productId: candidate.product.id,
        branchQtys: {},
      };
      item.branchQtys = { ...item.branchQtys, ...editableBranchQtys };
      byProduct.set(candidate.product.id, item);
    }
    return Array.from(byProduct.values());
  }, [automaticCartCandidates, selectedBranchIds]);
  const filteredDraftItems = useMemo(() => {
    const query = draftSearch.trim().toLocaleLowerCase("id-ID");
    if (!query) return items;
    return items.filter((item) => {
      const product = productById.get(item.productId);
      return `${product?.name || ""} ${product?.barcode || ""} ${product?.category || ""}`
        .toLocaleLowerCase("id-ID")
        .includes(query);
    });
  }, [draftSearch, items, productById]);
  const draftPageSize = 10;
  const draftPageCount = Math.max(1, Math.ceil(filteredDraftItems.length / draftPageSize));
  const currentDraftPage = Math.min(draftPage, draftPageCount);
  const paginatedDraftItems = filteredDraftItems.slice(
    (currentDraftPage - 1) * draftPageSize,
    currentDraftPage * draftPageSize,
  );
  const hasPurchaseQty = items.some((item) =>
    Object.values(item.branchQtys).some((value) => value.trim() !== ""));
  const hasSuggestedQty = items.some((item) =>
    Object.keys(item.suggestedBranchQtys || {}).length > 0);
  const reset = () => {
    requestRef.current?.controller.abort();
    requestRef.current = null;
    requestEpoch.current += 1;
    setEditingId(null);
    setTitle("");
    setItems([]);
    setSearch("");
    setDraftSearch("");
    setDraftPage(1);
    setSelectedCategories([]);
    setSelectedBranchIds([]);
    setTargetDays("");
    setCriteriaConfirmed(false);
    setSuggestionsLoading(false);
    setSuggestionError("");
  };
  const startNew = () => {
    requestRef.current?.controller.abort();
    requestRef.current = null;
    requestEpoch.current += 1;
    setEditingId(null);
    setTitle(`Belanja ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`);
    setItems([]);
    setDraftSearch("");
    setDraftPage(1);
    setSelectedCategories([]);
    setSelectedBranchIds([]);
    setTargetDays("");
    setCriteriaConfirmed(false);
    setSuggestionsLoading(false);
    setSuggestionError("");
  };
  const setQty = (productId: string, branchId: string, value: string) => {
    if (lockedBranchIds.has(branchId)) return;
    setItems((old) => old.map((item) => item.productId === productId
      ? { ...item, branchQtys: { ...item.branchQtys, [branchId]: value } }
      : item));
  };
  const addProduct = (product: Product) => {
    const editableBranchIds = editingId
      ? branches.filter((branch) => !lockedBranchIds.has(branch.id)).map((branch) => branch.id)
      : selectedBranchIds;
    setItems((old) => {
      const existing = old.find((item) => item.productId === product.id);
      const missingBranchIds = editableBranchIds.filter((branchId) =>
        visibleInBranch(product, branchId) &&
        !Object.prototype.hasOwnProperty.call(existing?.branchQtys || {}, branchId));
      if (existing) {
        if (missingBranchIds.length === 0) return old;
        return old.map((item) => item.productId === product.id
          ? {
              ...item,
              branchQtys: {
                ...item.branchQtys,
                ...Object.fromEntries(missingBranchIds.map((branchId) => [branchId, ""])),
              },
            }
          : item);
      }
      const branchQtys = Object.fromEntries(editableBranchIds
        .filter((branchId) => visibleInBranch(product, branchId))
        .map((branchId) => [branchId, ""]));
      return [...old, { productId: product.id, branchQtys }];
    });
    setSearch("");
    setDraftSearch("");
    setDraftPage(1);
  };
  const loadSuggestions = async () => {
    if (!title.trim()) setTitle(`Belanja ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`);
    requestRef.current?.controller.abort();
    requestRef.current = null;
    const epoch = ++requestEpoch.current;
    setSuggestionsLoading(false);
    setSuggestionError("");
    setCriteriaConfirmed(false);
    if (selectedCategories.length === 0 || selectedBranchIds.length === 0 || (targetDays.trim() !== "" && validDays === null)) {
      setSuggestionError(selectedCategories.length === 0
        ? "Pilih minimal satu kategori produk."
        : selectedBranchIds.length === 0
          ? "Pilih minimal satu cabang."
          : "Isi target dengan bilangan hari bulat positif, atau kosongkan untuk tanpa saran.");
      return;
    }
    if (validDays === null) {
      setItems(automaticCartDraftItems);
      setDraftPage(1);
      setCriteriaConfirmed(true);
      return;
    }
    if (automaticCartCandidates.length === 0) {
      setItems([]);
      setDraftPage(1);
      setCriteriaConfirmed(true);
      return;
    }
    setItems([]);
    setDraftPage(1);
    const controller = new AbortController();
    requestRef.current = { controller, epoch };
    setSuggestionsLoading(true);
    try {
      const salesByBranch: Array<readonly [string, Record<string, number>]> = [];
      const cartProductIds = new Set(automaticCartCandidates.map((candidate) => candidate.product.id));
      const suggestionBranchIds = selectedBranchIds.filter((branchId) =>
        categoryProducts.some((product) =>
          cartProductIds.has(product.id) && visibleInBranch(product, branchId)));
      for (const branchId of suggestionBranchIds) {
        if (controller.signal.aborted || requestEpoch.current !== epoch) return;
        salesByBranch.push([branchId, await getSalesTotals(branchId, controller.signal)]);
      }
      if (controller.signal.aborted || requestEpoch.current !== epoch) return;
      const totalsByBranch = new Map(salesByBranch);
      const nextByProduct = new Map<string, DraftItem>();
      for (const item of automaticCartDraftItems) {
        nextByProduct.set(item.productId, {
          ...item,
          branchQtys: { ...item.branchQtys },
          suggestedBranchQtys: {},
        });
      }
      const cartProducts = categoryProducts.filter((product) => cartProductIds.has(product.id));
      for (const branchId of suggestionBranchIds) {
        const branch = branches.find((entry) => entry.id === branchId);
        if (!branch) continue;
        const results = buildBranchPurchaseSuggestions({
          products: cartProducts,
          branchId,
          branchName: branch.name,
          salesQty30dByProduct: totalsByBranch.get(branchId) || {},
          stockForProduct: (productId) => stockFor(branchId, productId),
          targetDays: validDays,
        });
        for (const result of results) {
          const draft = nextByProduct.get(result.product.id);
          if (!draft || !Object.prototype.hasOwnProperty.call(draft.branchQtys, branchId)) continue;
          draft.branchQtys[branchId] = String(result.suggestedQty);
          draft.suggestedBranchQtys![branchId] = result.suggestedQty;
        }
      }
      setItems(Array.from(nextByProduct.values()));
      setCriteriaConfirmed(true);
    } catch (error) {
      if (!controller.signal.aborted && requestEpoch.current === epoch) {
        setItems(automaticCartDraftItems);
        setDraftPage(1);
        setCriteriaConfirmed(true);
        setSuggestionError(error instanceof Error ? error.message : "Saran belanja belum dapat dimuat. Coba lagi.");
      }
    } finally {
      if (requestEpoch.current === epoch) {
        setSuggestionsLoading(false);
        requestRef.current = null;
      }
    }
  };
  useEffect(() => () => {
    requestRef.current?.controller.abort();
  }, []);
  const savePlan = async () => {
    const hasInvalidQty = items.some((item) => Object.values(item.branchQtys).some((value) => {
      const trimmed = value.trim();
      return trimmed !== "" && (!Number.isSafeInteger(Number(trimmed)) || Number(trimmed) < 1);
    }));
    if (hasInvalidQty) {
      toast("Jumlah harus minimal 1 pcs. Kosongkan jika produk tidak dibeli di cabang itu.", "error");
      return;
    }
    const prepared = items.map((item) => ({
      productId: item.productId,
      branchQtys: Object.fromEntries(Object.entries(item.branchQtys)
        .filter(([, value]) => value.trim() !== "")
        .map(([id, value]) => [id, Number(value)])),
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
    requestRef.current?.controller.abort();
    requestRef.current = null;
    requestEpoch.current += 1;
    const currentItems = (plan.items || []) as Array<{ productId: string; branchQtys?: Record<string, number> }>;
    setEditingId(plan.id);
    setTitle(plan.title);
    setSelectedCategories([]);
    setTargetDays("");
    setDraftSearch("");
    setDraftPage(1);
    setCriteriaConfirmed(false);
    setSuggestionsLoading(false);
    setSuggestionError("");
    setSelectedBranchIds(branches.map((branch) => branch.id));
    setItems(currentItems.map((item) => {
      const product = products.find((entry) => entry.id === item.productId);
      const savedQtys = item.branchQtys || {};
      return {
        productId: item.productId,
        branchQtys: Object.fromEntries(branches
          .filter((branch) => !product || visibleInBranch(product, branch.id))
          .map((branch) => [branch.id, Number(savedQtys[branch.id]) > 0 ? String(savedQtys[branch.id]) : ""])),
      };
    }));
  };

  if (plansQuery.isLoading) return <div className="mx-3 my-4 rounded-2xl border border-white/10 bg-[#14233d] p-5 text-sm text-slate-200 animate-pulse">Memuat rencana pembelian…</div>;
  if (plansQuery.isError) return <div className="mx-3 my-4 rounded-2xl border border-rose-400/30 bg-[#14233d] p-5 text-sm text-rose-200"><p>Rencana belum dapat dimuat.</p><button data-testid="button-retry-purchase-plans" onClick={() => void plansQuery.refetch()} className="mt-3 min-h-11 rounded-xl border border-rose-300/30 px-4 font-bold">Coba lagi</button></div>;

  return <section data-testid="page-purchase-plans" className="h-full min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] bg-[#0b172a] p-3 text-slate-100 md:p-5">
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
        {!editingId && <div className="grid gap-3 rounded-xl border border-white/10 bg-[#0d1a2e] p-3 md:grid-cols-[minmax(0,1fr)_13rem]">
          <div className="space-y-3">
            <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#d4bd8d]">1 · Kategori produk</p>
              <div className="flex flex-wrap gap-2">{categories.map((category) => <label key={category} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${selectedCategories.includes(category) ? "border-[#c7ad79] bg-[#c7ad79]/15 text-[#f0dfb6]" : "border-white/10 text-slate-300"}`}>
                <input data-testid={`checkbox-purchase-category-${category.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`} type="checkbox" checked={selectedCategories.includes(category)} onChange={() => toggleCategory(category)} className="accent-[#c7ad79]"/>
                {category}</label>)}
                {categories.length === 0 && <p className="text-xs text-slate-400">Belum ada kategori produk.</p>}
              </div>
            </div>
            <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-[.14em] text-[#d4bd8d]">2 · Target persediaan cukup <span className="font-normal normal-case tracking-normal text-slate-400">(opsional)</span></span>
              <div className="flex items-center gap-2"><input data-testid="input-purchase-target-days" type="number" min="1" step="1" inputMode="numeric" value={targetDays} onChange={(event) => { invalidateSuggestions(); setTargetDays(event.target.value); }} placeholder="Contoh: 3" className="w-28 rounded-lg border border-white/15 bg-[#0b172a] px-3 text-sm text-white"/><span className="text-xs text-slate-300">hari</span></div>
            </label>
            <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#d4bd8d]">3 · Cabang yang ikut</p>
              <div className="flex flex-wrap gap-2">{shoppingBranches.map((branch) => <label key={branch.id} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${selectedBranchIds.includes(branch.id) ? "border-[#c7ad79] bg-[#c7ad79]/15 text-[#f0dfb6]" : "border-white/10 text-slate-300"}`}>
                <input data-testid={`checkbox-purchase-branch-${branch.id}`} type="checkbox" checked={selectedBranchIds.includes(branch.id)} onChange={() => toggleBranch(branch.id)} className="accent-[#c7ad79]"/>
                {branch.name}</label>)}
                {shoppingBranches.length === 0 && <p className="text-xs text-slate-400">Tidak ada cabang tersedia untuk belanja.</p>}
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-end gap-3">
            <button data-testid="button-confirm-purchase-criteria" disabled={suggestionsLoading || shoppingBranches.length === 0 || categories.length === 0} onClick={() => void loadSuggestions()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#c7ad79] px-3 text-xs font-bold text-[#17233a] disabled:opacity-50"><WandSparkles size={15}/>{suggestionsLoading ? "Menghitung saran…" : validDays === null && targetDays.trim() === "" ? "Terapkan pilihan" : "Tampilkan saran"}</button>
             <p className="text-[11px] text-slate-400">Daftar awal mengikuti keranjang otomatis untuk stok cabang di bawah atau sama dengan minimum. Target hari hanya menentukan angka saran; produk lain bisa dicari dan ditambahkan manual.</p>
          </div>
        </div>}
        {suggestionError && !editingId && <p data-testid="status-purchase-suggestions-error" className="rounded-lg border border-rose-300/20 bg-rose-400/10 p-3 text-xs text-rose-200">{suggestionError}</p>}
        {suggestionsLoading && !editingId && <div data-testid="status-purchase-suggestions-loading" className="animate-pulse rounded-xl border border-white/10 bg-[#0d1a2e] p-4 text-xs text-slate-300">Menghitung saran tiap cabang…</div>}
        {criteriaConfirmed && !editingId && validDays !== null && hasSuggestedQty && <div data-testid="status-purchase-suggestions-ready" className="rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">Angka saran tersedia untuk produk keranjang. Ubah jumlah sesuai kebutuhan sebelum diterbitkan.</div>}
        {criteriaConfirmed && !editingId && validDays !== null && items.length > 0 && !hasSuggestedQty && <div data-testid="status-purchase-no-positive-suggestions" className="rounded-lg border border-[#c7ad79]/20 bg-[#c7ad79]/10 px-3 py-2 text-xs text-[#eee0c1]">Produk keranjang tetap tampil, tetapi target hari ini belum menghasilkan angka saran. Isi jumlah manual bila tetap ingin membeli.</div>}
        {criteriaConfirmed && !editingId && validDays === null && <div data-testid="status-purchase-no-target" className="rounded-lg border border-[#c7ad79]/20 bg-[#c7ad79]/10 px-3 py-2 text-xs text-[#eee0c1]">Target hari kosong. Produk dalam keranjang otomatis dan stok cabang tetap tampil; angka rekomendasi disembunyikan. Isi jumlah beli sendiri.</div>}
        {(editingId || criteriaConfirmed) && <div className="relative"><input data-testid="input-purchase-product-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari produk lain untuk ditambahkan manual" className="w-full rounded-xl border border-white/15 bg-[#0b172a] px-3 text-sm text-white placeholder:text-slate-400"/>
          {search && <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-white/15 bg-[#0b172a]">{visibleProducts.slice(0, 25).map((product) => <button key={product.id} data-testid={`button-add-purchase-product-${product.id}`} onClick={() => addProduct(product)} className="flex min-h-11 w-full items-center justify-between border-b border-white/10 px-3 text-left text-sm hover:bg-white/5"><span>{product.name}</span><Plus size={16}/></button>)}
            {visibleProducts.length === 0 && <p className="p-3 text-sm text-slate-400">Produk tidak ditemukan.</p>}</div>}
        </div>}
        {items.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-xs font-bold text-[#e3d5b4]">Daftar produk ({items.length})</p><p className="text-[10px] text-slate-400">Tampil {filteredDraftItems.length === 0 ? 0 : (currentDraftPage - 1) * draftPageSize + 1}–{Math.min(currentDraftPage * draftPageSize, filteredDraftItems.length)} dari {filteredDraftItems.length}</p></div>
          <input data-testid="input-filter-purchase-plan-products" value={draftSearch} onChange={(event) => { setDraftSearch(event.target.value); setDraftPage(1); }} placeholder="Cari di daftar ini" className="min-h-10 w-full rounded-lg border border-white/15 bg-[#0b172a] px-3 text-xs text-white placeholder:text-slate-400 sm:w-56"/>
        </div>}
        {items.length > 0 && paginatedDraftItems.length > 0 && <div className="overflow-x-auto rounded-xl border border-white/10">
          <table style={{ minWidth: Math.max(430, 112 + selectedBranchIds.length * 76) }} className="w-full table-fixed border-collapse text-left">
            <thead className="bg-[#0d1a2e]">
              <tr>
                <th className="w-28 px-2 py-2 text-[9px] font-bold uppercase tracking-wide text-slate-400">Produk</th>
                {selectedBranchIds.map((branchId) => {
                  const branch = branches.find((entry) => entry.id === branchId);
                  if (!branch) return null;
                  return <th key={branchId} className="w-[76px] px-1 py-2 text-center text-[9px] font-bold text-[#e3d5b4]" title={branch.name}>{branch.name}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {paginatedDraftItems.map((item) => {
                const product = productById.get(item.productId);
                return <tr key={item.productId} data-testid={`row-plan-product-${item.productId}`} className="border-t border-white/10">
                  <td className="px-2 py-2 align-top">
                    <div className="flex items-start justify-between gap-1">
                      <p className="min-w-0 break-words text-[11px] font-semibold leading-tight">{product?.name || "Produk"}</p>
                      <button data-testid={`button-remove-plan-product-${item.productId}`} onClick={() => { setItems((old) => old.filter((entry) => entry.productId !== item.productId)); setDraftPage(1); }} className="grid min-h-7 min-w-7 shrink-0 place-items-center rounded-md text-rose-300" aria-label={`Hapus ${product?.name || "produk"}`}><X size={14}/></button>
                    </div>
                    <p className="mt-0.5 text-[9px] text-slate-400">{product?.category || "Tanpa kategori"}</p>
                  </td>
                  {selectedBranchIds.map((branchId) => {
                    const branch = branches.find((entry) => entry.id === branchId);
                    if (!branch) return null;
                    if (product && !visibleInBranch(product, branchId)) {
                      return <td key={branchId} className="px-1 py-2 text-center text-[9px] text-slate-500">—</td>;
                    }
                    const locked = lockedBranchIds.has(branchId);
                    const suggestedQty = !editingId ? item.suggestedBranchQtys?.[branchId] : undefined;
                    return <td key={branchId} className="px-1 py-2 align-top text-center">
                      <input data-testid={`input-plan-qty-${item.productId}-${branchId}`} aria-label={`${product?.name || "Produk"} jumlah ${branch.name}`} type="number" min="1" step="1" inputMode="numeric" disabled={locked} value={item.branchQtys[branchId] || ""} onChange={(event) => setQty(item.productId, branchId, event.target.value)} className="mx-auto block w-12 rounded-md border border-white/15 bg-[#0b172a] px-1 py-1 text-center text-xs font-bold text-white disabled:opacity-50"/>
                      <span data-testid={`text-plan-current-stock-${item.productId}-${branchId}`} className="mt-1 block text-[9px] leading-tight text-slate-400">Stok {stockFor(branchId, item.productId)}</span>
                      {suggestedQty !== undefined && <span data-testid={`text-plan-suggested-qty-${item.productId}-${branchId}`} className="mt-0.5 block text-[9px] font-semibold leading-tight text-[#d4bd8d]">Saran {suggestedQty}</span>}
                      {locked && <span className="mt-0.5 block text-[8px] leading-tight text-slate-500">Terkunci</span>}
                    </td>;
                  })}
                </tr>;
              })}
            </tbody>
          </table>
        </div>}
        {items.length > 0 && filteredDraftItems.length === 0 && <div className="rounded-xl border border-dashed border-white/15 p-4 text-center text-xs text-slate-400">Produk tidak ditemukan pada daftar rencana.</div>}
        {items.length > 0 && filteredDraftItems.length > draftPageSize && <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#0d1a2e] p-2">
          <button data-testid="button-purchase-draft-previous" disabled={currentDraftPage <= 1} onClick={() => setDraftPage(currentDraftPage - 1)} className="min-h-10 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-200 disabled:opacity-40">Sebelumnya</button>
          <span className="text-[11px] text-slate-300">Halaman {currentDraftPage} / {draftPageCount}</span>
          <button data-testid="button-purchase-draft-next" disabled={currentDraftPage >= draftPageCount} onClick={() => setDraftPage(currentDraftPage + 1)} className="min-h-10 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-200 disabled:opacity-40">Berikutnya</button>
        </div>}
        {items.length === 0 && criteriaConfirmed && <div data-testid="empty-purchase-shopping-basket" className="rounded-xl border border-dashed border-white/15 p-4 text-center text-xs text-slate-400">Tidak ada produk pada daftar saat ini. Kandidat otomatis mengikuti keranjang stok minimum; cari produk lain di atas untuk menambahkannya secara manual.</div>}
        <p className="text-xs text-slate-400">Jumlah akhir positif yang terisi saja akan dikirim ke cabang terkait. Produk yang tidak terlihat di cabang tidak memiliki kolom jumlah.</p>
        <button data-testid="button-publish-purchase-plan" disabled={createPlan.isPending || revisePlan.isPending || (!editingId && !hasPurchaseQty)} onClick={() => void savePlan()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#c7ad79] px-4 font-bold text-[#17233a] disabled:opacity-50"><Save size={17}/>{createPlan.isPending || revisePlan.isPending ? "Menerbitkan…" : "Simpan & terbitkan"}</button>
      </div> : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between px-1"><h2 className="text-sm font-bold text-[#e3d5b4]">Riwayat rencana</h2><span className="text-xs text-slate-400">{plans.length} rencana</span></div>
        {plans.length === 0 ? <div data-testid="empty-purchase-plans" className="rounded-2xl border border-dashed border-white/20 bg-[#14233d] p-6 text-center text-sm text-slate-300">Belum ada rencana. Buat rencana untuk membagikan daftar penerimaan ke cabang.</div> :
          plans.map((plan) => <PlanCard key={plan.id} plan={plan} onRevise={() => beginRevision(plan)} onDelete={async () => {
            if (!(await confirm("Hapus rencana ini secara permanen? Nota yang belum dikonfirmasi akan hilang dari daftar kasir semua cabang. Riwayat rencana dan revisinya ikut dihapus. Stok tidak berubah."))) return;
            try { await deletePlan.mutateAsync({ id: plan.id }); await queryClient.invalidateQueries({ queryKey: getGetShoppingPlansQueryKey() }); await queryClient.invalidateQueries({ queryKey: getGetCashierShoppingPlanReceiptsQueryKey() }); toast("Rencana dihapus."); }
            catch (error) { toast(getPurchasePlanErrorMessage(error, "Rencana gagal dihapus."), "error"); }
          }} />)}
      </div>
    </div>
  </section>;
}

function PlanCard({ plan, onRevise, onDelete }: {
  plan: ShoppingPlan; onRevise: () => void; onDelete: () => void;
}) {
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const revisions = useGetShoppingPlanRevisions(plan.id, { query: { enabled: revisionsOpen, queryKey: getGetShoppingPlanRevisionsQueryKey(plan.id) } });
  const receipts = (plan.receipts || []).filter((receipt) => receipt.status !== "SUPERSEDED");
  const canRevise = plan.status === "PUBLISHED" && receipts.some((receipt) => receipt.status === "PENDING");
  const canDelete = (plan.status === "DRAFT" && receipts.length === 0)
    || (plan.status === "PUBLISHED" && receipts.length > 0 && receipts.every((receipt) => receipt.status === "PENDING"));
  return <article data-testid={`card-purchase-plan-${plan.id}`} className="rounded-2xl border border-[#b89c65]/25 bg-[#14233d] p-3 md:p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold">{plan.title}</h3><p className="mt-1 text-xs text-slate-400">{new Date(plan.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</p></div><ReceiptStatus status={plan.status}/></div>
    <div className="mt-3 flex flex-wrap gap-2">
      <button data-testid={`button-plan-revisions-${plan.id}`} onClick={() => setRevisionsOpen((open) => !open)} aria-expanded={revisionsOpen} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-3 text-xs font-semibold text-slate-200"><Clock3 size={15}/>Riwayat revisi<ChevronDown size={14} className={revisionsOpen ? "rotate-180" : ""}/></button>
      {canRevise && <button data-testid={`button-revise-plan-${plan.id}`} onClick={onRevise} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#c7ad79] px-3 text-xs font-bold text-[#17233a]"><RotateCcw size={15}/>Revisi cabang belum menerima</button>}
      {canDelete && <button data-testid={`button-delete-plan-${plan.id}`} onClick={onDelete} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-300/30 px-3 text-xs font-semibold text-rose-200"><Trash2 size={15}/>Hapus permanen</button>}
    </div>
    <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[350px] text-left text-[11px] sm:min-w-[560px] sm:text-xs">
        <thead className="bg-[#0a1425] text-[10px] uppercase tracking-wide text-[#d4bd8d]">
          <tr><th className="px-2 py-2 sm:px-3">Cabang</th><th className="whitespace-nowrap px-2 py-2 sm:px-3">Tanggal</th><th className="px-2 py-2 sm:px-3">Hasil</th><th className="px-2 py-2 text-right sm:px-3">Nota</th></tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {receipts.length === 0
            ? <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">Belum ada penerimaan cabang.</td></tr>
            : receipts.map((receipt) => {
              const confirmed = receipt.status === "CONFIRMED";
              const plannedTotal = receipt.items.reduce((sum, line) => sum + line.plannedQty, 0);
              const receivedTotal = confirmed ? receipt.items.reduce((sum, line) => sum + (line.actualQty ?? 0), 0) : null;
              const shortageTotal = confirmed ? receipt.items.reduce((sum, line) => sum + Math.max(line.plannedQty - (line.actualQty ?? 0), 0), 0) : 0;
              const extraTotal = confirmed ? receipt.items.reduce((sum, line) => sum + Math.max((line.actualQty ?? 0) - line.plannedQty, 0), 0) : 0;
              const result = !confirmed
                ? statusCopy[receipt.status]
                : shortageTotal > 0 && extraTotal > 0
                  ? `Kurang ${shortageTotal} · lebih ${extraTotal} pcs`
                  : shortageTotal > 0
                    ? `Kurang ${shortageTotal} pcs`
                    : extraTotal > 0
                      ? `Lebih ${extraTotal} pcs`
                      : "Sesuai";
              const resultColor = !confirmed ? "text-slate-300" : shortageTotal > 0 ? "text-rose-300" : extraTotal > 0 ? "text-amber-200" : "text-emerald-300";
              const expanded = expandedReceiptId === receipt.id;
              return <Fragment key={`${receipt.id}-${receipt.revisionId}`}>
                <tr data-testid={`row-purchase-history-${receipt.id}`} className="bg-[#14233d] hover:bg-[#192b48]">
                  <td title={receipt.branchNameSnapshot} className="max-w-[105px] truncate px-2 py-2 font-semibold text-slate-100 sm:max-w-none sm:px-3">{receipt.branchNameSnapshot}</td>
                  <td title={new Date(receipt.confirmedAt || receipt.createdAt).toLocaleDateString("id-ID")} className="whitespace-nowrap px-2 py-2 text-slate-300 sm:px-3">{new Date(receipt.confirmedAt || receipt.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" })}</td>
                  <td className={`px-2 py-2 font-semibold sm:px-3 ${resultColor}`}><span>{result}</span><span className="mt-0.5 block text-[10px] font-normal text-slate-400">{receipt.items.length} produk · {confirmed ? `${receivedTotal} diterima` : `${plannedTotal} rencana`}</span></td>
                  <td className="px-2 py-2 text-right sm:px-3"><button data-testid={`button-toggle-purchase-receipt-${receipt.id}`} aria-expanded={expanded} onClick={() => setExpandedReceiptId(expanded ? null : receipt.id)} className="min-h-9 rounded-lg border border-[#b89c65]/35 px-2 font-semibold text-[#e3d5b4] hover:bg-[#b89c65]/10 sm:px-3">{expanded ? "Tutup" : "Nota"}</button></td>
                </tr>
                {expanded && <tr data-testid={`row-purchase-receipt-detail-${receipt.id}`}><td colSpan={4} className="bg-[#0d1a2e] p-2 sm:p-3"><PurchaseReceiptSlip receipt={receipt}/></td></tr>}
              </Fragment>;
            })}
        </tbody>
      </table>
    </div>
    {revisionsOpen && <div className="mt-2 rounded-xl border border-white/10 bg-[#0d1a2e] p-3">
      {revisions.isLoading ? <p className="text-xs text-slate-400">Memuat riwayat revisi…</p> : revisions.isError ? <button onClick={() => void revisions.refetch()} className="min-h-11 text-xs text-rose-200">Gagal memuat. Coba lagi.</button> : <div className="space-y-1">{(revisions.data || []).map((revision) => <p key={revision.id} data-testid={`text-plan-revision-${revision.id}`} className="text-xs text-slate-300">Revisi {revision.revisionNumber} · {revision.title} · {new Date(revision.createdAt).toLocaleDateString("id-ID")}</p>)}</div>}
    </div>}
  </article>;
}

function PurchaseReceiptSlip({ receipt }: { receipt: ShoppingPlanReceipt }) {
  const confirmed = receipt.status === "CONFIRMED";
  const plannedTotal = receipt.items.reduce((sum, line) => sum + line.plannedQty, 0);
  const receivedTotal = confirmed ? receipt.items.reduce((sum, line) => sum + (line.actualQty ?? 0), 0) : null;
  const shortageTotal = confirmed ? receipt.items.reduce((sum, line) => sum + Math.max(line.plannedQty - (line.actualQty ?? 0), 0), 0) : 0;
  const extraTotal = confirmed ? receipt.items.reduce((sum, line) => sum + Math.max((line.actualQty ?? 0) - line.plannedQty, 0), 0) : 0;
  const statusLabel = !confirmed
    ? statusCopy[receipt.status] || receipt.status
    : shortageTotal > 0 && extraTotal > 0
      ? "Ada selisih"
      : shortageTotal > 0
        ? "Ada kekurangan"
        : extraTotal > 0
          ? "Ada lebih"
          : "Sesuai";
  const statusStyle = !confirmed
    ? "border-[#b8a97e] bg-[#e8e1cc] text-[#62532e]"
    : shortageTotal > 0
      ? "border-[#c6a39d] bg-[#eadbd7] text-[#79423d]"
      : extraTotal > 0
        ? "border-[#c7b68e] bg-[#e9e2cd] text-[#67552c]"
        : "border-[#aab9a7] bg-[#dfe6dc] text-[#3d5b41]";

  return <section data-testid={`details-plan-receipt-${receipt.id}`} data-receipt-print-target className="overflow-hidden rounded-xl border border-[#d1cbbf] bg-[#ece9e1] text-[#1d2a38] shadow-sm">
    <div className="px-3 pb-3 pt-4 sm:px-5">
      <header className="text-center">
        <p className="flex items-center justify-center gap-2 text-lg font-extrabold"><Store size={20}/> {receipt.branchNameSnapshot}</p>
        <p className="mt-0.5 text-sm font-medium text-[#4d5964]">Nota Penerimaan Barang</p>
      </header>
      <div className="my-3 border-t border-dashed border-[#aaa69b]"/>
      <div className="grid grid-cols-[4.3rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-xs sm:grid-cols-[5rem_minmax(0,1fr)] sm:text-sm">
        <span className="text-[#59636d]">No. Ref</span><strong className="truncate">{receipt.id.slice(0, 8).toUpperCase()}</strong>
        <span className="text-[#59636d]">Tanggal</span><strong>{new Date(receipt.confirmedAt || receipt.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</strong>
        <span className="text-[#59636d]">Diperiksa</span><strong>{receipt.receivedByNameSnapshot || "Belum diperiksa"}</strong>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-y border-dashed border-[#aaa69b] py-2">
        <span className="text-xs font-semibold text-[#59636d]">Status penerimaan</span>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusStyle}`}>{statusLabel}</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[310px]">
          <div className="grid grid-cols-[1.2rem_minmax(0,1fr)_2.9rem_2.9rem_2.6rem] gap-1 rounded-md bg-[#dfddd5] px-1.5 py-2 text-[9px] font-bold uppercase tracking-wide text-[#384551] sm:grid-cols-[1.7rem_minmax(0,1fr)_3.3rem_3.4rem_3rem] sm:text-[10px]">
            <span>No.</span><span>Nama produk</span><span className="text-right">Rencana</span><span className="text-right">Terima</span><span className="text-right">Selisih</span>
          </div>
          <div className="divide-y divide-[#cfcdc5]">{receipt.items.map((line, index) => {
      const receivedQty = line.actualQty ?? 0;
      const unavailable = confirmed && (line.notAvailable || line.exceptionType === "NOT_AVAILABLE" || receivedQty === 0);
      const shortage = confirmed ? Math.max(line.plannedQty - receivedQty, 0) : 0;
      const extra = confirmed ? Math.max(receivedQty - line.plannedQty, 0) : 0;
      const result = !confirmed
        ? "Belum diperiksa"
        : unavailable
          ? `Tidak ada · kurang ${line.plannedQty} pcs`
          : shortage > 0
            ? `Kurang ${line.differenceQty ?? shortage} pcs`
            : extra > 0
              ? `Lebih ${line.differenceQty ?? extra} pcs`
              : "Sesuai";
      const resultColor = !confirmed ? "text-[#66717b]" : unavailable || shortage > 0 ? "text-[#8b4843]" : extra > 0 ? "text-[#77602f]" : "text-[#3c5c45]";
      return <div key={line.productId} data-testid={`details-receipt-line-${receipt.id}-${line.productId}`} className="grid grid-cols-[1.2rem_minmax(0,1fr)_2.9rem_2.9rem_2.6rem] items-start gap-1 px-1.5 py-2 text-[11px] sm:grid-cols-[1.7rem_minmax(0,1fr)_3.3rem_3.4rem_3rem] sm:text-sm">
        <span className="text-[#606a72]">{index + 1}.</span>
        <div className="min-w-0">
          <p className={`break-words font-semibold ${unavailable ? "text-[#71716c] line-through decoration-[#a76058]" : "text-[#1d2a38]"}`}>{line.productNameSnapshot}</p>
          {line.productBarcodeSnapshot && <p className="mt-0.5 break-all text-[9px] text-[#707982] sm:text-[10px]">{line.productBarcodeSnapshot}</p>}
          {unavailable && <p className="mt-1 text-[9px] font-semibold text-[#8b4843] sm:text-[10px]">Produk tidak ada dalam kiriman</p>}
          {line.note && <p className="mt-1 break-words text-[10px] leading-4 text-[#6f5740]"><span className="font-semibold">Catatan:</span> {line.note}</p>}
          {!confirmed && <span className={`mt-1 inline-block font-semibold ${resultColor}`}>{result}</span>}
        </div>
        <strong className="text-right">{line.plannedQty}</strong>
        <strong className="text-right">{confirmed ? receivedQty : "—"}</strong>
        <strong className={`text-right ${resultColor}`}>{confirmed ? shortage > 0 ? `−${shortage}` : extra > 0 ? `+${extra}` : "0" : "—"}</strong>
      </div>;
    })}</div>
        </div>
      </div>
      <div className="my-3 border-t border-dashed border-[#aaa69b]"/>
      <footer className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-3"><strong>Total rencana</strong><strong>{plannedTotal} pcs</strong></div>
        <div className="flex justify-between gap-3"><strong>Total diterima</strong><strong>{confirmed ? `${receivedTotal} pcs` : "Belum diterima"}</strong></div>
        <div className="flex justify-between gap-3"><strong>Total kurang</strong><strong className={shortageTotal ? "text-[#8b4843]" : ""}>{shortageTotal} pcs</strong></div>
        <div className="flex justify-between gap-3"><strong>Total lebih</strong><strong className={extraTotal ? "text-[#77602f]" : ""}>{extraTotal} pcs</strong></div>
      </footer>
      {confirmed && <div data-receipt-print-actions className="mt-4 grid grid-cols-2 gap-2 print:hidden">
        <button data-testid={`button-print-receipt-${receipt.id}`} onClick={() => window.print()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#bdb6a8] bg-[#e5e2da] px-3 text-xs font-bold text-[#344556] hover:bg-[#dedbd3] sm:text-sm"><Printer size={16}/>Cetak / PDF</button>
        <button data-testid={`button-share-receipt-${receipt.id}`} onClick={() => void sharePurchaseReceipt(receipt)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#b9aa87] bg-[#e8e1cf] px-3 text-xs font-bold text-[#55472b] hover:bg-[#e0d7c2] sm:text-sm"><Share2 size={16}/>Bagikan</button>
      </div>}
    </div>
  </section>;
}

export function CashierPurchaseReceipts({ confirm }: { confirm: (message: string) => Promise<boolean> }) {
  const queryClient = useQueryClient();
  const receiptsQuery = useGetCashierShoppingPlanReceipts();
  const confirmReceipt = useConfirmShoppingPlanReceipt();
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, ReceiptCheck>>({});
  const receipts = (receiptsQuery.data || []) as ShoppingPlanReceipt[];
  const current = receipts.find((receipt) => receipt.id === receiptId);
  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: getGetCashierShoppingPlanReceiptsQueryKey() });
    window.addEventListener("shopping-plan-updated", refresh);
    return () => window.removeEventListener("shopping-plan-updated", refresh);
  }, [queryClient]);
  const start = (receipt: ShoppingPlanReceipt) => {
    setReceiptId(receipt.id);
    setValues(Object.fromEntries(receipt.items.map((item) => [item.productId, { exceptionType: "", differenceQty: "", note: "" }])));
  };
  const setExceptionType = (productId: string, exceptionType: ReceiptExceptionType | "") => {
    setValues((previous) => ({ ...previous, [productId]: { exceptionType, differenceQty: "", note: "" } }));
  };
  const setDifferenceQty = (productId: string, raw: string) => {
    if (!/^\d*$/.test(raw)) return;
    setValues((previous) => ({
      ...previous,
      [productId]: { ...(previous[productId] || { exceptionType: "", differenceQty: "", note: "" }), differenceQty: raw },
    }));
  };
  const setNote = (productId: string, note: string) => {
    setValues((previous) => ({
      ...previous,
      [productId]: { ...(previous[productId] || { exceptionType: "", differenceQty: "", note: "" }), note },
    }));
  };
  const submit = async () => {
    if (!current) return;
    for (const item of current.items) {
      const check = values[item.productId];
      if (!check?.exceptionType) continue;
      if (!check.note.trim()) {
        toast(`Isi keterangan untuk ${item.productNameSnapshot}.`, "error");
        return;
      }
      if (check.exceptionType === "NOT_AVAILABLE") continue;
      const differenceQty = Number(check.differenceQty);
      if (!Number.isSafeInteger(differenceQty) || differenceQty < 1) {
        toast(`Isi jumlah pcs ${check.exceptionType === "SHORTAGE" ? "yang kurang" : "yang lebih"} untuk ${item.productNameSnapshot}.`, "error");
        return;
      }
      if (check.exceptionType === "SHORTAGE" && differenceQty >= item.plannedQty) {
        toast(`Jika ${item.productNameSnapshot} tidak ada sama sekali, pilih “Tidak ada”.`, "error");
        return;
      }
      if (check.exceptionType === "EXTRA" && !Number.isSafeInteger(item.plannedQty + differenceQty)) {
        toast(`Jumlah lebih untuk ${item.productNameSnapshot} terlalu besar.`, "error");
        return;
      }
    }
    const input: ShoppingPlanReceiptConfirmationInput = {
      items: current.items.map((item) => {
        const check = values[item.productId];
        if (!check?.exceptionType) return { productId: item.productId };
        return {
          productId: item.productId,
          exceptionType: check.exceptionType,
          ...(check.exceptionType === "NOT_AVAILABLE" ? {} : { differenceQty: Number(check.differenceQty) }),
          note: check.note.trim(),
        };
      }),
    };
    const accepted = await confirm("Produk tanpa tanda selisih akan diterima sesuai jumlah rencana Owner. Produk yang ditandai akan dihitung dari jumlah kurang/lebih yang Anda masukkan. Lanjutkan?");
    if (!accepted) return;
    try {
      await confirmReceipt.mutateAsync({ receiptId: current.id, data: input });
      await queryClient.invalidateQueries({ queryKey: getGetCashierShoppingPlanReceiptsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetShoppingPlansQueryKey() });
      toast("Penerimaan dikonfirmasi dan stok cabang diperbarui.");
      setReceiptId(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Penerimaan gagal dikonfirmasi.", "error");
    }
  };

  return <section data-testid="cashier-purchase-receipts" className="mx-auto my-3 w-full max-w-6xl flex-none rounded-2xl border border-slate-200 bg-white p-3 text-slate-800 shadow-sm sm:my-4 sm:p-4">
    <header className="mb-3 flex items-center gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f4ecd9] text-[#7b6334]"><ClipboardCheck size={20}/></div>
      <div className="min-w-0"><h2 className="text-base font-extrabold">Penerimaan belanja</h2><p className="text-xs text-slate-500">Nota dari Owner untuk cabang ini.</p></div>
    </header>
    {receiptsQuery.isLoading ? <div data-testid="status-receipts-loading" className="animate-pulse rounded-xl bg-slate-100 p-4 text-sm text-slate-500">Memuat nota cabang…</div> :
      receiptsQuery.isError ? <div data-testid="status-receipts-error" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Nota belum dapat dimuat.<button data-testid="button-retry-receipts" onClick={() => void receiptsQuery.refetch()} className="ml-3 min-h-11 rounded-lg px-3 font-bold">Coba lagi</button></div> :
      receipts.length === 0 ? <div data-testid="empty-purchase-receipts" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">Belum ada nota pembelian untuk cabang ini.</div> :
      <div className="space-y-2.5">{receipts.map((receipt) => <div key={receipt.id} data-testid={`card-cashier-receipt-${receipt.id}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-bold leading-5 text-slate-900">{receipt.shoppingPlan?.title || "Rencana pembelian"}</p>
            <p className="mt-1 text-xs text-slate-600">Revisi {receipt.revision?.revisionNumber || 1}</p>
            <p className="mt-0.5 text-xs text-slate-500">{new Date(receipt.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</p>
          </div>
          <ReceiptStatus status={receipt.status}/>
        </div>
        {receipt.status === "PENDING" && <button data-testid={`button-open-receipt-${receipt.id}`} onClick={() => start(receipt)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 text-sm font-bold text-white hover:bg-slate-700 sm:w-auto"><PackageCheck size={17}/>Periksa barang</button>}
        {receipt.status === "CONFIRMED" && <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-slate-600">Dikonfirmasi oleh {receipt.receivedByNameSnapshot || "kasir"} · {new Date(receipt.confirmedAt || "").toLocaleString("id-ID")}</p>
          <button data-testid={`button-view-cashier-receipt-${receipt.id}`} onClick={() => setReceiptId(receipt.id)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:w-auto"><FileText size={16}/>Lihat nota</button>
        </div>}
        {receipt.status === "SUPERSEDED" && <p className="mt-2 text-xs text-rose-700">Nota ini digantikan oleh revisi baru.</p>}
      </div>)}</div>}
    {current && <div className="fixed inset-0 z-[2600] flex items-end justify-center overflow-hidden bg-[#0b1523]/70 px-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))] pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="receipt-dialog-title" data-testid="dialog-confirm-purchase-receipt" style={{ maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1rem)", overflowY: "hidden" }} className="flex min-h-0 w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-[#c9c2b5] bg-[#e9e6de] text-[#243140] shadow-xl sm:rounded-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 bg-[#1a2d43] px-4 py-3 text-slate-100">
          <div className="flex min-w-0 items-start gap-2.5"><FileText size={20} className="mt-0.5 shrink-0 text-[#d1c29d]"/><div className="min-w-0"><h3 id="receipt-dialog-title" className="font-bold">{current.status === "CONFIRMED" ? "Nota Penerimaan" : "Periksa Nota Penerimaan"}</h3><p className="mt-0.5 truncate text-xs text-slate-300">{current.branchNameSnapshot} · {current.shoppingPlan?.title || "Rencana Owner"}</p></div></div>
          <button data-testid="button-close-receipt-dialog" onClick={() => setReceiptId(null)} aria-label="Tutup" className="grid min-h-10 min-w-10 shrink-0 place-items-center rounded-lg text-slate-300 hover:bg-white/10"><X size={19}/></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          {current.status === "CONFIRMED"
            ? <PurchaseReceiptSlip receipt={current}/>
            : <>
              <div className="rounded-lg border border-[#d1c8b4] bg-[#e5e0d4] px-3 py-2 text-xs leading-5 text-[#4c4b43]">
                Cocokkan dengan barang yang datang. Jika sesuai, biarkan pilihan tetap “Sesuai rencana”. Tandai hanya barang yang kurang, tidak ada, atau lebih.
              </div>
              <div className="mt-3 space-y-2">{current.items.map((item, index) => {
                const check = values[item.productId] || { exceptionType: "", differenceQty: "", note: "" };
                return <article key={item.productId} data-testid={`row-receipt-item-${item.productId}`} className="rounded-lg border border-[#d0cabc] bg-[#f0eee8] px-3 py-2.5 text-[#273544]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 gap-2">
                      <span className="mt-0.5 text-xs text-[#74766f]">{index + 1}.</span>
                      <div className="min-w-0"><p className="break-words text-sm font-bold leading-5">{item.productNameSnapshot}</p>{item.productBarcodeSnapshot && <p className="mt-0.5 break-all text-[10px] text-[#69737b]">{item.productBarcodeSnapshot}</p>}</div>
                    </div>
                    <span className="shrink-0 rounded-md border border-[#d3cebf] bg-[#e6e3db] px-2 py-1 text-[10px] font-bold text-[#45515d] sm:text-xs">Rencana {item.plannedQty} pcs</span>
                  </div>
                  <label className="mt-2.5 block text-xs font-bold text-[#49535d]">Pemeriksaan barang
                    <select data-testid={`select-receipt-exception-${item.productId}`} aria-label={`Pemeriksaan ${item.productNameSnapshot}`} value={check.exceptionType} onChange={(event) => setExceptionType(item.productId, event.target.value as ReceiptExceptionType | "")} className="mt-1 min-h-11 w-full rounded-lg border border-[#c7c2b7] bg-[#e8e5dd] px-3 text-sm text-[#243140] focus:border-[#9d8d68] focus:outline-none focus:ring-2 focus:ring-[#b5a373]/30">
                      <option value="">Sesuai rencana</option>
                      <option value="SHORTAGE" disabled={item.plannedQty <= 1}>Kurang</option>
                      <option value="NOT_AVAILABLE">Tidak ada</option>
                      <option value="EXTRA">Lebih</option>
                    </select>
                  </label>
                  {check.exceptionType === "SHORTAGE" && <label className="mt-2.5 block text-xs font-bold text-[#49535d]">Berapa pcs yang kurang?
                    <input data-testid={`input-receipt-difference-${item.productId}`} aria-label={`Jumlah pcs yang kurang ${item.productNameSnapshot}`} type="number" inputMode="numeric" min="1" max={item.plannedQty - 1} step="1" value={check.differenceQty} onChange={(event) => setDifferenceQty(item.productId, event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#c7c2b7] bg-[#e8e5dd] px-3 text-sm text-[#243140] focus:border-[#9d8d68] focus:outline-none focus:ring-2 focus:ring-[#b5a373]/30"/>
                    <span className="mt-1 block font-normal text-[#69737b]">Isi jumlah yang kurang. Jika tidak ada sama sekali, pilih “Tidak ada”.</span>
                  </label>}
                  {check.exceptionType === "EXTRA" && <label className="mt-2.5 block text-xs font-bold text-[#49535d]">Berapa pcs yang lebih?
                    <input data-testid={`input-receipt-difference-${item.productId}`} aria-label={`Jumlah pcs yang lebih ${item.productNameSnapshot}`} type="number" inputMode="numeric" min="1" step="1" value={check.differenceQty} onChange={(event) => setDifferenceQty(item.productId, event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[#c7c2b7] bg-[#e8e5dd] px-3 text-sm text-[#243140] focus:border-[#9d8d68] focus:outline-none focus:ring-2 focus:ring-[#b5a373]/30"/>
                    <span className="mt-1 block font-normal text-[#69737b]">Isi jumlah tambahan di atas rencana Owner.</span>
                  </label>}
                  {check.exceptionType && <label className="mt-2.5 block text-xs font-bold text-[#49535d]">Keterangan wajib
                    <textarea data-testid={`input-receipt-note-${item.productId}`} aria-label={`Keterangan ${item.productNameSnapshot}`} maxLength={300} value={check.note} onChange={(event) => setNote(item.productId, event.target.value)} placeholder={check.exceptionType === "NOT_AVAILABLE" ? "Contoh: produk tidak ada di kiriman" : "Jelaskan selisih barang"} className="mt-1 min-h-16 w-full rounded-lg border border-[#c7c2b7] bg-[#e8e5dd] px-3 py-2 text-sm text-[#243140] placeholder:text-[#858982] focus:border-[#9d8d68] focus:outline-none focus:ring-2 focus:ring-[#b5a373]/30"/>
                  </label>}
                </article>;
              })}</div>
            </>}
        </div>
        <footer className="shrink-0 border-t border-[#c9c2b5] bg-[#e6e3db] px-3 py-3">
          {current.status === "CONFIRMED"
            ? <button data-testid="button-cancel-receipt" onClick={() => setReceiptId(null)} className="min-h-11 w-full rounded-lg border border-[#bdb6a8] px-4 text-sm font-bold text-[#344556] hover:bg-[#dedbd3]">Tutup nota</button>
            : <>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button data-testid="button-cancel-receipt" onClick={() => setReceiptId(null)} className="min-h-11 flex-1 rounded-lg border border-[#bdb6a8] px-4 text-sm font-bold text-[#46515b] hover:bg-[#dedbd3]">Kembali</button>
                <button data-testid="button-confirm-receipt" disabled={confirmReceipt.isPending} onClick={() => void submit()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[#233b52] px-4 text-sm font-bold text-[#f3f0e8] hover:bg-[#1c3044] disabled:opacity-50"><Check size={17}/>{confirmReceipt.isPending ? "Menyimpan…" : "Konfirmasi nota"}</button>
              </div>
              <p className="mt-2 text-center text-[11px] leading-4 text-[#626a6e]">Stok bertambah sesuai rencana dan selisih yang dicatat. Kekurangan ditutup dan dilaporkan ke Owner.</p>
            </>}
        </footer>
      </div>
    </div>}
  </section>;
}
