import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { OpnameStockInput } from "./components/OpnameStockInput";
import BranchStockAuditPage from "./components/BranchStockAuditPage";
import type { AuditPageApi } from "./components/BranchStockAuditPage";
import { toCsvRow } from "./lib/csv";
// POS Refined Version 2.0

import {
  LogOut,
  Loader2,
  LayoutDashboard,
  Calculator,
  Boxes,
  ArrowRightLeft,
  Clock,
  Settings,
  ShoppingBag,
  Percent,
  Search,
  Plus,
  Minus,
  Trash2,
  ShieldCheck,
  Store,
  PlusSquare,
  Banknote,
  ScanBarcode,
  CheckCircle2,
  RefreshCw,
  User,
  Key,
  RotateCcw,
  ShoppingCart,
  X,
  Eye,
  LayoutList,
  Users,
  MapPin,
  Smartphone,
  Wifi,
  Save,
  Package,
  PackagePlus,
  AlertTriangle,
  Check,
  ChevronDown,
  Camera,
  Barcode,
  TrendingUp,
  Sparkles,
  Database,
  Edit,
  Lock,
  Activity,
  LayoutGrid,
  Tag,
  ChevronRight,
  ChevronLeft,
  Hand,
  Menu,
  Info,
  ArrowRight,
  History as HistoryIcon,
  Zap,
  Sun,
  Moon,
  CalendarDays,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { io } from "socket.io-client";
import { api, createReadRefresh, isSessionError, ReadError } from "./services/api";
import {
  isRevenueEligibleSaleStatus,
  makeSalesReadQueries,
} from "./services/sales-read-scope";
import { isShiftOverdue } from "./services/shift-time";
import { buildProductSuggestions } from "./lib/product-suggestions";
import { useBarcodeScanner } from "./hooks/useBarcodeScanner";
import { useOwnerDashboard } from "./hooks/useOwnerDashboard";
import { OperatorBadge } from "./components/OperatorLogo";
import {
  MdSpaceDashboard,
  MdInsights,
  MdInventory2,
  MdWarehouse,
  MdAutoAwesome,
  MdFactCheck,
  MdGroups,
  MdStorefront,
  MdPointOfSale,
  MdSchedule,
  MdAddBox,
} from "react-icons/md";

import { ProductTable } from "./components/ProductTable";
import { MasterProductCatalog } from "./components/MasterProductCatalog";
import { CustomSelect as ProductCombobox } from "./components/CustomSelect";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
} from "recharts";

const formatReportDateLabel = (value: string) => {
  if (!value) return "Pilih tanggal";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year.slice(-2)}` : "Pilih tanggal";
};

const branchStockAuditApi: AuditPageApi = {
  getCurrent: (branchId, signal) => api.getStockAuditCurrent(branchId, signal),
  getItems: (auditId, params, signal) => api.getStockAuditItems(auditId, params, signal),
  searchCandidates: (auditId, search, signal) => api.searchStockAuditCandidates(auditId, search, signal),
  start: (branchId) => api.startStockAudit(branchId),
  beginCount: (auditId, itemId) => api.beginStockAuditCount(auditId, itemId),
  saveCount: (auditId, itemId, data) => api.saveStockAuditCount(auditId, itemId, data),
  reportException: (auditId, data) => api.reportStockAuditException(auditId, data),
  finalize: (auditId) => api.finalizeStockAudit(auditId),
  cancel: (auditId) => api.cancelStockAudit(auditId),
};

const ScannerModal = ({
  onClose,
  onScan,
  posContext = false,
}: {
  onClose: () => void;
  onScan: (result: string) => void;
  posContext?: boolean;
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function initScanner() {
      if (!scannerRef.current) return;

      const html5QrCode = new Html5Qrcode(scannerRef.current.id);
      html5QrCodeRef.current = html5QrCode;

      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (isMounted) {
              html5QrCode
                .stop()
                .then(() => {
                  onScan(decodedText);
                  onClose();
                })
                .catch((e) => console.error("Stop error:", e));
            }
          },
          (errorMessage) => {},
        );
      } catch (err: any) {
        console.error("Scanner start error:", err);
        if (isMounted) {
          setErrorMsg(
            "Kamera tidak aktif. Berikan izin akses kamera di setelan browser.",
          );
        }
      }
    }

    initScanner();

    return () => {
      isMounted = false;
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current
          .stop()
          .catch((e) => console.error("Cleanup stop error:", e));
      }
    };
  }, []);

  return (
    <div
      data-pos-modal-context={posContext ? "true" : undefined}
      data-pos-scanner-overlay={posContext ? "true" : undefined}
      className="fixed inset-0 z-[3000] bg-black/95 flex flex-col items-center justify-center p-4 overflow-hidden"
    >
      <div data-pos-scanner-panel className="w-full max-w-sm bg-white rounded-[40px] overflow-hidden relative shadow-[0_0_80px_rgba(30,58,138,0.4)] border border-white/20">
        <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-200 animate-pulse">
              <ScanBarcode className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 uppercase tracking-tighter leading-none text-base">
                SCANNER AKTIF
              </h3>
              <p className="text-[10px] text-blue-500 font-bold uppercase tracking-[0.2em] mt-1.5 opacity-80">
                Alfath Pulsa System
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 bg-red-100 text-red-600 rounded-2xl hover:bg-red-200 transition-all active:scale-90"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="bg-slate-950 p-4 md:p-6 relative aspect-square">
          <div
            id="reader-container"
            ref={scannerRef}
            className="w-full h-full rounded-2xl md:rounded-3xl overflow-hidden shadow-inner bg-black border-2 border-slate-800"
          ></div>

          <div className="absolute inset-x-0 top-1/2 h-1 bg-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-[scan_2s_ease-in-out_infinite] z-20 pointer-events-none"></div>

          {errorMsg && (
            <div className="absolute inset-0 z-30 flex items-center justify-center p-4 md:p-8 text-center bg-slate-950/90">
              <div className="text-white max-w-xs">
                <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-500/50">
                  <AlertTriangle className="w-8 h-8 text-amber-500" />
                </div>
                <p className="text-sm font-bold leading-relaxed mb-6 uppercase tracking-tight">
                  {errorMsg}
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full py-3 md:py-4 bg-white text-slate-900 rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg hover:bg-slate-100 transition-all"
                >
                  Segarkan Browser
                </button>
              </div>
            </div>
          )}

          <div className="absolute inset-0 pointer-events-none border-[60px] border-black/10 rounded-2xl md:rounded-3xl"></div>
        </div>

        <div className="p-4 md:p-6 bg-white">
          <div className="flex items-center gap-4 text-slate-500 bg-slate-50 p-4 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm">
            <ShieldCheck className="w-6 h-6 text-emerald-500 shrink-0" />
            <p className="text-[10px] font-black uppercase tracking-wide leading-relaxed">
              Letakkan kode di tengah area pindaian. Sensor akan bekerja
              otomatis setelah fokus tercapai.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes scan {
          0%, 100% { top: 10%; opacity: 0; }
          50% { top: 90%; opacity: 1; }
        }
      `}</style>
    </div>
  );
};

// --- MAIN APPLICATION COMPONENT ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: undefined,
      email: undefined,
      emailVerified: undefined,
      isAnonymous: undefined,
    },
    operationType,
    path
  };
  
  // Specific check for multi-field query indexes
  if (errMessage.includes("index") || errMessage.includes("FAILED_PRECONDITION")) {
    console.error("Firestore Index Error: You may need to create a composite index in Firebase Console. Check browser console logs for the direct link.");
    if (operationType !== OperationType.LIST && operationType !== OperationType.GET) {
      alert("Indeks Database Diperlukan: Hubungi admin untuk aktivasi indeks query.");
    }
    return;
  }

  if (errMessage.includes("quota-exceeded") || errMessage.includes("Quota exceeded")) {
    alert("Kuota Firebase Habis: Batas harian paket gratis telah tercapai. Saldo & bonus mungkin tidak update sampai kuota reset.");
    return;
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  // Don't crash on list/snapshot errors in production as much as possible
  if (operationType === OperationType.LIST || operationType === OperationType.GET) {
    if (errMessage.includes("permission-denied") || errMessage.includes("Missing or insufficient permissions")) {
      console.warn("Permission denied for:", path);
      return; 
    }
  }

  alert(`Kesalahan Database (${operationType}): ${errMessage.substring(0, 100)}...`);
  
  // Only throw for CRITICAL write errors that we cannot recover from
  if (operationType === OperationType.WRITE || operationType === OperationType.CREATE || operationType === OperationType.UPDATE || operationType === OperationType.DELETE) {
    throw new Error(JSON.stringify(errInfo));
  }
}

function ProductResultGrid({
  products,
  stocks,
  branchId,
  search,
  selectedId,
  onSelect,
}: {
  products: any[];
  stocks: any[];
  branchId: string;
  search: string;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (!search.trim()) return null;

  const list = products.filter(
    (p) =>
      !search ||
      (p?.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (p?.barcode || "").includes(search) ||
      (p?.brand || "").toLowerCase().includes(search.toLowerCase()),
  );
  const stockOf = (id: string) =>
    stocks.find((s) => s.productId === id && s.branchId === branchId)?.qty || 0;

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="grid grid-cols-[1fr_4rem] bg-slate-800 text-slate-100">
        <div className="px-3 py-2 text-[8px] font-black uppercase tracking-widest">
          Nama Produk
        </div>
        <div className="px-3 py-2 text-[8px] font-black uppercase tracking-widest text-right border-l border-white/15">
          Stok
        </div>
      </div>
      <div data-opname-product-result-list className="max-h-60 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800 bg-white">
        {list.length === 0 ? (
          <div className="px-3 py-6 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Produk tidak ditemukan
          </div>
        ) : (
          list.map((p, i) => {
            const qty = stockOf(p.id);
            const selected = selectedId === p.id;
            const qtyColor =
              qty <= 0
                ? "text-rose-600 dark:text-rose-400"
                : qty < 5
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-slate-700 dark:text-slate-200";
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p.id)}
                className={`w-full grid grid-cols-[1fr_4rem] items-stretch text-left transition-colors border-l-4 ${
                  selected
                    ? "bg-blue-50 dark:bg-blue-500/15 border-blue-500"
                    : `${i % 2 === 1 ? "bg-slate-50/60" : "bg-white"} border-transparent hover:bg-slate-100`
                }`}
              >
                <div className="px-3 py-2 min-w-0">
                  <p className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-400 leading-none mb-0.5 truncate">
                    {p.brand || p.category || "UMUM"}
                  </p>
                  <p
                    className={`text-[11px] font-black uppercase leading-tight line-clamp-1 ${
                      selected
                        ? "text-blue-700 dark:text-blue-300"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {p.name}
                  </p>
                </div>
                <div
                  className={`px-2 py-2 flex items-center justify-end border-l border-slate-100 tabular-nums text-sm font-black ${qtyColor}`}
                >
                  {qty}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function CustomSelect({
  value,
  defaultValue,
  onChange,
  options,
  placeholder = "-- PILIH --",
  hiddenId,
  className = "",
  buttonClassName = "",
  keepTriggerBg = false,
  disabled = false,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  hiddenId?: string;
  className?: string;
  buttonClassName?: string;
  keepTriggerBg?: boolean;
  disabled?: boolean;
}) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const current = isControlled ? (value as string) : internal;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxH: number;
  } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 170);
    let left = r.left;
    const vw = window.innerWidth;
    if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const up = spaceBelow < 240 && spaceAbove > spaceBelow;
    const maxH = Math.max(120, Math.min(256, (up ? spaceAbove : spaceBelow) - 16));
    setPos({
      left,
      width,
      top: up ? undefined : r.bottom + 6,
      bottom: up ? window.innerHeight - r.top + 6 : undefined,
      maxH,
    });
  };

  const toggle = () => {
    if (disabled) return;
    if (!open) place();
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScrollResize = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
    };
  }, [open]);

  useEffect(() => {
    if (isControlled || current === "") return;
    if (!options.some((o) => o.value === current)) {
      const fallback = defaultValue ?? "";
      setInternal(options.some((o) => o.value === fallback) ? fallback : "");
    }
  }, [options, isControlled, current, defaultValue]);

  const selected = options.find((o) => o.value === current);
  const label = selected ? selected.label : placeholder;

  const choose = (v: string) => {
    if (!isControlled) setInternal(v);
    onChange?.(v);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      {hiddenId && (
        <input type="hidden" id={hiddenId} value={current} readOnly />
      )}
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className={`${keepTriggerBg ? "" : "app-select-trigger"} inline-flex items-center justify-between gap-2 text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${buttonClassName}`}
      >
        <span className={`truncate ${selected ? "" : "opacity-60"}`}>
          {label}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 opacity-60 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              zIndex: 9500,
            }}
            className="app-solid bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div
              className="overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800"
              style={{ maxHeight: pos.maxH }}
            >
              {options.length === 0 ? (
                <div className="px-4 py-4 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Tidak ada pilihan
                </div>
              ) : (
                options.map((o, i) => {
                  const active = o.value === current;
                  return (
                    <button
                      key={o.value + "_" + i}
                      type="button"
                      onClick={() => choose(o.value)}
                      className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide transition-colors ${
                        active
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                          : `${i % 2 === 1 ? "bg-slate-50/60" : "bg-white"} text-slate-700 dark:text-slate-200 hover:bg-slate-100`
                      }`}
                    >
                      <span className="truncate">{o.label}</span>
                      {active && (
                        <Check className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function buildShiftReadQueryParams(
  reportView: boolean,
  branchId: string | undefined,
  startDate: string,
  endDate: string,
): Record<string, string> {
  const params: Record<string, string> = {};
  if (branchId) params.branchId = branchId;
  if (reportView) {
    if (startDate && endDate) {
      params.shiftDateFrom = startDate;
      params.shiftDateTo = endDate;
    }
  } else {
    params.status = "open";
  }
  return params;
}

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("theme");
    return saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const readEpoch = useRef(0);

  // Firestore Data States
  const [users, setUsers] = useState<any[]>([]);
  const [resetUser, setResetUser] = useState<any | null>(null);
  const [newPassInput, setNewPassInput] = useState("");
  const [isUpdatingPass, setIsUpdatingPass] = useState(false);
  const [branches, setBranches] = useState<any[]>([]);
  const [transferTargetBranches, setTransferTargetBranches] = useState<any[]>([]);
  const [transferTargetsLoading, setTransferTargetsLoading] = useState(false);
  const [transferTargetsError, setTransferTargetsError] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [isSearchingProducts, setIsSearchingProducts] = useState(false);
  const loadMoreProducts = async () => {};
  const loadMoreSales = async () => {};
  const fetchTransferTargetsForRole = useCallback(
    async (
      role: string,
      signal?: AbortSignal,
    ): Promise<{ data: any[]; error: string | null }> => {
      if (role !== "CASHIER") return { data: [], error: null };
      try {
        return {
          data: await api.getTransferTargetBranches(signal),
          error: null,
        };
      } catch (error) {
        return {
          data: [],
          error: error instanceof Error ? error.message : "Gagal memuat cabang tujuan.",
        };
      }
    },
    [],
  );

  const handleFullDatabaseSearch = async () => {
    if (!searchTerm || searchTerm.length < 3) return;
    setIsSearchingProducts(true);
    try {
      const term = searchTerm.trim();
      const termUpper = term.toUpperCase();
      // Search the already-loaded local product list (loaded from the API).
      // 1. Exact barcode match
      let results = products.filter((p) => p.barcode && String(p.barcode) === term);
      // 2. Fallback: name contains match
      if (results.length === 0) {
        results = products
          .filter((p) => (p.name || "").toUpperCase().includes(termUpper))
          .slice(0, 20);
      }

      if (results.length > 0) {
        setSearchSuggestions(results.slice(0, 10));
      } else {
        alert("Pencarian spesifik tidak membuahkan hasil. Silakan cari per kategory di menu Produk.");
      }
    } catch (e) {
      console.error("Full search error:", e);
    } finally {
      setIsSearchingProducts(false);
    }
  };

  const stocks = useMemo(() => {
    const result: any[] = [];
    products.forEach((p) => {
      if (p.stocks) {
        Object.entries(p.stocks).forEach(([branchId, qty]) => {
          result.push({
            id: `${branchId}_${p.id}`,
            productId: p.id,
            branchId,
            qty: qty,
          });
        });
      }
    });
    return result;
  }, [products]);
  const [sales, setSales] = useState<any[]>([]);
  const [productSalesQuantities, setProductSalesQuantities] = useState<Record<string, number>>({});
  const [appConfig, setAppConfig] = useState<any>({
    allowCashierStockInput: true,
  });
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [commissionsSummary, setCommissionsSummary] = useState<any>(null);
  const [branchSummaries, setBranchSummaries] = useState<Record<string, any>>({});
  const [shoppingPlans, setShoppingPlans] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);

  // Navigation State
  const [activeMenu, setActiveMenu] = useState<
    | "dashboard"
    | "pos"
    | "inventory"
    | "employees"
    | "settings"
    | "branch_stocks"
    | "shopping_list"
    | "audit"
    | "stock_audit"
    | "shift"
    | "cashier_stock"
    | "reports"
    | "incentive"
  >(() => {
    const valid = ["dashboard","pos","inventory","employees","settings","branch_stocks","shopping_list","audit","stock_audit","shift","cashier_stock","reports","incentive"];
    const saved = localStorage.getItem("active_menu");
    return (saved && valid.includes(saved) ? saved : "dashboard") as any;
  });
  const [auditSidebarTab, setAuditSidebarTab] = useState<
    "incoming" | "disposal" | "transfer" | "logs"
  >("incoming");
  const [auditProductSearch, setAuditProductSearch] = useState("");
  const [auditSelectedProductId, setAuditSelectedProductId] = useState("");
  const [posSubView, setPosSubView] = useState<
    "billing" | "history" | "maintenance" | "transfer"
  >("billing");
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [quickAuditProduct, setQuickAuditProduct] = useState<any>(null);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  // General App States
  const [cart, setCart] = useState<
    { product: any; qty: number; sn?: string }[]
  >([]);
  const [heldTransactions, setHeldTransactions] = useState<
    { id: string; label: string; items: { product: any; qty: number; sn?: string }[]; total: number; itemsCount: number; createdAt: string }[]
  >([]);
  const [showHeldList, setShowHeldList] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [posSelectedCategory, setPosSelectedCategory] = useState("Semua");
  const [posSelectedBrand, setPosSelectedBrand] = useState("Semua");
  const [adminSalesBranchFilter, setAdminSalesBranchFilter] = useState("");
  const [adminSalesDateFilter, setAdminSalesDateFilter] = useState("today");
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportSubTab, setReportSubTab] = useState<"summary" | "excel">("summary");
  const [reportEndDate, setReportEndDate] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const [scanIndicator, setScanIndicator] = useState<string | null>(null);
  const [dashboardTab, setDashboardTab] = useState<"overview" | "sales" | "inventory">("overview");
  const expireReadSession = useCallback(() => {
    readEpoch.current++;
    localStorage.removeItem("token");
    localStorage.removeItem("active_menu");
    clearSyncedReads();
    setBranches([]);
    setTransferTargetBranches([]);
    setTransferTargetsLoading(false);
    setTransferTargetsError(null);
    setProfile(null);
    setAuthLoading(false);
    setActiveMenu("pos");
  }, []);
  const ownerDashboard = useOwnerDashboard(
    !authLoading && profile?.role === "ADMIN" && activeMenu === "dashboard" && dashboardTab !== "inventory",
    profile?.id, adminSalesBranchFilter, setProducts, expireReadSession,
  );
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [paymentSuccessOverlay, setPaymentSuccessOverlay] = useState<{ total: number; saleId: string; itemCount: number } | null>(null);
  const [isProcessingTransfer, setIsProcessingTransfer] = useState(false);
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);
  const [isProcessingStock, setIsProcessingStock] = useState(false);
  const [isProcessingWithdraw, setIsProcessingWithdraw] = useState(false);
  const [isClosingShift, setIsClosingShift] = useState(false);

  // Helper to attribute commissions correctly even with rolling shifts (shared device)
  const isCommissionForUser = (c: any, u: any) => {
    if (!u) return false;
    if (c.cashierName) {
      const isMatch = c.cashierName === u.name || (u.alternativeNames && u.alternativeNames.includes(c.cashierName));
      return isMatch && c.branchId === u.branchId;
    }
    return c.cashierId === u.id;
  };

  const getMyCommissions = () => {
    return commissions.filter(c => c.branchId === profile?.branchId);
  };
  const getMyCommissionTotal = (status: "withdrawn" | "refunded") => {
    const branchId = profile?.branchId;
    if (!branchId) return 0;
    return Number(commissionsSummary?.byBranchStatus?.[branchId]?.[status] || 0);
  };

  const [shiftOpen, setShiftOpen] = useState(() => {
    try {
      return localStorage.getItem("shift_open") === "true";
    } catch {
      return false;
    }
  });
  const [currentShiftId, setCurrentShiftId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("current_shift_id");
    } catch {
      return null;
    }
  });
  const [cashierName, setCashierName] = useState(() => {
    try {
      return (
        (typeof window !== "undefined"
          ? localStorage.getItem("cashier_name")
          : "") || ""
      );
    } catch {
      return "";
    }
  });
  const [shiftType, setShiftType] = useState<"Pagi" | "Malam" | null>(() => {
    try {
      return localStorage.getItem("shift_type") as any;
    } catch {
      return null;
    }
  });
  const [shiftStartTime, setShiftStartTime] = useState<string | null>(() => {
    try {
      return localStorage.getItem("shift_start_time");
    } catch {
      return null;
    }
  });
  const [shiftLogicalDate, setShiftLogicalDate] = useState(() => {
    try {
      return localStorage.getItem("shift_logical_date") || "";
    } catch {
      return "";
    }
  });
  const [isOnline, setIsOnline] = useState(true);
  // dataLoadFailed = true when loadData() encounters a non-auth server error,
  // so the cashier sees a visible warning instead of silently working with stale data.
  const [readLoadFailed, setDataLoadFailed] = useState(false);
  const [salesReadFailed, setSalesReadFailed] = useState(false);
  const [salesReadLoading, setSalesReadLoading] = useState(false);
  const usesOwnerSync = profile?.role === "ADMIN" && activeMenu === "dashboard" && dashboardTab !== "inventory";
  const dataLoadFailed = usesOwnerSync
    ? Boolean(ownerDashboard.error || ownerDashboard.detailsError || ownerDashboard.stockError)
    : readLoadFailed || salesReadFailed;
  const fullRefreshRef = useRef<() => void>(() => {});
  const salesRefreshRef = useRef<() => void>(() => {});
  const previousReadScope = useRef("");
  // Incrementing this forces the data-sync useEffect to re-run (manual refresh).
  const [refreshTick, setRefreshTick] = useState(0);

  const bestSellers = useMemo(() => {
    return products
      .filter(p => !p.visibleBranchIds || p.visibleBranchIds === "*" || (profile?.branchId && p.visibleBranchIds.split(",").map((id: string) => id.trim()).includes(profile.branchId)))
      .map(p => ({ ...p, totalSold: productSalesQuantities[p.id] || 0 }))
      .filter(p => p.totalSold > 0)
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, 6)
      .sort((a, b) => a.sellingPrice - b.sellingPrice);
  }, [products, productSalesQuantities, profile?.branchId]);
  const [showShiftSummary, setShowShiftSummary] = useState<number | null>(null);
  const [reportedIncomeInput, setReportedIncomeInput] = useState<string>("");
  const [globalAlerts, setGlobalAlerts] = useState<{ id: string; message: string; type: "info" | "warning" | "success" | "error" }[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ message: string; resolve: (res: boolean) => void } | null>(null);

  // Android back-button intercept refs
  const isPopstateNav = useRef(false);
  const backPressedOnce = useRef(false);
  const backPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Expose async confirm triggers globally
  const triggerConfirm = (message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmModal({ message, resolve });
    });
  };

  // Native-style in-app prompt (replaces window.prompt, no website link shown)
  const [promptModal, setPromptModal] = useState<{ message: string; resolve: (res: string | null) => void } | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const triggerPrompt = (message: string, defaultValue = ""): Promise<string | null> => {
    setPromptValue(defaultValue);
    return new Promise((resolve) => {
      setPromptModal({ message, resolve });
    });
  };

  useEffect(() => {
    const handleCustomAlert = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string; type?: "info" | "warning" | "success" | "error" }>;
      const message = customEvent.detail?.message || String(customEvent.detail);
      const type = customEvent.detail?.type || "info";
      
      const id = Math.random().toString(36).substring(2, 9);
      setGlobalAlerts((prev) => [...prev, { id, message, type }]);

      // Auto dismiss
      setTimeout(() => {
        setGlobalAlerts((prev) => prev.filter((a) => a.id !== id));
      }, 5000);
    };

    window.addEventListener("app-custom-alert" as any, handleCustomAlert);

    // Override original window.alert safety
    const originalAlert = window.alert;
    window.alert = (msg: string) => {
      const text = String(msg ?? "");
      const lower = text.toLowerCase();
      const successWords = ["berhasil", "selesai", "sukses", "ditambahkan", "dicatat", "tersimpan", "disimpan", "diperbarui", "dibersihkan", "ditransfer", "dicairkan", "dipatenkan", "ditutup & dipatenkan"];
      const failureWords = ["gagal", "tidak cukup", "tidak mencukupi", "tidak valid", "belum dibuka", "tidak dapat", "tidak ditemukan", "tidak berhasil", "bermasalah", "ditolak", "tidak tersedia", "tidak ada shift"];
      const type: "info" | "warning" | "success" | "error" = failureWords.some((w) => lower.includes(w))
        ? "error"
        : successWords.some((w) => lower.includes(w))
          ? "success"
          : "info";
      // Dispatches custom event
      window.dispatchEvent(
        new CustomEvent("app-custom-alert", {
          detail: { message: text, type }
        })
      );
    };

    return () => {
      window.removeEventListener("app-custom-alert" as any, handleCustomAlert);
      window.alert = originalAlert;
    };
  }, []);

  const getProductName = (p: any, fallback?: string) => {
    if (!p) return fallback || "Bonus";
    const provider = (p.provider || p.brand || "").trim();
    let displayName = (p.name || fallback || "Produk").trim();
    
    // Voucher/Perdana: stored name format is "Voucher Telkomsel - 5GB 3 Hari".
    // Strip the generic category prefix so display reads "Telkomsel - 5GB 3 Hari".
    // The old logic replaced "Voucher" with provider which caused "Telkomsel Telkomsel ..." duplication.
    if (p.category === "Voucher" || p.category?.includes("Perdana")) {
      displayName = displayName
        .replace(/^Voucher\s+/i, "")
        .replace(/^Perdana\s+Kuota\s+/i, "")
        .replace(/^Perdana\s+/i, "")
        .trim();
      // If provider is still missing from display name, prepend it.
      if (provider && !displayName.toLowerCase().startsWith(provider.toLowerCase())) {
        displayName = `${provider} ${displayName}`.trim();
      }
    }
    return displayName;
  };

  const getShiftTypePref = (type?: string) => {
    if (!type) return "";
    if (type.includes(" - ")) return type.split(" - ")[0];
    return type;
  };

  const getShiftKeeperName = (sh: any) => {
    if (!sh) return "Kasir";
    if (sh.shiftType && sh.shiftType.includes(" - ")) return sh.shiftType.split(" - ")[1];
    return sh.cashier?.name || "Kasir";
  };

  const getConfiguredKeeperNames = (employee: {
    name?: string | null;
    displayName?: string | null;
    alternativeNames?: string | null;
  }) => {
    const names = [
      employee.name || employee.displayName || "",
      ...(employee.alternativeNames || "").split(","),
    ]
      .map((name) => name.trim())
      .filter(Boolean);
    return names.filter((name, index) => names.indexOf(name) === index);
  };

  const displayedAccountName = profile?.name || "?";
  const displayedAccountLogin = profile?.username || displayedAccountName;
  const displayedBranchName =
    branches.find((branch) => branch.id === profile?.branchId)?.name ||
    (profile?.role === "CASHIER"
      ? profile?.branchId
        ? "Cabang belum termuat"
        : "Cabang belum ditetapkan"
      : "Pusat");
  const activeCashierName =
    profile?.role === "CASHIER" && shiftOpen ? cashierName.trim() : "";
  const displayedCashierName = activeCashierName || displayedAccountName;

  const getSaleCashierName = (sale: any) => {
    if (!sale) return "Kasir";
    if (sale.cashierName) return sale.cashierName;
    if (!sale.createdAt) return sale.cashier?.name || "Kasir";
    
    const saleTime = new Date(sale.createdAt).getTime();
    const activeShift = shifts.find((sh: any) => {
      if (sh.branchId !== sale.branchId) return false;
      const openTime = new Date(sh.openTime).getTime();
      const closeTime = sh.closeTime ? new Date(sh.closeTime).getTime() : Date.now() + 60000;
      return saleTime >= openTime && saleTime <= closeTime;
    });
    if (activeShift) {
      return getShiftKeeperName(activeShift);
    }
    return sale.cashier?.name || "Kasir";
  };

  const getCommissionCashierName = (comm: any) => {
    if (!comm) return "Karyawan";
    if (comm.cashierName) return comm.cashierName;
    const commTime = new Date(comm.createdAt).getTime();
    const activeShift = shifts.find((sh: any) => {
      if (sh.branchId !== comm.branchId) return false;
      const openTime = new Date(sh.openTime).getTime();
      const closeTime = sh.closeTime ? new Date(sh.closeTime).getTime() : Date.now() + 60000;
      return commTime >= openTime && commTime <= closeTime;
    });
    if (activeShift) {
      return getShiftKeeperName(activeShift);
    }
    return comm.cashier?.name || "Karyawan";
  };

  useEffect(() => {
    // connectivity check
    const checkConn = async () => {
      try {
        const res = await api.getHealth();
        setIsOnline(res.status === "ok");
      } catch {
        setIsOnline(false);
      }
    };
    checkConn();
    const interval = setInterval(checkConn, 30000);
    return () => clearInterval(interval);
  }, []);

  // Opt-in, local-only browser memory sampling for Chromium diagnostics.
  // Enable from DevTools with:
  // localStorage.setItem("kasirv10:memory-diagnostics", "1")
  useEffect(() => {
    let enabled = false;
    try {
      enabled = localStorage.getItem("kasirv10:memory-diagnostics") === "1";
    } catch {
      return;
    }
    if (!enabled) return;

    type ChromiumPerformance = Performance & {
      memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
    };
    const sample = () => {
      const memory = (performance as ChromiumPerformance).memory;
      if (!memory) {
        console.info("KASIRV10_BROWSER_MEMORY_UNAVAILABLE", { activeMenu });
        return;
      }
      console.info("KASIRV10_BROWSER_MEMORY_SAMPLE", {
        activeMenu,
        usedJSHeapMiB: Math.round(memory.usedJSHeapSize / 1024 / 1024 * 100) / 100,
        totalJSHeapMiB: Math.round(memory.totalJSHeapSize / 1024 / 1024 * 100) / 100,
        heapLimitMiB: Math.round(memory.jsHeapSizeLimit / 1024 / 1024 * 100) / 100,
        sampledAt: new Date().toISOString(),
      });
    };
    sample();
    const timer = window.setInterval(sample, 30_000);
    return () => window.clearInterval(timer);
  }, [activeMenu]);

  // Persist Shift
  useEffect(() => {
    try {
      localStorage.setItem("shift_open", shiftOpen.toString());
      if (currentShiftId) localStorage.setItem("current_shift_id", currentShiftId);
      else localStorage.removeItem("current_shift_id");
      localStorage.setItem("cashier_name", cashierName);
      if (shiftType) localStorage.setItem("shift_type", shiftType);
      else localStorage.removeItem("shift_type");
      if (shiftStartTime)
        localStorage.setItem("shift_start_time", shiftStartTime);
      else localStorage.removeItem("shift_start_time");
      if (shiftLogicalDate)
        localStorage.setItem("shift_logical_date", shiftLogicalDate);
      else localStorage.removeItem("shift_logical_date");
    } catch (e) {
      console.warn("Storage access failed:", e);
    }
  }, [shiftOpen, currentShiftId, cashierName, shiftType, shiftStartTime, shiftLogicalDate]);

  // Handle Initial Redirect based on Role
  useEffect(() => {
    if (profile && activeMenu === "dashboard") {
      if (profile?.role === "CASHIER") setActiveMenu("pos");
      if (profile?.role === "AUDIT") setActiveMenu("audit");
    }
  }, [profile]);

  // --- Android back button: seed initial history entry once ---
  useEffect(() => {
    window.history.replaceState({ menu: activeMenu }, "");
  }, []);

  // --- Android back button: push a new history entry whenever page changes ---
  useEffect(() => {
    if (isPopstateNav.current) {
      // This navigation came FROM popstate — don't push again, just reset flag
      isPopstateNav.current = false;
      return;
    }
    window.history.pushState({ menu: activeMenu }, "");
  }, [activeMenu]);

  // --- Android back button: intercept popstate (hardware/gesture back) ---
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const prevMenu = e.state?.menu as string | undefined;

      if (prevMenu) {
        // Navigate within app to the previous page
        isPopstateNav.current = true;
        setActiveMenu(prevMenu as any);
        // Clear any pending exit toast
        if (backPressTimer.current) clearTimeout(backPressTimer.current);
        backPressedOnce.current = false;
      } else {
        // Below the app's history stack — double-back-press to exit
        // Push a guard entry back so next back press is interceptable
        window.history.pushState({ menu: activeMenu }, "");

        if (backPressedOnce.current) {
          // Second press within 2 s → actually exit (go back past our guard)
          if (backPressTimer.current) clearTimeout(backPressTimer.current);
          backPressedOnce.current = false;
          window.history.go(-2); // skip the guard entry we just pushed
        } else {
          backPressedOnce.current = true;
          const id = `exit-${Date.now()}`;
          setGlobalAlerts((prev) => [
            ...prev,
            { id, message: "Tekan tombol kembali sekali lagi untuk keluar.", type: "warning" },
          ]);
          backPressTimer.current = setTimeout(() => {
            backPressedOnce.current = false;
            setGlobalAlerts((prev) => prev.filter((a) => a.id !== id));
          }, 2500);
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (backPressTimer.current) clearTimeout(backPressTimer.current);
    };
  }, [activeMenu]);

  useEffect(() => {
    if (activeMenu === "shift" && !shiftOpen) {
      const hour = new Date().getHours();
      setShiftType(hour >= 7 && hour < 19 ? "Pagi" : "Malam");
    }
  }, [activeMenu, shiftOpen]);

  // Form States
  const [newBranch, setNewBranch] = useState("");
  const [auditBranchSelection, setAuditBranchSelection] = useState<{
    userId: string;
    branchId: string;
  } | null>(null);
  const auditSelectedBranch =
    auditBranchSelection && auditBranchSelection.userId === profile?.id
      ? auditBranchSelection.branchId
      : "";
  const setAuditSelectedBranch = (branchId: string) => {
    if (!profile?.id) return;
    setAuditBranchSelection({ userId: profile.id, branchId });
  };
  const activeAuditBranch = useRef(auditSelectedBranch);
  activeAuditBranch.current = auditSelectedBranch;
  const [drillPath, setDrillPath] = useState<string[]>([]);
  const [transferDrillPath, setTransferDrillPath] = useState<string[]>([]);
  const [transferSearch, setTransferSearch] = useState("");
  const [selectedTransferProduct, setSelectedTransferProduct] =
    useState<any>(null);
  const [shoppingListBranch, setShoppingListBranch] = useState("");
  const [shoppingListCategory, setShoppingListCategory] = useState("");
  const [hiddenShoppingBranchIds, setHiddenShoppingBranchIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("hiddenShoppingBranchIds");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const toggleBranchShoppingHidden = (branchId: string) => {
    setHiddenShoppingBranchIds((prev) => {
      const next = prev.includes(branchId)
        ? prev.filter((id) => id !== branchId)
        : [...prev, branchId];
      localStorage.setItem("hiddenShoppingBranchIds", JSON.stringify(next));
      return next;
    });
  };

  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [planDraftItems, setPlanDraftItems] = useState<
    { productId: string; branchQtys: { [bid: string]: string } }[]
  >([]);
  const [planDraftTitle, setPlanDraftTitle] = useState("");

  // Product Form States
  const [showProductForm, setShowProductForm] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [newUserDraft, setNewUserDraft] = useState({ username: "", password: "", name: "", role: "CASHIER", branchId: "" });
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerCallback, setScannerCallback] = useState<
    (code: string) => void
  >(() => {});
  const searchInputRef = useRef<HTMLInputElement>(null);


  const [prodCategory, setProdCategory] = useState("Aksesoris");
  const [prodSubCategory, setProdSubCategory] = useState("Kabel Data");
  const [prodBrand, setProdBrand] = useState("Robot");
  const [prodProvider, setProdProvider] = useState("Telkomsel");
  const [prodType, setProdType] = useState("");
  const [prodDesc, setProdDesc] = useState("");
  const [prodCapital, setProdCapital] = useState("");
  const [prodSell, setProdSell] = useState("");
  const [prodDiscount, setProdDiscount] = useState("");
  const [prodBarcode, setProdBarcode] = useState("");
  const [prodExpiredAt, setProdExpiredAt] = useState("");
  const [prodMinStock, setProdMinStock] = useState("0");
  const [prodCommission, setProdCommission] = useState("0");
  const [prodMasterSN, setProdMasterSN] = useState("");
  const [prodSize, setProdSize] = useState("");
  const [prodVisibleBranchIds, setProdVisibleBranchIds] = useState<string>("*");

  const PRODUCT_HIERARCHY = {
    "Aksesoris": {
      brands: ["Robot", "Vivan", "Foomee", "Oraimo", "Baseus", "Anker", "Jete", "Lenyes", "Kivee", "Olike", "Rexsi", "Acome", "Ugreen", "Newest"],
      models: ["Charger", "Kepala Charger", "Flashdisk", "Headset", "Headset Bluetooth", "Kabel Data", "Powerbank", "Tempered Glass", "Speaker", "Casing"]
    },
    "Voucher": {
      providers: ["Telkomsel", "Indosat", "XL", "Axis", "Tri", "Smartfren"]
    },
    "Kartu Perdana Kuota": {
      providers: ["Telkomsel", "Indosat", "XL", "Axis", "Tri", "Smartfren"]
    },
    "Kartu Perdana Biasa": {
      providers: ["Telkomsel", "Indosat", "XL", "Axis", "Tri", "Smartfren"]
    },
    "Handphone": {
      brands: {
        "Samsung": ["Galaxy S24", "Galaxy A55", "Galaxy A35", "Galaxy S23"],
        "iPhone": ["iPhone 15", "iPhone 14", "iPhone 13", "iPhone 12"],
        "Xiaomi": ["Redmi Note 13", "Xiaomi 13T", "Poco X6"],
        "Vivo": ["V30", "Y27", "Y17s"],
        "Oppo": ["Reno 11", "A98", "A58"],
        "Realme": ["12 Pro+", "C67", "C55"],
        "Infinix": ["Note 40", "Hot 40", "Smart 8"],
        "Redmi": ["Note 12", "12", "10"]
      }
    }
  };

  const DEFAULT_CATEGORIES = [
    "Aksesoris",
    "Voucher",
    "Kartu Perdana Kuota",
    "Kartu Perdana Biasa",
    "Handphone",
    "Parfum",
    "Lain-lain"
  ];
  const BRANDS = [
    "Robot",
    "Vivan",
    "Rexsi",
    "Kivee",
    "Olike",
    "Oraimo",
    "Foomee",
    "Grotic",
    "Lenyes",
    "Jete",
    "Baseus",
    "Acome",
    "Ugreen",
    "Newest",
  ];
  const PROVIDERS = [
    "Telkomsel",
    "Indosat",
    "XL",
    "Smartfren",
    "Tri",
    "Axis",
  ];

  const PARFUM_TYPES = [
    "EDP",
    "EDT",
    "EDC",
    "Body Mist",
    "Parfum Refill",
    "Bibit Parfum",
  ];

  // Dynamic Suggestion Lists for Product Form
  const dynamicCategories = useMemo(() => {
    const existing = products.map((p) => p.category).filter(Boolean);
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...existing]));
  }, [products]);

  const dynamicBrands = useMemo(() => {
    if (prodCategory === "Aksesoris") {
      return buildProductSuggestions(
        PRODUCT_HIERARCHY["Aksesoris"].brands,
        products,
        prodCategory,
        "brand",
      );
    }
    if (prodCategory === "Handphone") {
      return buildProductSuggestions(
        Object.keys(PRODUCT_HIERARCHY["Handphone"].brands),
        products,
        prodCategory,
        "brand",
      );
    }
    if (["Voucher", "Kartu Perdana Kuota", "Kartu Perdana Biasa"].includes(prodCategory))
      return buildProductSuggestions(
        PRODUCT_HIERARCHY["Voucher"].providers,
        products,
        prodCategory,
        "provider",
      );

    return buildProductSuggestions(BRANDS, products, prodCategory, "brand");
  }, [products, prodCategory]);

  const dynamicSubCategories = useMemo(() => {
    if (prodCategory === "Aksesoris") {
      return buildProductSuggestions(
        PRODUCT_HIERARCHY["Aksesoris"].models,
        products,
        prodCategory,
        "subCategory",
      );
    }
    if (prodCategory === "Parfum") {
      return buildProductSuggestions(
        PARFUM_TYPES,
        products,
        prodCategory,
        "subCategory",
      );
    }
    if (prodCategory === "Handphone" && prodBrand) {
      const brands: Readonly<Record<string, string[] | undefined>> =
        PRODUCT_HIERARCHY["Handphone"].brands;
      const matchingBrand = Object.keys(brands).find(
        (brand) => brand.trim().toLowerCase() === prodBrand.trim().toLowerCase(),
      );
      return buildProductSuggestions(
        matchingBrand ? brands[matchingBrand] || [] : [],
        products,
        prodCategory,
        "subCategory",
        prodBrand,
      );
    }
    return [];
  }, [products, prodCategory, prodBrand]);

  const dynamicProviders = useMemo(() => {
    if (["Voucher", "Kartu Perdana Kuota", "Kartu Perdana Biasa"].includes(prodCategory))
      return buildProductSuggestions(
        PRODUCT_HIERARCHY["Voucher"].providers,
        products,
        prodCategory,
        "provider",
      );

    return buildProductSuggestions(PROVIDERS, products, prodCategory, "provider");
  }, [products, prodCategory]);



  // Auto-focus search input in POS
  useEffect(() => {
    if (activeMenu === "pos" && shiftOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [activeMenu, shiftOpen]);

  // Global Key Listener for Quick Search
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (activeMenu === "pos" && shiftOpen && searchInputRef.current) {
        // If not in an input, focus the search input
        if (document.activeElement?.tagName !== "INPUT" && e.key.length === 1) {
          searchInputRef.current.focus();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [activeMenu, shiftOpen]);

  // Enhanced search and sort by price logic
  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    if (!val) {
      setSearchSuggestions([]);
      return;
    }

    const searchLower = val.toLowerCase();
    const searchWords = searchLower.split(/\s+/).filter(Boolean);

    const filtered = products
      .filter((p) => {
        if (!p) return false;

        // Visibility check
        const visibleIds = p.visibleBranchIds || "*";
        const isVisible = visibleIds === "*" || (profile?.branchId && visibleIds.split(",").map((id: string) => id.trim()).includes(profile.branchId));
        if (!isVisible && profile?.role !== "ADMIN") return false; 

        const name = (p.name || "").toLowerCase();
        const barcode = (p.barcode || "").toLowerCase();
        const type = (p.type || "").toLowerCase();
        const brand = (p.brand || "").toLowerCase();
        const category = (p.category || "").toLowerCase();
        const masterSN = (p.masterSN || "").toLowerCase();
        // provider hanya dipakai untuk kategori operator — hindari Aksesoris lama
        // yang masih punya provider=Telkomsel muncul saat cari "telko"
        const isOperatorCat = ["voucher","kartu perdana kuota","kartu perdana biasa"].includes(category);
        const provider = isOperatorCat ? (p.provider || "").toLowerCase() : "";

        return searchWords.every(word => 
          name.includes(word) || 
          barcode.includes(word) || 
          type.includes(word) ||
          brand.includes(word) ||
          category.includes(word) ||
          provider.includes(word) ||
          masterSN.includes(word)
        );
      })
      .sort((a, b) => {
        // Price comparison (Lowest to Highest)
        const getPrice = (p: any) => p.discountPrice > 0 ? p.discountPrice : p.sellingPrice;
        const priceA = getPrice(a);
        const priceB = getPrice(b);
        
        if (priceA !== priceB) return priceA - priceB;
        
        // Secondary sort: Relevance (starts with)
        const nameA = (a.name || "").toLowerCase();
        const nameB = (b.name || "").toLowerCase();
        const startsA = nameA.startsWith(searchLower);
        const startsB = nameB.startsWith(searchLower);
        if (startsA && !startsB) return -1;
        if (!startsA && startsB) return 1;

        return nameA.localeCompare(nameB);
      })
      .slice(0, 15);
    setSearchSuggestions(filtered);
  };

  // Setup Firebase Listeners
  const naturalSort = (a: string, b: string) => {
    return (a || "").localeCompare(b || "", undefined, {
      numeric: true,
      sensitivity: "base",
    });
  };

  const formatDateLocal = (dateInput: any) => {
    if (!dateInput) return "";
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatCompactShiftDate = (dateInput: unknown) => {
    const rawDate = String(dateInput ?? "");
    const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1].slice(-2)}` : rawDate || "N/A";
  };

  const productMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const branchMap = useMemo(() => new Map(branches.map(b => [b.id, b])), [branches]);

  const branchModalData = useMemo(() => {
    return branches
      .map((b) => {
        const branchStocks = stocks.filter((s) => s.branchId === b.id);
        const totalModal = branchStocks.reduce((sum, s) => {
          const prod = productMap.get(s.productId) as any;
          return sum + (prod?.purchasePrice || 0) * (s.qty || 0);
        }, 0);
        const totalItems = branchStocks.reduce(
          (sum, s) => sum + (s.qty || 0),
          0,
        );
        return { ...b, totalModal, totalItems };
      })
      .sort((a, b) => naturalSort(a.name, b.name));
  }, [branches, stocks, products, productMap]);

  // --- SUMMARIES ---
  // Managed by loadData in main sync useEffect

  // --- CORE SYSTEM LISTENERS ---
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const epoch = readEpoch.current;
    let running = false;
    let needsRetry = false;
    const initAuth = async () => {
      if (running || disposed) return;
      running = true;
      needsRetry = false;
      const token = localStorage.getItem("token");
      const current = () => !disposed && readEpoch.current === epoch && localStorage.getItem("token") === token;
      if (token) {
        try {
          const userData = await api.getMe(controller.signal);
          if (!current()) return;
          setProfile(userData);
          setTransferTargetsLoading(userData.role === "CASHIER");
          const [bData, pData, cData, transferTargetsResult] = await Promise.all([
            api.getBranches(controller.signal),
            api.getProducts(controller.signal),
            fetch("/api/config", {
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }).then(async (res) => {
              const body = await res.json();
              if (!res.ok) throw new ReadError("http", res.status, body.error);
              return body;
            }),
            fetchTransferTargetsForRole(userData.role, controller.signal),
          ]);
          if (!current()) return;
          setBranches(
            bData.sort((a: any, b: any) =>
              (a.name || "").localeCompare(b.name || ""),
            ),
          );
          setTransferTargetBranches(transferTargetsResult.data);
          setTransferTargetsError(transferTargetsResult.error);
          setTransferTargetsLoading(false);
          setProducts(pData);
          setAppConfig(cData);
          setAuthLoading(false);
        } catch (err) {
          if (current()) {
            setTransferTargetsLoading(false);
            if (isSessionError(err)) expireReadSession();
            else {
              needsRetry = true;
              setDataLoadFailed(true);
            }
          }
        } finally {
          if (current()) setAuthLoading(needsRetry);
        }
      } else {
        setAuthLoading(false);
      }
      running = false;
    };
    initAuth();
    // A temporary API restart must not turn a stored session into a login prompt.
    const retry = () => {
      if (needsRetry && readEpoch.current === epoch) void initAuth();
    };
    const timer = setInterval(retry, 5_000);
    window.addEventListener("online", retry);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, [fetchTransferTargetsForRole]);

  // NOTE: Real-time socket handling is consolidated in the DATA SYNC useEffect below.
  // A single socket connection per session handles all events (saleProcessed,
  // productUpdated, stockUpdated, commissionsUpdated, productDeleted) via loadData().
  // The separate socket here was removed to prevent duplicate connections accumulating
  // over long sessions and causing double loadData() calls on every event.

  // --- AUTH HANDLERS ---
  const handleLoginSubmit = async (credentials: any) => {
    const epoch = ++readEpoch.current;
    clearSyncedReads();
    setBranches([]);
    setTransferTargetBranches([]);
    setTransferTargetsLoading(false);
    setTransferTargetsError(null);
    setAuthLoading(true);
    try {
      const { user: userData } = await api.login(credentials);
      if (readEpoch.current !== epoch) return;
      const token = localStorage.getItem("token");
      setProfile(userData);
      setTransferTargetsLoading(userData.role === "CASHIER");
      const [bData, pData, transferTargetsResult] = await Promise.all([
        api.getBranches(),
        api.getProducts(),
        fetchTransferTargetsForRole(userData.role),
      ]);
      if (readEpoch.current !== epoch || localStorage.getItem("token") !== token) return;
      setBranches(bData.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: 'base' })));
      setTransferTargetBranches(transferTargetsResult.data);
      setTransferTargetsError(transferTargetsResult.error);
      setTransferTargetsLoading(false);
      setProducts(pData);
      if (userData.role === "ADMIN") setActiveMenu("dashboard");
      else if (userData.role === "AUDIT") setActiveMenu("audit");
      else if (userData.role === "CASHIER") setActiveMenu("pos");
    } catch (err: any) {
      if (readEpoch.current === epoch) {
        setTransferTargetsLoading(false);
        setDataLoadFailed(true);
        alert(err.message);
      }
    } finally {
      if (readEpoch.current === epoch) setAuthLoading(false);
    }
  };

  // Google / Firebase login removed — the app now uses local username + password
  // authentication only (handleLoginSubmit) so it can run on a local server.

  const handleAppLogout = () => {
    expireReadSession();
  };

  // Effect to reset UI states when menu changes + simpan posisi halaman agar tidak kembali ke awal saat refresh
  useEffect(() => {
    setShowUserForm(false);
    if (profile) localStorage.setItem("active_menu", activeMenu);
  }, [activeMenu, profile]);

  // --- BRANCH & ROLE DEPENDENT DATA LISTENERS ---
  const lastEffectiveBranchId = useRef<string | null>(null);

  // --- EXPIRY HELPER ---
  const getExpiryInfo = (expiredAt: string | null | undefined) => {
    if (!expiredAt) return null;
    const days = Math.ceil((new Date(expiredAt).getTime() - Date.now()) / 86_400_000);
    if (days < 0)  return { daysLeft: days, label: "KADALUARSA", urgency: "expired"   as const };
    if (days <= 7) return { daysLeft: days, label: `${days} hr`,  urgency: "critical"  as const };
    if (days <= 30) return { daysLeft: days, label: `${days} hr`, urgency: "warning"   as const };
    return null;
  };

  const cashierExpiringCount = useMemo(() => {
    if (profile?.role !== "CASHIER") return 0;
    return products.filter(p => getExpiryInfo(p.expiredAt) !== null).length;
  }, [products, profile]);

  // --- DATA SYNC (Stocks, Sales, Summaries, etc.) ---
  // Reacts only to filter changes, not every menu click
  const shopListAlertCount = useMemo(() => {
    if (profile?.role !== "ADMIN") return 0;
    let alertCount = 0;
    products.forEach((p) => {
      if (p.minStock > 0) {
        const visibleIds = p.visibleBranchIds || "*";
        branches.forEach((b) => {
          // Check if branch is disabled/hidden from shopping list
          if (hiddenShoppingBranchIds.includes(b.id)) return;

          const isProductVisibleInBranch = visibleIds === "*" || visibleIds.split(",").map((id: string) => id.trim()).includes(b.id);
          if (!isProductVisibleInBranch) return;

          const s = stocks.find(st => st.branchId === b.id && st.productId === p.id);
          if ((s ? s.qty : 0) <= p.minStock) alertCount++;
        });
      }
    });
    return alertCount;
  }, [products, branches, stocks, profile, hiddenShoppingBranchIds]);

  function clearSyncedReads() {
    setProducts([]);
    setSales([]);
    setProductSalesQuantities({});
    setSalesReadFailed(true);
    setCommissions([]);
    setShifts([]);
    setUsers([]);
    setAdjustments([]);
    setShoppingPlans([]);
    setCommissionsSummary(null);
    setBranchSummaries({});
    setDataLoadFailed(true);
  }

  const effectiveReadBranch = activeMenu === "audit"
    ? auditSelectedBranch || (profile?.role === "ADMIN" ? "" : "N/A")
    : profile?.role === "ADMIN" ? adminSalesBranchFilter : profile?.branchId;
  const currentPosShiftId = shiftOpen ? currentShiftId : null;
  const readScope = JSON.stringify([profile?.id, profile?.role, profile?.branchId, effectiveReadBranch]);
  const fullSyncEnabled = Boolean(profile && profile.role !== "PENDING" && !authLoading && !usesOwnerSync);
  const syncKey = `${readScope}:${fullSyncEnabled}`;
  const syncToken = localStorage.getItem("token");
  const shiftReadScope = JSON.stringify([
    syncToken, fullSyncEnabled, activeMenu, effectiveReadBranch,
    reportStartDate, reportEndDate, profile?.id, profile?.role, profile?.branchId,
  ]);
  const previousShiftReadScope = useRef("");
  const liveSyncKey = useRef(syncKey);
  liveSyncKey.current = syncKey;

  useEffect(() => {
    if (!fullSyncEnabled || !syncToken) return;
    // Owner income and recent sales use bounded, independent read-only requests.
    // Preserve the existing full synchronization for POS and the other menus.
    const isAdmin = profile.role === "ADMIN";
    const effectiveBranchId = effectiveReadBranch;
    let disposed = false;
    const controller = new AbortController();
    const epoch = readEpoch.current;
    setSales([]);
    setProductSalesQuantities({});
    setSalesReadFailed(true);
    const current = () => !disposed && !controller.signal.aborted &&
      liveSyncKey.current === syncKey && readEpoch.current === epoch &&
      localStorage.getItem("token") === syncToken;
    if (previousReadScope.current !== readScope) {
      clearSyncedReads();
      previousReadScope.current = readScope;
    }

    const loadData = async () => {
      if (!current()) return;
      salesRefreshRef.current();
      let failed = false;
      const read = async (request: () => Promise<any>, apply: (data: any[]) => void) => {
        if (!current()) return undefined;
        try {
          const data = await request();
          if (!Array.isArray(data)) throw new ReadError("invalid-response");
          if (!current()) return undefined;
          apply(data);
          return data;
        } catch (error) {
          if (!current()) return undefined;
          if (isSessionError(error)) {
            expireReadSession();
            controller.abort();
          } else {
            failed = true;
            console.error("Data read failed:", error);
          }
          return undefined;
        }
      };
      try {
        // Memuat sebagian secara parallel, sebagian berurutan agar tidak overload koneksi
        await read(() => api.getProducts(controller.signal), setProducts);
        await read(() => api.getCommissions({ branchId: effectiveBranchId }, controller.signal), setCommissions);
        
        await Promise.all([
          read(() => api.getUsers(controller.signal), setUsers),
          read(() => api.getAdjustments(controller.signal), setAdjustments),
        ]);
        if (!current()) return;
        
        // Also sync commission summaries
        const summaryOk = await syncCommissionsSummary(isAdmin ? undefined : profile?.branchId || undefined, {
          signal: controller.signal, isCurrent: current,
        });
        if (current()) setDataLoadFailed(failed || !summaryOk);
      } catch (err: any) {
        if (!current()) return;
        console.error("General data load error:", err);
        // If any request returns 401/403 (token expired or revoked), force logout
        // so the user is immediately sent to the login page instead of a stale/blank UI.
        if (isSessionError(err)) {
          expireReadSession();
        } else {
          // Non-auth error: server may be restarting or temporarily unreachable.
          // Mark data as stale so the cashier sees a visible warning and can retry.
          setDataLoadFailed(true);
        }
      }
    };

    const refresh = createReadRefresh(loadData);
    fullRefreshRef.current = refresh.schedule;
    refresh.schedule();

    // Single consolidated socket connection per session.
    // All real-time events trigger a full loadData() refresh from the DB.
    const socket = io({ auth: { token: syncToken }, autoConnect: false });
    socket.on("saleProcessed", refresh.schedule);
    socket.on("saleUpdated", refresh.schedule);
    socket.on("productUpdated", refresh.schedule);
    socket.on("productDeleted", refresh.schedule);
    socket.on("stockUpdated", refresh.schedule);
    socket.on("commissionsUpdated", refresh.schedule);
    // On reconnect, always do a full refresh so stale data from a network gap is corrected.
    socket.on("connect", refresh.schedule);
    socket.connect();
    const poll = setInterval(() => { if (!socket.connected) refresh.schedule(); }, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") refresh.schedule(); };
    window.addEventListener("online", refresh.schedule);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      refresh.dispose();
      controller.abort();
      clearInterval(poll);
      window.removeEventListener("online", refresh.schedule);
      document.removeEventListener("visibilitychange", onVisible);
      fullRefreshRef.current = () => {};
      socket.disconnect();
    };
  }, [syncKey, syncToken]);

  useEffect(() => {
    if (previousShiftReadScope.current !== shiftReadScope) {
      setShifts([]);
      previousShiftReadScope.current = shiftReadScope;
    }
    if (!fullSyncEnabled || !syncToken) {
      setShifts([]);
      return;
    }

    let disposed = false;
    const controller = new AbortController();
    const epoch = readEpoch.current;
    const reportView = activeMenu === "reports";
    const current = () =>
      !disposed &&
      !controller.signal.aborted &&
      readEpoch.current === epoch &&
      localStorage.getItem("token") === syncToken;

    const loadShifts = async () => {
      const params = buildShiftReadQueryParams(
        reportView,
        effectiveReadBranch,
        reportStartDate,
        reportEndDate,
      );
      const shiftsPromise = api.getShifts(params, controller.signal);
      const openShiftsPromise = reportView && profile?.branchId
        ? api.getShifts({ branchId: profile.branchId, status: "open" }, controller.signal)
        : shiftsPromise;
      try {
        const [rows, openRows] = await Promise.all([shiftsPromise, openShiftsPromise]);
        if (!current()) return;
        if (!Array.isArray(rows) || !Array.isArray(openRows)) {
          setDataLoadFailed(true);
          return;
        }
        const merged = new Map<string, any>();
        for (const shift of [...rows, ...openRows]) merged.set(shift.id, shift);
        setShifts([...merged.values()]);

        if (profile?.branchId) {
          const openShift = openRows.find(
            (shift: any) => shift.status === "open" && shift.branchId === profile.branchId,
          );
          if (openShift) {
            setShiftOpen(true);
            setCurrentShiftId(openShift.id);
            const type = openShift.shiftType || "Pagi";
            let parsedType = type;
            let parsedName = openShift.cashier?.name || "Kasir";
            if (type.includes(" - ")) {
              const parts = type.split(" - ");
              parsedType = parts[0];
              parsedName = parts[1];
            }
            setShiftType(parsedType as any);
            setCashierName(parsedName);
            setShiftStartTime(openShift.openTime);
            setShiftLogicalDate(openShift.shiftDate);
            localStorage.setItem("shift_open", "true");
            localStorage.setItem("current_shift_id", openShift.id);
            localStorage.setItem("shift_type", parsedType);
            localStorage.setItem("cashier_name", parsedName);
            localStorage.setItem("shift_start_time", openShift.openTime);
            localStorage.setItem("shift_logical_date", openShift.shiftDate);
          } else {
            setCurrentShiftId(null);
            localStorage.removeItem("current_shift_id");
            if (localStorage.getItem("shift_open") === "true") {
              setShiftOpen(false);
              setCashierName("");
              setShiftType(null);
              setShiftStartTime(null);
              localStorage.removeItem("shift_open");
            }
          }
        }
      } catch (error) {
        if (!current()) return;
        if (isSessionError(error)) expireReadSession();
        else {
          console.error("Shift data read failed:", error);
          setDataLoadFailed(true);
        }
      }
    };

    void loadShifts();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [
    fullSyncEnabled,
    profile?.branchId,
    shiftReadScope,
    refreshTick,
    syncToken,
  ]);

  useEffect(() => {
    if (!syncToken || profile?.role !== "ADMIN" || activeMenu !== "shopping_list") {
      setShoppingPlans([]);
      return;
    }

    const controller = new AbortController();
    const epoch = readEpoch.current;
    setShoppingPlans([]);
    const context = liveSyncKey.current;
    const current = () =>
      !controller.signal.aborted &&
      readEpoch.current === epoch &&
      liveSyncKey.current === context &&
      localStorage.getItem("token") === syncToken;

    api.getShoppingPlans(controller.signal).then((plans) => {
      if (!current()) return;
      if (!Array.isArray(plans)) {
        setDataLoadFailed(true);
        return;
      }
      setShoppingPlans(plans);
    }).catch((error) => {
      if (!current()) return;
      if (isSessionError(error)) expireReadSession();
      else {
        console.error("Shopping plans read failed:", error);
        setDataLoadFailed(true);
      }
    });

    return () => controller.abort();
  }, [activeMenu, profile?.branchId, profile?.role, syncToken]);

  useEffect(() => { fullRefreshRef.current(); }, [refreshTick]);

  const salesSyncKey = JSON.stringify([
    profile?.id,
    profile?.role,
    profile?.branchId,
    effectiveReadBranch,
    fullSyncEnabled,
    activeMenu,
    reportStartDate,
    reportEndDate,
    shiftOpen,
    shiftStartTime,
    shiftLogicalDate,
    currentPosShiftId,
  ]);
  const liveSalesSyncKey = useRef(salesSyncKey);
  liveSalesSyncKey.current = salesSyncKey;

  useEffect(() => {
    const needsActiveShiftSales =
      activeMenu === "shift" && profile?.role === "CASHIER" && shiftOpen;
    const needsSales = fullSyncEnabled && (
      activeMenu === "reports" || activeMenu === "pos" || needsActiveShiftSales
    );
    if (!needsSales || !syncToken) {
      setSales([]);
      setProductSalesQuantities({});
      setSalesReadFailed(false);
      setSalesReadLoading(false);
      salesRefreshRef.current = () => {};
      return;
    }

    let disposed = false;
    const controller = new AbortController();
    const epoch = readEpoch.current;
    if (needsActiveShiftSales) {
      setSales([]);
      setSalesReadFailed(false);
      setSalesReadLoading(true);
    }
    const current = () => !disposed && !controller.signal.aborted &&
      liveSalesSyncKey.current === salesSyncKey &&
      readEpoch.current === epoch &&
      localStorage.getItem("token") === syncToken;
    let hasSuccessfulRead = false;
    const loadSales = async () => {
      if (!current()) return;
      if (!hasSuccessfulRead) setSalesReadLoading(true);
      try {
        const branchParams: Record<string, string> = effectiveReadBranch && effectiveReadBranch !== "N/A"
          ? { branchId: effectiveReadBranch }
          : {};
        const queries = makeSalesReadQueries({
          view: activeMenu === "reports" ? "reports" : "pos",
          reportStartDate,
          reportEndDate,
          shiftOpen,
          shiftId: currentPosShiftId,
          shiftStartTime,
          shiftLogicalDate,
        }, branchParams);
        const saleLists = await Promise.all(queries.map((query) =>
          api.getSales(query, controller.signal)
        ));
        if (!current()) return;
        const uniqueSales = new Map<string, any>();
        saleLists.flat().forEach((sale: any) => uniqueSales.set(sale.id, sale));
        setSales([...uniqueSales.values()]);
        hasSuccessfulRead = true;
        setSalesReadLoading(false);

        if (activeMenu === "pos") {
          const counts = await api.getProductSalesQuantities(
            effectiveReadBranch && effectiveReadBranch !== "N/A" ? effectiveReadBranch : undefined,
            controller.signal,
          );
          if (!current()) return;
          if (!Array.isArray(counts)) throw new ReadError("invalid-response");
          setProductSalesQuantities(Object.fromEntries(
            counts.filter((row: any) => typeof row?.productId === "string")
              .map((row: any) => [row.productId, Number(row.qty) || 0]),
          ));
        } else {
          setProductSalesQuantities({});
        }
        setSalesReadFailed(false);
      } catch (error) {
        if (!current()) return;
        setSalesReadLoading(false);
        if (isSessionError(error)) {
          expireReadSession();
          controller.abort();
        } else if ((error as Error)?.name !== "AbortError") {
          setSalesReadFailed(true);
          console.error("Transaction read failed:", error);
        }
      }
    };

    const refresh = createReadRefresh(loadSales);
    salesRefreshRef.current = refresh.schedule;
    refresh.schedule();
    return () => {
      disposed = true;
      refresh.dispose();
      controller.abort();
      if (liveSalesSyncKey.current === salesSyncKey) salesRefreshRef.current = () => {};
    };
  }, [salesSyncKey, syncToken]);

  const syncCommissionsSummary = async (
    targetBranchId?: string,
    options?: { signal?: AbortSignal; isCurrent?: () => boolean },
  ) => {
    const epoch = readEpoch.current;
    const token = localStorage.getItem("token");
    const context = liveSyncKey.current;
    const current = () => readEpoch.current === epoch && localStorage.getItem("token") === token &&
      liveSyncKey.current === context && !options?.signal?.aborted && (options?.isCurrent?.() ?? true);
    try {
      const summary = await api.getCommissionSummary(targetBranchId, options?.signal);
      if (!current()) return false;
      if (!summary || typeof summary !== "object" || !("total" in summary)) throw new ReadError("invalid-response");
      
      // Map server response { total, byBranch } to what the app expects
      const formattedSummary = {
        ...summary,
        totalEarned: summary.total // Fix mismatch in property name
      };
      
      setCommissionsSummary(formattedSummary);

      // If we got byBranch data, update the overall branchSummaries state
      if (summary.byBranch) {
        const newBranchSummaries: Record<string, any> = {};
        Object.entries(summary.byBranch).forEach(([bid, amount]) => {
          newBranchSummaries[bid] = { totalEarned: amount };
        });
        setBranchSummaries(newBranchSummaries);
      }
      return true;
    } catch (err) {
      if (!current()) return false;
      if (isSessionError(err)) expireReadSession();
      else setDataLoadFailed(true);
      console.error("Sync Commissions Summary Error:", err);
      return false;
    }
  };

  useEffect(() => {
    if (!profile?.id || branches.length === 0) return;

    let savedBranchId = "";
    try {
      const saved = localStorage.getItem(
        `alfathpos:opname-branch:${profile.id}`,
      );
      if (saved && branches.some((branch) => branch.id === saved)) {
        savedBranchId = saved;
      }
    } catch {
      // Opname still opens safely without a saved branch when storage is unavailable.
    }
    setAuditBranchSelection({ userId: profile.id, branchId: savedBranchId });
  }, [branches, profile?.id]);

  useEffect(() => {
    if (
      !profile?.id ||
      !auditBranchSelection ||
      auditBranchSelection?.userId !== profile.id
    ) {
      return;
    }
    try {
      // An empty string is an intentional "no branch selected" preference.
      localStorage.setItem(
        `alfathpos:opname-branch:${profile.id}`,
        auditBranchSelection.branchId,
      );
    } catch {
      // Selection remains available for the current session.
    }
  }, [auditBranchSelection, profile?.id]);

  // Handle Global Barcode Scanner
  useBarcodeScanner((barcode) => {
    if (!profile) return;
    setScanIndicator(barcode);
    setTimeout(() => setScanIndicator(null), 2000);

    if (showProductForm) {
      setProdBarcode(barcode);
      return;
    }

    if (profile?.role === "CASHIER" && activeMenu === "pos" && shiftOpen) {
      // Priority 1: Check Master Barcode
      const productByBarcode = products.find((p) => p.barcode === barcode);
      if (productByBarcode) {
        addToCart(productByBarcode);
        return;
      }

      // Priority 2: Check SN Master field (for Vouchers)
      const productByMasterSN = products.find((p) => p.masterSN === barcode);
      if (productByMasterSN) {
        addToCart(productByMasterSN);
        return;
      }
    } else if (activeMenu === "audit") {
      if (!auditSelectedBranch) return;
      
      const product = products.find((p) => p.barcode === barcode || p.masterSN === barcode);
      if (product) {
        setQuickAuditProduct(product);
      } else {
        setSearchTerm(barcode);
      }
    } else {
      setSearchTerm(barcode); // Auto-filter table
    }
  });

  // --- ACTIONS ---

  // Admin: Update User Role/Branch
  const updateUser = async (uid: string, field: string, value: string) => {
    try {
      await api.updateUser(uid, { [field]: value });
      const [uData] = await Promise.all([api.getUsers()]);
      setUsers(uData);
    } catch(err) {
      console.error(err);
      alert("Gagal update karyawan");
    }
  };

  const deleteUser = async (uid: string, name: string) => {
    if (uid === user?.uid)
      return alert("Anda tidak bisa menghapus akun Anda sendiri!");
    if (
      !(await triggerConfirm(
        `Hapus akses karyawan "${name || "Tanpa Nama"}" secara permanen?`,
      ))
    )
      return;
    try {
      await api.deleteUser(uid);
      const uData = await api.getUsers();
      setUsers(uData);
      alert("Karyawan berhasil dihapus.");
    } catch (err) {
      console.error(err);
      alert("Gagal menghapus karyawan.");
    }
  };

  const handleCreateUser = async () => {
    if (!newUserDraft.username || !newUserDraft.password || !newUserDraft.name) {
      return alert("Mohon lengkapi data user.");
    }
    try {
      // Ensure empty branchId is null for consistency
      const payload = {
        ...newUserDraft,
        branchId: newUserDraft.branchId === "" ? null : newUserDraft.branchId
      };
      await api.register(payload);
      const uData = await api.getUsers();
      setUsers(uData);
      setShowUserForm(false);
      setNewUserDraft({ username: "", password: "", name: "", role: "CASHIER", branchId: "" });
      alert("Akun berhasil ditambahkan!");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Gagal menambah akun.");
    }
  };

  // Admin: Add Branch
  const handleAddBranch = async () => {
    if (!newBranch.trim()) return;
    try {
      await fetch('/api/branches', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
              name: newBranch,
              address: 'Baru',
              phone: ''
          })
      });
      setNewBranch("");
      const bData = await api.getBranches();
      setBranches(bData.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "", undefined, { numeric: true, sensitivity: 'base' })));
    } catch(err) {
      console.error(err);
    }
  };

  // Admin: Save New or Edit Product Master
  const generateAutoBarcode = () => {
    const prefix =
      prodCategory === "Aksesoris"
        ? "ACC"
        : prodCategory === "Voucher"
          ? ""
          : "PRD";
    const random = Math.floor(Math.random() * 1000000)
      .toString()
      .padStart(6, "0");
    const timestamp = Date.now().toString().slice(-4);
    return `${prefix}${timestamp}${random}`;
  };


  // Reset all product-form fields to a clean default (for a fresh "Tambah" form / on close).
  const resetProductForm = () => {
    setEditingProduct(null);
    setProdCategory("Aksesoris");
    setProdSubCategory("Kabel Data");
    setProdBrand("Robot");
    setProdProvider(""); // Aksesoris does not use provider — leave empty to avoid DB pollution
    setProdType("");
    setProdDesc("");
    setProdCapital("");
    setProdSell("");
    setProdDiscount("");
    setProdBarcode("");
    setProdMasterSN("");
    setProdExpiredAt("");
    setProdMinStock("0");
    setProdCommission("0");
    setProdSize("");
    setProdVisibleBranchIds("*");
  };

  // Build a clean, consistent product name per category.
  // Empty slots are skipped so there are no double spaces or dangling " - ".
  const buildProductName = () => {
    const clean = (s?: string) => (s || "").replace(/\s+/g, " ").trim();
    const join = (parts: (string | undefined)[]) =>
      parts.map(clean).filter(Boolean).join(" - ");
    const head = (parts: (string | undefined)[]) =>
      parts.map(clean).filter(Boolean).join(" ");

    switch (prodCategory) {
      case "Aksesoris":
        // Merek - Tipe/Model - Varian
        return join([prodBrand, prodSubCategory, prodType]);
      case "Voucher": {
        // Guard: strip provider prefix if admin accidentally typed it in the nominal field
        // e.g. typed "Telkomsel 5GB" when provider is already "Telkomsel" → store as "5GB"
        const vType = prodProvider
          ? prodType.replace(new RegExp(`^${prodProvider}\\s*[-–]?\\s*`, "i"), "").trim()
          : prodType;
        return join([head(["Voucher", prodProvider]), vType]);
      }
      case "Kartu Perdana Kuota": {
        const kqType = prodProvider
          ? prodType.replace(new RegExp(`^${prodProvider}\\s*[-–]?\\s*`, "i"), "").trim()
          : prodType;
        return join([head(["Perdana Kuota", prodProvider]), kqType]);
      }
      case "Kartu Perdana Biasa": {
        const kbType = prodProvider
          ? prodType.replace(new RegExp(`^${prodProvider}\\s*[-–]?\\s*`, "i"), "").trim()
          : prodType;
        return join([head(["Perdana", prodProvider]), kbType]);
      }
      case "Handphone":
        // Merek Model - Varian (RAM/Storage/Warna)
        return join([head([prodBrand, prodSubCategory]), prodType]);
      case "Parfum":
        // Parfum Merek - Jenis - Aroma - Ukuran
        return join([head(["Parfum", prodBrand]), prodSubCategory, prodType, prodSize]);
      default: {
        // Kategori bebas / Lain-lain: [Kategori] - Merek - Nama
        const cat = prodCategory === "Lain-lain" ? "" : prodCategory;
        return join([cat, prodBrand, prodType]) || clean(prodType);
      }
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();

    // Auto-generate barcode if empty
    let finalBarcode = prodBarcode;
    if (!finalBarcode.trim()) {
      finalBarcode = generateAutoBarcode();
    }

    if (!prodType || !prodCapital || !prodSell) {
      alert("Mohon lengkapi field wajib: Tipe/Nama, Modal & Harga Jual!");
      return;
    }

    const generatedName = buildProductName();
    if (!generatedName.trim()) {
      alert("Nama produk tidak boleh kosong. Lengkapi minimal Varian/Nama produk.");
      return;
    }

    try {
      // Duplicate detection
      const duplicateName = products.find(p => p.name.toLowerCase() === generatedName.toLowerCase() && (!editingProduct || p.id !== editingProduct.id));
      const duplicateBarcode = products.find(p => p.barcode === finalBarcode && (!editingProduct || p.id !== editingProduct.id));
      
      if (duplicateName) {
        if (!(await triggerConfirm(`Produk dengan nama "${generatedName}" sudah ada. Tetap lanjutkan?`))) return;
      }
      
      if (duplicateBarcode) {
        alert(`Gagal: Barcode/SN "${finalBarcode}" sudah digunakan oleh produk lain!`);
        return;
      }

      // Only Voucher / Perdana categories use the provider field.
      // For Aksesoris, Handphone, Parfum, etc., always save empty string
      // to prevent stale provider values (e.g. "Telkomsel") polluting search results.
      const isProviderCategory = prodCategory === "Voucher" || prodCategory?.includes("Perdana");
      const data = {
        name: generatedName,
        category: prodCategory,
        brand: isProviderCategory ? prodProvider : prodBrand,
        provider: isProviderCategory ? prodProvider : "",
        subCategory: prodSubCategory,
        barcode: finalBarcode,
        masterSN: prodMasterSN,
        visibleBranchIds: prodVisibleBranchIds,
        status: "ACTIVE",
        description: prodDesc,
        purchasePrice: Number(prodCapital),
        sellingPrice: Number(prodSell),
        discountPrice: Number(prodDiscount) || 0,
        expiredAt: prodExpiredAt || null,
        minStock: Number(prodMinStock) || 0,
        commissionAmount: Number(prodCommission) || 0,
        unit: "Pcs",
      };

      if (editingProduct) {
        // For simplicity, using same create endpoint or I could add PUT
        await api.createProduct({ ...data, id: editingProduct.id }); 
        alert("Master produk berhasil diperbarui!");
      } else {
        await api.createProduct(data);
        alert("Master produk berhasil disimpan!");
      }

      // Refresh products
      const pData = await api.getProducts();
      setProducts(pData);

      setShowProductForm(false);
      setEditingProduct(null);
      setProdType("");
      setProdDesc("");
      setProdCapital("");
      setProdSell("");
      setProdDiscount("");
      setProdBarcode("");
      setProdExpiredAt("");
      setProdMinStock("0");
      setProdCommission("0");
      setProdSize("");
    } catch (err) {
      console.error(err);
      alert("Gagal menyimpan produk.");
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (
      !(await triggerConfirm(
        `Arsipkan produk "${name}"? Produk akan hilang dari daftar jualan, tetapi seluruh riwayat penjualan, bonus, dan penghasilan tetap tersimpan.`,
      ))
    )
      return;
    try {
      await api.deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      alert("Produk berhasil diarsipkan. Riwayat & bonus tetap tersimpan.");
    } catch (err) {
      console.error(err);
      alert("Gagal mengarsipkan produk.");
    }
  };

  const startEditing = (p: any) => {
    setEditingProduct(p);
    setProdCategory(p.category || "Aksesoris");
    setProdSubCategory(p.subCategory || "");
    setProdBrand(p.brand || "");
    setProdProvider(p.provider || "");
    // Recover Varian (and Parfum size) from the generated name
    {
      const segs = (p.name || "").split(" - ").map((s: string) => s.trim()).filter(Boolean);
      let baseType = segs[segs.length - 1] || "";
      let size = "";
      if ((p.category || "") === "Parfum" && /\d\s*ml\b/i.test(baseType)) {
        size = baseType;
        baseType = segs[segs.length - 2] || "";
      }
      setProdType(baseType);
      setProdSize(size);
    }
    setProdDesc(p.description || "");
    setProdCapital(p.purchasePrice?.toString() || "");
    setProdSell(p.sellingPrice?.toString() || "");
    setProdDiscount(p.discountPrice?.toString() || "");
    setProdBarcode(p.barcode || "");
    setProdMasterSN(p.masterSN || "");
    setProdExpiredAt(p.expiredAt || "");
    setProdMinStock(p.minStock?.toString() || "0");
    setProdCommission(p.commissionAmount?.toString() || "0");
    setProdVisibleBranchIds(p.visibleBranchIds || "*");
    setShowProductForm(true);
  };

  // Audit: Update Physical Stock for selected branch
  const handleAuditStock = async (branchId: string, productId: string, oldQty: number, qty: number) => {
    if (!branchId || branchId !== activeAuditBranch.current) return;
    if (qty === oldQty) return;

    try {
      await api.adjustStock({
        branchId,
        productId,
        newQty: qty,
        oldQty: oldQty,
        reason: "Opname Stok (Tabel Audit)",
        type: qty > oldQty ? "STOCK_IN" : "STOCK_OUT",
        cashierId: profile?.id
      });
      // Refresh local products
      const pData = await api.getProducts();
      setProducts(pData);
    } catch (e: any) {
      console.error(e);
      // A rejected snapshot is never silently retried with a newer baseline.
      try { setProducts(await api.getProducts()); } catch {}
      alert(e?.message?.includes("409")
        ? "Stok sudah berubah. Data dimuat ulang; periksa jumlah fisik lalu simpan kembali."
        : "Gagal update stok.");
    }
  };


  // Cashier: Cart Logic
  const getBranchStock = (branchId: string, productId: string) => {
    const s = stocks.find(
      (s) => s.branchId === branchId && s.productId === productId,
    );
    return s ? s.qty : 0;
  };

  const addToCart = (product: any) => {
    if (!shiftOpen) {
      alert("Shift belum dibuka! Harap Buka Shift terlebih dahulu sebelum melayani transaksi.");
      setActiveMenu("shift");
      return;
    }

    const availableStock = getBranchStock(profile?.branchId || "", product.id);
    setCart((prev) => {
      const exists = prev.find(
        (item) => item.product.id === product.id,
      );
      const currentQty = prev
        .filter((i) => i.product.id === product.id)
        .reduce((s, x) => s + x.qty, 0);

      if (currentQty + 1 > availableStock) {
        alert("Stok Cabang Tidak Mencukupi!");
        return prev;
      }

      if (exists)
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, qty: item.qty + 1 }
            : item,
        );
      return [...prev, { product, qty: 1 }];
    });
  };

  const updateCartQty = (id: string, delta: number) => {
    const availableStock = getBranchStock(profile?.branchId || "", id);
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id === id) {
          const newQty = item.qty + delta;
          if (newQty > availableStock) {
            alert("Melebihi Stok!");
            return item;
          }
          return newQty > 0 ? { ...item, qty: newQty } : item;
        }
        return item;
      }),
    );
  };

  const removeFromCart = (productId: string, sn?: string) => {
    setCart((prev) =>
      prev.filter((item) => !(item.product.id === productId && item.sn === sn)),
    );
  };

  const handleRefund = async (sale: any) => {
    if (profile?.role === "CASHIER" && !shiftOpen) {
      alert("Shift kasir tidak aktif. Refund hanya tersedia selama shift masih terbuka.");
      return;
    }
    if (!sale) {
       alert("Error: Data penjualan tidak ditemukan. Hubungi pengembang.");
       return;
    }
    
    if (sale.status === "refunded") return alert("Transaksi ini sudah di-refund.");
    const confirmRefund = await triggerConfirm("Refund seluruh transaksi ini? Stok akan dikembalikan ke cabang.");
    if (!confirmRefund) return;

    setIsProcessingRefund(true);
    try {
      await api.refundSale(sale.id);
      
      // Update local state
      setSales(prev => prev.map(s => s.id === sale.id ? { ...s, status: "refunded" } : s));
      
      // Refresh products to show updated stocks
      const pData = await api.getProducts();
      setProducts(pData);
      
      alert("Transaksi berhasil di-refund!");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Gagal melakukan refund.");
    } finally {
      setIsProcessingRefund(false);
    }
  };

  const handleStockAdjustment = async (
    productId: string,
    qty: number,
    reason?: string,
    targetBranchId?: string,
  ) => {
    const branchId = targetBranchId || profile?.branchId;
    if (!branchId || qty <= 0) return;
    try {
      const p = products.find(p => p.id === productId);
      const currentStock = (p?.stocks || {})[branchId] || 0;
      
      if (currentStock < qty) {
        throw new Error(
          `Stok saat ini (${currentStock}) tidak mencukupi untuk pemusnahan/pengurangan sebesar ${qty}!`,
        );
      }

      await api.adjustStock({
        productId,
        branchId,
        qty: -qty,
        type: "STOCK_OUT",
        reason: reason || "Koreksi Stok / Pemusnahan",
        cashierId: profile?.id
      });
      const pData = await api.getProducts();
      setProducts(pData);
      alert("Pemusnahan Stok Berhasil Dicatat.");
    } catch (err: any) {
      alert(err.message || "Gagal Update Stok");
    }
  };

  const handleStockAddition = async (
    productId: string,
    qty: number,
    supplier?: string,
    targetBranchId?: string,
  ) => {
    if (profile?.role === "CASHIER" && !shiftOpen) {
      alert("Shift kasir tidak aktif. Input stok hanya tersedia selama shift masih terbuka.");
      return;
    }
    const branchId = targetBranchId || profile?.branchId;
    if (!branchId || qty <= 0 || isProcessingStock) return;
    setIsProcessingStock(true);
    try {
      await api.adjustStock({
        productId,
        branchId,
        qty: qty,
        type: "STOCK_IN",
        reason: supplier
          ? `Input Cabang via: ${supplier}`
          : "Penambahan Stok Cabang",
        cashierId: profile?.id
      });
      const pData = await api.getProducts();
      setProducts(pData);
      alert("Stok Berhasil Ditambahkan.");
    } catch (err: any) {
      alert(err.message || "Gagal Update Stok");
    } finally {
      setIsProcessingStock(false);
    }
  };

  const handleStockTransfer = async (
    productId: string,
    qty: number,
    targetBranchId: string,
    sourceBranchIdParam?: string,
  ) => {
    if (profile?.role === "CASHIER" && !shiftOpen) {
      return alert("Shift kasir tidak aktif. Transfer stok hanya tersedia selama shift masih terbuka.");
    }
    const sourceBranchId = sourceBranchIdParam || profile?.branchId;
    if (
      !sourceBranchId ||
      !targetBranchId ||
      sourceBranchId === targetBranchId ||
      qty <= 0 ||
      isProcessingTransfer
    ) {
      return alert("Data transfer tidak valid!");
    }

      setIsProcessingTransfer(true);
      try {
        await api.transferStock({
          productId,
          qty,
          sourceBranchId,
          targetBranchId,
        });
        const pData = await api.getProducts();
        setProducts(pData);
        setTimeout(() => {
          alert("Stok Berhasil Ditransfer! (Otomatis Sync saat Online)");
        }, 100);
      } catch (e: any) {
        setTimeout(() => {
          alert(e.message || "Gagal transfer stock");
        }, 100);
      } finally {
        setIsProcessingTransfer(false);
      }
    };

  const cartTotal = React.useMemo(() => {
    return cart.reduce((sum, item) => {
      if (!item?.product) return sum;
      const price =
        item.product.discountPrice > 0
          ? item.product.discountPrice
          : item.product.sellingPrice || 0;
      return sum + price * (item.qty || 0);
    }, 0);
  }, [cart]);

  const sortedProductsBySales = React.useMemo(() => {
    const itemStats: { [id: string]: { qty: number; product: any } } = {};
    const branchId = profile?.branchId;

    // Filter products visible in this branch
    const branchProducts = products.filter(p => {
      const visibleIds = p.visibleBranchIds || "*";
      const isVisible = visibleIds === "*" || (branchId && visibleIds.split(",").map((id: string) => id.trim()).includes(branchId));
      return isVisible;
    });

    if (branchId) Object.entries(productSalesQuantities).forEach(([pId, qty]) => {
      const product = branchProducts.find((p) => p.id === pId);
      if (product && qty > 0) itemStats[pId] = { qty, product };
    });

    const sorted = Object.values(itemStats)
      .sort((a, b) => b.qty - a.qty)
      .map((entry) => ({
        ...entry.product,
        salesCount: entry.qty
      }));

    const existingIds = new Set(sorted.map((p) => p.id));
    const unsorted = branchProducts.filter(p => !existingIds.has(p.id))
      .map(p => ({ ...p, salesCount: 0 }))
      .sort((a, b) => {
        const getPrice = (px: any) => px.discountPrice > 0 ? px.discountPrice : px.sellingPrice;
        return getPrice(a) - getPrice(b);
      });

    return [...sorted, ...unsorted];
  }, [productSalesQuantities, products, profile?.branchId]);

  const fastAccessProducts = React.useMemo(() => {
    return sortedProductsBySales.slice(0, 24);
  }, [sortedProductsBySales]);

  const posFilteredProducts = React.useMemo(() => {
    const branchId = profile?.branchId;
    if (!branchId) return [];
    
    // 1. Filter products visible in this branch
    let list = products.filter(p => {
      const visibleIds = p.visibleBranchIds || "*";
      return visibleIds === "*" || visibleIds.split(",").map((id: string) => id.trim()).includes(branchId);
    });

    // 2. Filter by category (skip while searching so a keyword spans all categories)
    if (!searchTerm && posSelectedCategory && posSelectedCategory !== "Semua") {
      list = list.filter(p => p.category === posSelectedCategory);
    }

    // 3. Filter by search input (if any)
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const searchWords = searchLower.split(/\s+/).filter(Boolean);
      list = list.filter(p => {
        const name = (p.name || "").toLowerCase();
        const barcode = (p.barcode || "").toLowerCase();
        const brand = (p.brand || "").toLowerCase();
        const category = (p.category || "").toLowerCase();
        const masterSN = (p.masterSN || "").toLowerCase();
        // Only match provider for categories that actually use it,
        // preventing aksesoris products with stale provider data from appearing.
        const isProviderCat = p.category === "Voucher" || (p.category || "").includes("Perdana");
        const provider = isProviderCat ? (p.provider || "").toLowerCase() : "";
        
        return searchWords.every(word => 
          name.includes(word) || 
          barcode.includes(word) || 
          brand.includes(word) || 
          category.includes(word) || 
          provider.includes(word) ||
          masterSN.includes(word)
        );
      });
    }

    // 4. Sort cheapest -> most expensive (using discount price when set)
    return [...list].sort((a, b) => {
      const getPrice = (p: any) => (p.discountPrice > 0 ? p.discountPrice : p.sellingPrice);
      return getPrice(a) - getPrice(b);
    });
  }, [products, posSelectedCategory, searchTerm, profile?.branchId]);

  useEffect(() => {
    if (activeMenu !== "pos" || !searchTerm || !profile?.branchId) return;

    // 1. Check if it matches a regular Product Barcode exactly
    const foundProduct = products.find((p) => p.barcode === searchTerm);
    if (foundProduct) {
      addToCart(foundProduct);
      setSearchTerm("");
      setSearchSuggestions([]);
      setScanIndicator(`Produk: ${foundProduct.name}`);
      setTimeout(() => setScanIndicator(null), 2000);
      return;
    }

    // 2. Check if it matches a Master SN exactly (for Vouchers)
    const foundByMasterSN = products.find((p) => p.masterSN === searchTerm);
    if (foundByMasterSN) {
      addToCart(foundByMasterSN);
      setSearchTerm("");
      setSearchSuggestions([]);
      setScanIndicator(`Voucher Master: ${foundByMasterSN.name}`);
      setTimeout(() => setScanIndicator(null), 2000);
      return;
    }
  }, [searchTerm, products, activeMenu, profile?.branchId]);

  const handleCheckout = async () => {
    const p = profile;

    if (!shiftOpen) {
      alert("Shift belum dibuka! Harap Buka Shift terlebih dahulu.");
      return;
    }

    if (shiftOpen && shiftType) {
      let cleanedShiftType = shiftType;
      // Handle the case where shiftType is combined with name (e.g., "Pagi - Budi")
      if (typeof shiftType === 'string' && shiftType.includes(" - ")) {
          cleanedShiftType = shiftType.split(" - ")[0] as any;
      }

      if (isShiftOverdue(cleanedShiftType, shiftStartTime)) {
          if (!(await triggerConfirm(`Waktu shift ${cleanedShiftType} telah berakhir. Transaksi akan tetap masuk ke shift aktif saat ini, namun disarankan untuk segera tutup shift. Lanjut Transaksi?`))) {
              return;
          }
      }
    }

    if (cart.length === 0 || !p?.branchId || isProcessingCheckout) return;

    setIsProcessingCheckout(true);

    const currentCart = [...cart];
    const currentTotal = cartTotal;

    try {
      let totalCommission = 0;
      const items = currentCart.map((i) => {
        const commPerItem = i.product.commissionAmount || 0;
        const itemComm = commPerItem * i.qty;
        totalCommission += itemComm;
        
        return {
          productId: i.product.id,
          qty: i.qty,
          price: i.product.discountPrice > 0 ? i.product.discountPrice : i.product.sellingPrice,
          subtotal: (i.product.discountPrice > 0 ? i.product.discountPrice : i.product.sellingPrice) * i.qty,
          commission: itemComm
        };
      });

      const sale = await api.createSale({
        branchId: p.branchId,
        cashierId: p.id,
        items,
        total: currentTotal,
        totalCommission,
        customerName: "" // Optional
      });

      // The cashier's own POS view must not wait for Socket.IO or a page reload.
      // Use the server-confirmed sale and upsert by ID so an idempotent retry
      // cannot add the same revenue twice.
      if (sale?.id) {
        setSales((currentSales) => {
          const byId = new Map(currentSales.map((existingSale: any) => [existingSale.id, existingSale]));
          byId.set(sale.id, sale);
          return [...byId.values()].sort((left: any, right: any) =>
            new Date(right.createdAt || right.timestamp || 0).getTime() -
            new Date(left.createdAt || left.timestamp || 0).getTime()
          );
        });
        salesRefreshRef.current();
      }

      // Clear Cart
      setCart([]);
      setShowMobileCart(false);

      // Refresh Products/Stocks (Optional, for UI update)
      const pData = await api.getProducts();
      setProducts(pData);

      // Tampilkan overlay sukses pembayaran
      setPaymentSuccessOverlay({
        total: currentTotal,
        saleId: sale?.id || "",
        itemCount: currentCart.reduce((s, i) => s + i.qty, 0),
      });
      setTimeout(() => setPaymentSuccessOverlay(null), 2500);
    } catch (e: any) {
      console.error("Checkout Error:", e);
      alert(e.message || "Gagal memproses transaksi.");
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  // ===== TAHAN / SIMPAN TRANSAKSI SEMENTARA (HOLD) =====
  // Held transactions are persisted per-branch in localStorage. Stock is NOT
  // decremented while a transaction is held (only at real checkout), so stock is
  // re-validated when a held transaction is resumed.
  const heldStorageKey = (branchId?: string) => `alfath_held_tx_${branchId || "none"}`;

  useEffect(() => {
    const bId = profile?.branchId;
    if (!bId) {
      setHeldTransactions([]);
      return;
    }
    try {
      const raw = localStorage.getItem(heldStorageKey(bId));
      const parsed = raw ? JSON.parse(raw) : [];
      setHeldTransactions(Array.isArray(parsed) ? parsed : []);
    } catch {
      setHeldTransactions([]);
    }
  }, [profile?.branchId]);

  const persistHeld = (updater: (prev: typeof heldTransactions) => typeof heldTransactions) => {
    const bId = profile?.branchId;
    setHeldTransactions((prev) => {
      const next = updater(prev);
      if (bId) {
        try {
          localStorage.setItem(heldStorageKey(bId), JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  };

  const holdCurrentCart = async () => {
    if (cart.length === 0) return;
    const defaultLabel = `Pelanggan #${heldTransactions.length + 1}`;
    const label = await triggerPrompt(
      "Beri nama / catatan untuk transaksi yang ditahan (mis. nama pelanggan):",
      defaultLabel,
    );
    if (label === null) return; // dibatalkan
    const entry = {
      id: Date.now().toString(),
      label: (label || "").trim() || defaultLabel,
      items: cart,
      total: cartTotal,
      itemsCount: cart.reduce((s, i) => s + i.qty, 0),
      createdAt: new Date().toISOString(),
    };
    persistHeld((prev) => [entry, ...prev]);
    setCart([]);
    setShowMobileCart(false);
    alert(`Transaksi "${entry.label}" berhasil ditahan.`);
  };

  const resumeHeldTransaction = async (id: string) => {
    const entry = heldTransactions.find((h) => h.id === id);
    if (!entry) return;
    if (cart.length > 0) {
      const ok = await triggerConfirm(
        "Keranjang aktif saat ini akan diganti dengan transaksi yang ditahan. Lanjutkan?",
      );
      if (!ok) return;
    }
    // Validasi ulang stok (stok bisa berubah selama ditahan)
    const adjusted: typeof cart = [];
    const warnings: string[] = [];
    entry.items.forEach((it) => {
      const avail = getBranchStock(profile?.branchId || "", it.product.id);
      if (avail <= 0) {
        warnings.push(`${getProductName(it.product)} (stok habis, dihapus)`);
        return;
      }
      if (avail < it.qty) {
        warnings.push(`${getProductName(it.product)} (stok tinggal ${avail})`);
        adjusted.push({ ...it, qty: avail });
      } else {
        adjusted.push(it);
      }
    });
    setCart(adjusted);
    persistHeld((prev) => prev.filter((h) => h.id !== id));
    setShowHeldList(false);
    if (warnings.length > 0) {
      alert(`Perhatian, stok berubah selama ditahan:\n- ${warnings.join("\n- ")}`);
    }
  };

  const deleteHeldTransaction = async (id: string) => {
    const ok = await triggerConfirm("Hapus transaksi yang ditahan ini? Tindakan ini tidak bisa dibatalkan.");
    if (!ok) return;
    persistHeld((prev) => prev.filter((h) => h.id !== id));
  };

  const getLogicalShiftDate = (d = new Date()) => {
    const date = new Date(d);
    // If before 6 AM, count as previous day (logical date)
    if (date.getHours() < 6) {
      date.setDate(date.getDate() - 1);
    }
    // Return YYYY-MM-DD in LOCAL time
    return formatDateLocal(date);
  };

  const handleOpenShift = async () => {
    if (!profile?.branchId) return alert("Cabang belum di set Admin!");
    if (!cashierName.trim()) return alert("Masukkan Nama Penjaga!");
    if (!shiftType) return alert("Pilih Tipe Shift (Pagi/Malam)!");

    const startTime = new Date().toISOString();
    const activeLogicalDate = getLogicalShiftDate();

    try {
      // The server is authoritative. If this exact shift is still open after an
      // app/API interruption, openShift returns that persisted shift for recovery.
      const shift = await api.openShift({
        branchId: profile.branchId,
        cashierId: profile.id, // profile.id not uid
        shiftDate: activeLogicalDate,
        shiftType: `${shiftType} - ${cashierName.trim() || profile?.name || "Kasir"}`
      });
      setCurrentShiftId(shift.id);
      localStorage.setItem("current_shift_id", shift.id);
      setShiftStartTime(shift.openTime);
      localStorage.setItem("shift_start_time", shift.openTime);
    } catch (e) {
      console.error("Shift Open Error:", e);
      alert("Gagal membuka shift. Periksa koneksi ke server lalu coba lagi.");
      return;
    }

    // Berhasil tercatat di server — baru aktifkan shift di layar
    // The server's persisted timestamp is authoritative, including opening retries.
    const persistedStart = localStorage.getItem("shift_start_time") || startTime;
    setShiftStartTime(persistedStart);
    setShiftLogicalDate(activeLogicalDate);
    setShiftOpen(true);
  };

  const handleWithdrawCommission = async (branchId: string) => {
    if (!(await triggerConfirm("Cairkan seluruh bonus yang tersedia untuk cabang ini?"))) return;
    setIsProcessingWithdraw(true);
    try {
      await api.withdrawCommission(branchId);
      // Refresh commissions
      const cData = await api.getCommissions({ branchId });
      setCommissions(cData);
      alert("Bonus berhasil dicairkan!");
    } catch (err: any) {
      console.error(err);
      alert("Gagal mencairkan bonus.");
    } finally {
      setIsProcessingWithdraw(false);
    }
  };

  const handleCloseShift = async () => {
    if (!profile?.branchId) {
       alert("Error: Profile atau Branch ID tidak ditemukan. Silakan login kembali/refresh.");
       return;
    }
    if (
      !(await triggerConfirm(
        "Yakin ingin menutup shift? Pastikan semua transaksi sudah selesai.",
      ))
    )
      return;

    const shiftId = localStorage.getItem("current_shift_id");
    if (!shiftId) {
      alert("Identitas shift belum terkonfirmasi. Muat ulang untuk memulihkan shift dari server.");
      return;
    }
    try {
      const summary = await api.getShiftCloseSummary(shiftId);
      setShowShiftSummary(Number(summary.totalSales) || 0);
    } catch (error) {
      console.error("Shift close summary error:", error);
      alert("Gagal menghitung total pendapatan dari server. Shift belum ditutup.");
    }
  };

  const finalizeCloseShift = async (reportedIncomeValue?: string) => {
    if (isClosingShift) return;
    setIsClosingShift(true);

    const sId = localStorage.getItem("current_shift_id");
    const closingTime = new Date().toISOString();

    try {
      if (reportedIncomeValue === undefined || reportedIncomeValue.trim() === "" || !sId) {
        throw new Error("Identitas shift belum terkonfirmasi. Muat ulang untuk memulihkan shift dari server; penutupan belum dilakukan.");
      }
      const reportedIncome = Number(reportedIncomeValue);
      const closedShift = await api.updateShift(sId, {
        reportedIncome,
        status: "closed"
      });
      window.dispatchEvent(new CustomEvent("app-custom-alert", {
        detail: {
          type: "success",
          message: `Shift ditutup. Total sistem Rp ${Number(closedShift.totalSales || 0).toLocaleString("id-ID")}; pendapatan dilaporkan Rp ${Number(closedShift.reportedIncome || 0).toLocaleString("id-ID")}; selisih Rp ${Number(closedShift.difference || 0).toLocaleString("id-ID")}.`,
        },
      }));

      // 2. Reset shift state
      setShiftOpen(false);
      setCurrentShiftId(null);
      setCashierName("");
      setShiftType(null);
      setShiftStartTime(null);
      setShiftLogicalDate("");
      setShowShiftSummary(null);
      setReportedIncomeInput("");
      localStorage.removeItem("current_shift_id");
      localStorage.removeItem("shift_open");
      localStorage.removeItem("cashier_name");
      localStorage.removeItem("shift_type");
      localStorage.removeItem("shift_start_time");
      localStorage.removeItem("shift_logical_date");

      alert("Shift berhasil ditutup & dipatenkan.");
    } catch (e) {
      console.error("Shift Closing Error:", e);
      alert(e instanceof Error ? e.message : "Gagal menutup shift. Muat ulang untuk memeriksa status sebelum mencoba lagi.");
    } finally {
      setIsClosingShift(false);
    }
  };

  const currentShiftSales = useMemo(() => {
    if (!shiftOpen) return [];
    return sales.filter(
      (s) =>
        s.branchId === profile?.branchId &&
        s.status !== "refunded"
    );
  }, [sales, shiftOpen, profile?.branchId]);

  const currentShiftTotalSales = useMemo(() => {
    return currentShiftSales
      .filter((sale) => isRevenueEligibleSaleStatus(sale.status))
      .reduce((sum, sale) => sum + (sale.total || 0), 0);
  }, [currentShiftSales]);

  const [dashboardDateRange, setDashboardDateRange] = useState<"today" | "week" | "month" | "all">("today");
  const dashboardSummaries = ownerDashboard.summaries;
  const dashboardRecentSales = ownerDashboard.recentSales;

  const dashboardStats = useMemo(() => {
    const now = new Date();
    const todayStr = getLogicalShiftDate(now).replace(/\//g, "-");

    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay() || 7;
    if (day !== 1) startOfWeek.setDate(startOfWeek.getDate() - (day - 1));
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfWeekStr = formatDateLocal(startOfWeek).replace(/\//g, "-");

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonthStr = formatDateLocal(startOfMonth).replace(/\//g, "-");

    // Filter summaries directly
    const filteredSummaries = dashboardSummaries.filter((s) => {
      // Filter by branch if owner selected one
      const branchMatch = !adminSalesBranchFilter || s.branchId === adminSalesBranchFilter;
      if (!branchMatch) return false;

      // Extract physical or logical shift date
      const summaryDateStr = (s.date || "").replace(/\//g, "-");

      if (dashboardDateRange === "today") return summaryDateStr === todayStr;
      if (dashboardDateRange === "week") return summaryDateStr >= startOfWeekStr;
      if (dashboardDateRange === "month") return summaryDateStr >= startOfMonthStr;
      return true; // "all"
    });

    // Per-Branch breakdown
    const branchBreakdown: Record<string, number> = {};

    const stats = filteredSummaries.reduce(
      (acc, s) => {
        // Aggregate revenue
        acc.revenue += s.revenue || 0;
        acc.profit += s.profit || 0;
        acc.count += s.count || 0;

        // Group by branch
        branchBreakdown[s.branchId] = (branchBreakdown[s.branchId] || 0) + (s.revenue || 0);

        return acc;
      },
      { revenue: 0, profit: 0, count: 0 }
    );

    return { ...stats, branchBreakdown };
  }, [dashboardSummaries, adminSalesBranchFilter, dashboardDateRange]);

  // Close the slide-out sidebar with the Escape key (native drawer feel)
  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSidebarOpen]);

  // --- VIEW RENDERING HELPERS ---
  const getPageTitle = () => {
    switch (activeMenu) {
      case "pos":
        return "Sistem Kasir Aksesoris & Voucher";
      case "shift":
        return "Manajemen Shift";
      case "dashboard":
        return "Dashboard Pusat";
      case "settings":
        return "Pengaturan Cabang";
      case "reports":
        return "Laporan Shift & Pendapatan";
      case "inventory":
        return "Master Produk Global";
      case "employees":
        return "Manajemen Akses Karyawan";
      case "audit":
        return "Audit Stok By Cabang";
      case "stock_audit":
        return "Audit Stok Cabang";
      case "branch_stocks":
        return "Laporan Stok per Cabang";
      case "shopping_list":
        return "Daftar Belanja (Low Stock)";
      case "incentive":
        return "Bonus & Insentif Karyawan";
      default:
        return String(activeMenu || "ALFATH PULSA").toUpperCase();
    }
  };

  const getMobileNav = () => {
    const items = [];
    if (profile?.role === "ADMIN") {
      items.push({ id: "dashboard", icon: MdSpaceDashboard, label: "Dash" });
      items.push({ id: "reports", icon: MdInsights, label: "Laporan" });
      items.push({ id: "inventory", icon: MdInventory2, label: "Barang" });
      items.push({ id: "branch_stocks", icon: MdWarehouse, label: "Stok" });
      items.push({ id: "incentive", icon: MdAutoAwesome, label: "Bonus" });
      items.push({ id: "audit", icon: MdFactCheck, label: "Opname" });
      items.push({ id: "stock_audit", icon: MdFactCheck, label: "Audit" });
      items.push({ id: "employees", icon: MdGroups, label: "Karyawan" });
      items.push({ id: "settings", icon: MdStorefront, label: "Cabang" });
    } else if (profile?.role === "CASHIER") {
      items.push({ id: "pos", icon: MdPointOfSale, label: "POS" });
      items.push({ id: "shift", icon: MdSchedule, label: "Shift" });
      items.push({ id: "incentive", icon: MdAutoAwesome, label: "Bonus" });
      items.push({
        id: "cashier_stock",
        icon: MdAddBox,
        label: "Stok",
        locked: !appConfig.allowCashierStockInput || !shiftOpen,
      });
    } else if (profile?.role === "AUDIT") {
      items.push({ id: "audit", icon: MdFactCheck, label: "Opname" });
      items.push({ id: "stock_audit", icon: MdFactCheck, label: "Audit" });
      items.push({ id: "reports", icon: MdInsights, label: "Laporan" });
    }
    return items;
  };

  // --- CONDITIONAL LOADING & GUARD SCREENS ---
  if (authLoading)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-10 animate-in fade-in duration-700">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin shadow-lg" />
          <div className="absolute inset-0 flex items-center justify-center">
             <Smartphone className="w-6 h-6 text-blue-600 animate-pulse" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-xl font-black text-slate-900 tracking-[0.4em] uppercase">Alfath Pulsa</h1>
          <div className="flex items-center gap-2.5 bg-slate-50 px-5 py-2.5 rounded-full border border-slate-100 shadow-sm">
             <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
             <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-[0.2em] leading-none">Menyiapkan Sistem...</p>
          </div>
          
          <button 
            onClick={() => {
              localStorage.clear();
              handleAppLogout();
              window.location.reload();
            }}
            className="mt-6 text-[8px] text-slate-400 hover:text-blue-600 font-black uppercase tracking-widest cursor-pointer border-b border-transparent hover:border-blue-200 pb-0.5 transition-all"
          >
            Reset & Muat Ulang Jika Macet
          </button>
        </div>
      </div>
    );

  if (!profile) {
    return (
      <div className="auth-screen flex min-h-[100dvh] font-sans items-center justify-center p-4">
        {/* app-solid keeps the login surface controlled by its focused styles. */}
        <div className="auth-card app-solid rounded-3xl max-w-sm w-full animate-in zoom-in-95 duration-300 overflow-hidden">

          {/* Header strip */}
          <div data-auth-header className="px-8 pt-9 pb-6 text-center" style={{ borderBottom: '1px solid rgba(71,85,105,0.4)' }}>
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl overflow-hidden flex items-center justify-center"
                 style={{ backgroundColor: '#f3f0e9', border: '1px solid rgba(182,155,104,0.28)' }}>
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="Alfath Pulsa"
                className="w-14 h-14 object-contain"
              />
            </div>
            <h1 className="text-lg font-black text-white tracking-tight mb-0.5">
              Alfath Pulsa POS
            </h1>
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#68717d' }}>
              Sistem Manajemen Multi-Cabang
            </p>
          </div>

          {/* Form body */}
          <div className="px-8 py-7">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleLoginSubmit(Object.fromEntries(formData));
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#68717d' }}>
                  Username
                </label>
                <input
                  name="username"
                  type="text"
                  required
                  style={{ backgroundColor: '#f3f0e9', borderColor: 'rgba(29,82,218,0.14)', color: '#17243a' }}
                  className="auth-field w-full rounded-xl px-4 py-3 text-sm font-medium border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-500"
                  placeholder="Masukkan username"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#68717d' }}>
                  Password
                </label>
                <input
                  name="password"
                  type="password"
                  required
                  style={{ backgroundColor: '#f3f0e9', borderColor: 'rgba(29,82,218,0.14)', color: '#17243a' }}
                  className="auth-field w-full rounded-xl px-4 py-3 text-sm font-medium border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-500"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                className="auth-submit w-full mt-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
              >
                Masuk ke Sistem <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="px-8 pb-6 text-center">
            <p className="text-[9px] font-medium uppercase tracking-widest" style={{ color: '#68717d' }}>
              Hubungi Admin Pusat untuk Aktivasi Akun
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!profile || !profile?.role)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 gap-6">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
        <div className="flex flex-col items-center gap-2">
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">Menyiapkan Profil...</p>
          <button 
            onClick={() => {
              localStorage.clear();
              handleAppLogout();
              window.location.reload();
            }}
            className="text-[9px] text-slate-600 hover:text-slate-400 font-bold uppercase tracking-widest cursor-pointer underline underline-offset-4"
          >
            Reset & Logout Jika Macet
          </button>
        </div>
      </div>
    );

  if (profile?.role === "PENDING") {
    return (
      <div className="auth-screen flex min-h-[100dvh] bg-slate-50 font-sans items-center justify-center p-4">
        <div className="auth-card app-solid p-4 md:p-8 rounded border border-amber-200 max-w-md w-full text-center shadow-sm">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2 tracking-tight">
            Akun Menunggu Review
          </h2>
          <p className="text-xs text-slate-500 mb-6 font-medium leading-relaxed">
            Akun Anda ({profile.email}) sukses terdaftar. Namun Admin belum
            menugaskan hak akses (Role) dan entitas Cabang Anda.
          </p>
          <button
            onClick={handleAppLogout}
            className="text-xs font-bold text-slate-500 uppercase tracking-widest hover:text-red-500"
          >
            Log Out / Ganti Akun
          </button>
        </div>
      </div>
    );
  }

  const generateWhatsAppMessage = (items: any[]) => {
    let message = `*Rencana Belanja Alfath Pulsa*\n`;
    message += `_Tanggal: ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}_\n\n`;

    const branchGroups: {
      [branchId: string]: { productName: string; qty: number }[];
    } = {};

    items.forEach((it) => {
      const p = products.find((prod) => prod.id === it.productId);
      const productName = p?.name || "Unknown Product";
      const branchQtys = (it.branchQtys || {}) as { [s: string]: string };

      Object.entries(branchQtys).forEach(([bId, qtyStr]) => {
        const qty = parseInt(qtyStr || "0") || 0;
        if (qty > 0) {
          if (!branchGroups[bId]) branchGroups[bId] = [];
          branchGroups[bId].push({ productName, qty });
        }
      });
    });

    let totalItems = 0;

    branches
      .slice()
      .sort((a, b) => naturalSort(a.name, b.name))
      .forEach((b) => {
        const bItems = branchGroups[b.id];
        if (bItems && bItems.length > 0) {
          message += `*📍 ${b.name}*\n`;
          let bTotal = 0;
          bItems
            .sort((a, b) => naturalSort(a.productName, b.productName))
            .forEach((item) => {
              message += `  • ${item.productName}: ${item.qty} pcs\n`;
              bTotal += item.qty;
              totalItems += item.qty;
            });
          message += `  _> Total Cabang: ${bTotal} pcs_\n\n`;
        }
      });

    message += `*➤ TOTAL KESELURUHAN: ${totalItems} pcs*\n`;

    message += `\n_Mohon segera diproses, Terimakasih._`;
    return message;
  };

  // --- MAIN UI ---
  return (
    <>
      <div
        className="app-shell flex h-[100dvh] bg-slate-50 font-sans text-slate-800 overflow-hidden"
        data-admin-surface={profile?.role === "ADMIN" && activeMenu !== "pos" ? "true" : undefined}
      >
        {/* --- DESKTOP/TABLET SIDEBAR --- */}
        <div
          className={`fixed inset-0 bg-black/50 z-[80] transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
        <aside data-cashier-sidebar={profile?.role === "CASHIER" ? "true" : undefined} className={`app-sidebar fixed inset-y-0 left-0 w-64 bg-[#e0e5ec] dark:bg-[#23262e] border-r border-white/50 dark:border-white/5 flex flex-col shrink-0 z-[90] h-[100dvh] shadow-2xl transform transition-transform duration-300 ease-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="h-16 flex items-center px-4 md:px-6 border-b border-white/60 dark:border-white/10 shrink-0">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="Alfath Pulsa"
              className="w-9 h-9 rounded-xl object-contain mr-3 shrink-0"
            />
            <div className="truncate text-left">
              <h1 className="font-extrabold text-[15px] text-slate-900 dark:text-white tracking-tight leading-tight truncate">
                ALFATH PULSA
              </h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest truncate">
                {displayedBranchName}
              </p>
            </div>
          </div>

          <nav onClick={() => setIsSidebarOpen(false)} className="flex-1 overflow-y-auto px-3 py-3 md:py-4 space-y-1 hide-scrollbar">
            {profile?.role === "ADMIN" && (
              <>
                <MenuCategory title="Pusat Komando" />
                <MenuItem
                  icon={MdSpaceDashboard}
                  label="Dashboard Pusat"
                  active={activeMenu === "dashboard"}
                  onClick={() => setActiveMenu("dashboard")}
                />
                <MenuItem
                  icon={MdInsights}
                  label="Shift & Pendapatan"
                  active={activeMenu === "reports"}
                  onClick={() => setActiveMenu("reports")}
                />
                <MenuItem
                  icon={MdAutoAwesome}
                  label="Bonus & Insentif"
                  active={activeMenu === "incentive"}
                  onClick={() => setActiveMenu("incentive")}
                />
                <MenuItem
                  icon={MdGroups}
                  label="Atur Akses Karyawan"
                  active={activeMenu === "employees"}
                  onClick={() => setActiveMenu("employees")}
                />
                <MenuItem
                  icon={MdStorefront}
                  label="Cabang & Lokasi"
                  active={activeMenu === "settings"}
                  onClick={() => setActiveMenu("settings")}
                />
                <MenuCategory title="Data Master" />
                <MenuItem
                  icon={MdInventory2}
                  label="Inventori Global"
                  active={activeMenu === "inventory"}
                  onClick={() => setActiveMenu("inventory")}
                />
                <MenuItem
                  icon={MdFactCheck}
                  label="Opname Cabang"
                  active={activeMenu === "audit"}
                  onClick={() => setActiveMenu("audit")}
                />
                <MenuItem
                  icon={MdFactCheck}
                  label="Audit Stok Cabang"
                  active={activeMenu === "stock_audit"}
                  onClick={() => setActiveMenu("stock_audit")}
                />
                <MenuItem
                  icon={MdWarehouse}
                  label="Stok per Cabang"
                  active={activeMenu === "branch_stocks"}
                  onClick={() => setActiveMenu("branch_stocks")}
                />
              </>
            )}

            {profile?.role === "CASHIER" && (
              <>
                <MenuCategory title="Stasiun Transaksi" />
                <MenuItem
                  icon={MdPointOfSale}
                  label="Kasir (POS)"
                  active={activeMenu === "pos"}
                  onClick={() => setActiveMenu("pos")}
                  badge={cashierExpiringCount}
                />
                <MenuItem
                  icon={MdSchedule}
                  label="Manajemen Shift"
                  active={activeMenu === "shift"}
                  onClick={() => setActiveMenu("shift")}
                />
                <MenuItem
                  icon={MdAutoAwesome}
                  label="Bonus Saya"
                  active={activeMenu === "incentive"}
                  onClick={() => setActiveMenu("incentive")}
                />
                <MenuItem
                  icon={MdAddBox}
                  label="Input Stok Cabang"
                  active={activeMenu === "cashier_stock"}
                  onClick={() => setActiveMenu("cashier_stock")}
                  locked={
                    !appConfig.allowCashierStockInput ||
                    !shiftOpen ||
                    branches.find((b) => b.id === profile?.branchId)
                      ?.allowEmployeeInput === false
                  }
                />
              </>
            )}

            {profile?.role === "AUDIT" && (
              <>
                <MenuCategory title="Gudang & Logistik" />
                <MenuItem
                  icon={MdFactCheck}
                  label="Opname Cabang"
                  active={activeMenu === "audit"}
                  onClick={() => setActiveMenu("audit")}
                />
                <MenuItem
                  icon={MdFactCheck}
                  label="Audit Stok Cabang"
                  active={activeMenu === "stock_audit"}
                  onClick={() => setActiveMenu("stock_audit")}
                />
                <MenuItem
                  icon={MdInsights}
                  label="Shift & Pendapatan"
                  active={activeMenu === "reports"}
                  onClick={() => setActiveMenu("reports")}
                />
              </>
            )}
          </nav>

          <div className="p-4 border-t border-slate-100 shrink-0 space-y-2">
            {deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600/10 text-emerald-600 border border-emerald-500/30 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all"
              >
                <ScanBarcode className="w-4 h-4" /> Pasang Aplikasi (PWA)
              </button>
            )}

            <div
              data-cashier-active-card={profile?.role === "CASHIER" ? "true" : undefined}
              className="flex items-start gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 mb-1 overflow-hidden"
            >
              <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-xs shrink-0">
                {displayedCashierName.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                {profile?.role === "CASHIER" ? (
                  <>
                    <div>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                        Kasir Aktif
                      </p>
                      <p className="text-[11px] font-bold text-slate-900 truncate">
                        {activeCashierName || "Belum ada shift aktif"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-emerald-500/20 text-emerald-600">
                        CASHIER
                      </span>
                    </div>
                    <p className="text-[8px] text-slate-500 truncate" title={displayedBranchName}>
                      Cabang: {displayedBranchName}
                    </p>
                    <p className="text-[8px] text-slate-500 truncate" title={displayedAccountLogin}>
                      Akun cabang: {displayedAccountLogin}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] font-bold text-slate-900 truncate">
                      {displayedAccountName}
                    </p>
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest ${profile?.role === "ADMIN" ? "bg-blue-500/20 text-blue-600" : "bg-amber-500/20 text-amber-600"}`}
                    >
                      {profile?.role}
                    </span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={handleAppLogout}
              className="w-full flex items-center justify-center gap-2 text-[10px] font-bold text-rose-500 hover:bg-rose-500/10 py-2.5 rounded-xl transition-colors uppercase tracking-widest border border-slate-100"
            >
              <LogOut className="w-4 h-4" /> Log Out
            </button>
          </div>
        </aside>

        {/* --- DASHBOARD CONTENT AREA --- */}
        <div className="flex-1 flex flex-col min-w-0 pb-[68px] md:pb-0 relative h-[100dvh]">
          {/* HEADER */}
          <header data-topbar-screen={activeMenu} className={`app-topbar h-[60px] md:h-16 bg-white flex items-center justify-between shrink-0 z-10 shadow-[0_6px_16px_rgba(184,194,208,0.45)] dark:shadow-[0_6px_16px_rgba(0,0,0,0.4)] relative ${activeMenu === "stock_audit" ? "min-w-0 px-2 sm:px-4 md:px-6" : "px-4 md:px-6"}`}>
            <div className={`flex items-center gap-3 md:gap-4 overflow-hidden ${activeMenu === "stock_audit" ? "min-w-0" : ""}`}>
              <button className="p-2 -ml-1 rounded-xl bg-slate-50 text-blue-600 shadow-[3px_3px_7px_#b8c2d0,-3px_-3px_7px_#ffffff,0_0_12px_1px_rgba(59,130,246,0.3)] dark:shadow-[3px_3px_7px_#1c1e24,-3px_-3px_7px_#34373f,0_0_12px_1px_rgba(59,130,246,0.3)] active:shadow-[inset_3px_3px_6px_#b8c2d0,inset_-3px_-3px_6px_#ffffff] dark:active:shadow-[inset_3px_3px_6px_#1c1e24,inset_-3px_-3px_6px_#34373f] transition-all" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                <Menu className="w-6 h-6" />
              </button>
              <div data-topbar-branch-icon className={`${activeMenu === "stock_audit" ? "hidden sm:flex" : "md:hidden"} shrink-0 w-9 h-9 rounded-xl bg-slate-50 items-center justify-center shadow-[3px_3px_7px_#b8c2d0,-3px_-3px_7px_#ffffff,0_0_14px_1px_rgba(59,130,246,0.4)] dark:shadow-[3px_3px_7px_#1c1e24,-3px_-3px_7px_#34373f,0_0_14px_1px_rgba(59,130,246,0.4)]`}>
                <MdStorefront className="w-5 h-5 text-blue-600" />
              </div>
              <div data-topbar-title className={`flex min-w-0 flex-col justify-center ${activeMenu === "stock_audit" ? "max-w-[92px] sm:max-w-none" : ""}`}>
                <h2 className="max-w-full text-sm md:text-md font-extrabold uppercase tracking-tight text-slate-800 truncate leading-tight">
                  {getPageTitle()}
                </h2>
              </div>
              <div className="hidden sm:block h-5 w-px bg-slate-200 shrink-0 mx-2"></div>
              {profile?.role === "CASHIER" && (
                <span
                  className={`hidden sm:flex px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest border items-center gap-1.5 shrink-0 ${shiftOpen ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}
                >
                  <Clock className="w-3 h-3" />{" "}
                  {shiftOpen ? "Shift Aktif" : "Shift Off"}
                </span>
              )}
            </div>
            <div className={`flex items-center shrink-0 ${activeMenu === "stock_audit" ? "gap-1 sm:gap-2" : "gap-2"}`}>
              {profile?.role === "ADMIN" && (
                <button
                  onClick={() => setActiveMenu("shopping_list")}
                  aria-label="Daftar Belanja"
                  className={`flex items-center gap-2 rounded-xl py-1.5 font-black text-[9px] uppercase tracking-widest transition-all ${activeMenu === "stock_audit" ? "px-2 sm:px-3" : "px-3"} ${activeMenu === "shopping_list" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span data-topbar-shopping-label className={activeMenu === "stock_audit" ? "hidden sm:inline" : ""}>Daftar Belanja</span>
                  {shopListAlertCount > 0 ? (
                    <span className="w-4 h-4 bg-red-500 text-white flex items-center justify-center rounded-full text-[8px] animate-pulse shadow-[0_0_10px_2px_rgba(239,68,68,0.7)]">
                      {shopListAlertCount}
                    </span>
                  ) : null}
                </button>
              )}
              {deferredPrompt && (
                <button
                  onClick={handleInstallClick}
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-700 border border-emerald-200 rounded font-black text-[9px] uppercase tracking-widest hover:bg-emerald-200"
                >
                  <Plus className="w-3.5 h-3.5" /> Pasang App
                </button>
              )}
              {scanIndicator && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded animate-pulse">
                  <ScanBarcode className="w-4 h-4 text-blue-600" />
                  <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                    Scanner On: {scanIndicator}
                  </span>
                </div>
              )}
              <button
                onClick={() => {
                  if (usesOwnerSync) void ownerDashboard.refresh();
                  else setRefreshTick(t => t + 1);
                }}
                aria-label={!isOnline ? (dataLoadFailed ? "Offline, data lama" : "Offline") : dataLoadFailed ? "Online, data lama, coba muat ulang" : "Online"}
                title={dataLoadFailed ? "Data gagal dimuat — klik untuk refresh" : isOnline ? "Sistem online" : "Koneksi bermasalah — klik untuk coba lagi"}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl shrink-0 transition-all active:scale-95 cursor-pointer ${
                  !isOnline
                    ? "bg-red-50 dark:bg-red-950/30 shadow-[3px_3px_7px_#f8c4c4,-3px_-3px_7px_#ffffff] dark:shadow-none"
                    : dataLoadFailed
                    ? "bg-amber-50 dark:bg-amber-950/30 shadow-[3px_3px_7px_#f5e0b3,-3px_-3px_7px_#ffffff] dark:shadow-none animate-pulse"
                    : "bg-slate-50 dark:bg-transparent shadow-[3px_3px_7px_#b8c2d0,-3px_-3px_7px_#ffffff] dark:shadow-[3px_3px_7px_#1c1e24,-3px_-3px_7px_#34373f]"
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${
                  !isOnline
                    ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse"
                    : dataLoadFailed
                    ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse"
                    : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                }`} />
                <span data-topbar-connection-label className={`text-[7px] font-black uppercase tracking-widest text-slate-600 ${activeMenu === "stock_audit" ? "hidden sm:inline" : ""}`}>
                  {!isOnline ? (dataLoadFailed ? "Offline · Data Lama" : "Offline") : dataLoadFailed ? "Data Lama ↺" : "Online"}
                </span>
              </button>
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="flex items-center justify-center h-8.5 w-8.5 rounded-xl bg-slate-50 text-slate-600 shrink-0 cursor-pointer transition-all shadow-[3px_3px_7px_#b8c2d0,-3px_-3px_7px_#ffffff] dark:shadow-[3px_3px_7px_#1c1e24,-3px_-3px_7px_#34373f] active:shadow-[inset_3px_3px_6px_#b8c2d0,inset_-3px_-3px_6px_#ffffff] dark:active:shadow-[inset_3px_3px_6px_#1c1e24,inset_-3px_-3px_6px_#34373f]"
                title={darkMode ? "Aktifkan Mode Terang" : "Aktifkan Mode Gelap"}
              >
                {darkMode ? (
                  <Sun className="w-4 h-4 text-amber-500 drop-shadow-[0_0_6px_rgba(245,158,11,0.75)]" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-500 drop-shadow-[0_0_6px_rgba(99,102,241,0.6)]" />
                )}
              </button>
              <button
                onClick={handleAppLogout}
                className="lg:hidden w-8.5 h-8.5 rounded-xl bg-slate-50 text-red-500 flex items-center justify-center shrink-0 transition-all shadow-[3px_3px_7px_#b8c2d0,-3px_-3px_7px_#ffffff] dark:shadow-[3px_3px_7px_#1c1e24,-3px_-3px_7px_#34373f] active:shadow-[inset_3px_3px_6px_#b8c2d0,inset_-3px_-3px_6px_#ffffff] dark:active:shadow-[inset_3px_3px_6px_#1c1e24,inset_-3px_-3px_6px_#34373f] hover:shadow-[0_0_12px_1px_rgba(239,68,68,0.4),3px_3px_7px_#b8c2d0,-3px_-3px_7px_#ffffff] dark:hover:shadow-[0_0_12px_1px_rgba(239,68,68,0.4),3px_3px_7px_#1c1e24,-3px_-3px_7px_#34373f]"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* WORKSPACES */}
          <main className={`app-workspace flex-1 overflow-hidden flex bg-slate-50/50 relative h-full ${activeMenu === "stock_audit" ? "min-w-0" : ""}`}>
            {/* --- 1. ADMIN: PENGATURAN AKSES KARYAWAN --- */}
            {activeMenu === "employees" && profile?.role === "ADMIN" && (
              <div data-ui-screen="employees" className="ui-screen-employees flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
                <div data-ui-panel="employee-access-list" className="bg-white rounded-3xl flex flex-col h-full overflow-hidden">
                  <div className="p-3 md:p-4 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 shrink-0 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-black text-slate-800 uppercase tracking-tight">
                            Karyawan & Akses
                          </h3>
                          <span className="text-[9px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full uppercase">
                            {users.length} Akun
                          </span>
                        </div>
                        <p className="hidden sm:block text-[9px] font-medium text-slate-400 mt-0.5 leading-relaxed">
                          Satu akun cabang dapat dipakai bergantian. Isi nama penjaga utama dan tambahan agar semuanya muncul di pilihan shift.
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setShowUserForm(true)}
                      className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-black px-3 py-2 rounded-xl text-[9px] uppercase tracking-widest transition-all shadow-sm shadow-blue-200 active:scale-95 flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Akun Login
                    </button>
                  </div>
                  {/* === MOBILE CARD LIST (< md) === */}
                  <div data-employee-mobile-list className="md:hidden flex-1 overflow-y-auto overflow-x-hidden divide-y divide-slate-100">
                    {users.length === 0 && (
                      <div className="py-12 flex flex-col items-center gap-2">
                        <Users className="w-8 h-8 text-slate-200" />
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Belum ada akun</p>
                      </div>
                    )}
                    {[...users]
                      .sort((a, b) => {
                        const an = branches.find((x) => x.id === a.branchId)?.name || "\uffff";
                        const bn = branches.find((x) => x.id === b.branchId)?.name || "\uffff";
                        return an.localeCompare(bn) || (a.name || a.displayName || "").localeCompare(b.name || b.displayName || "");
                      })
                      .map((emp) => (
                      <div data-employee-card key={emp.id} className="min-w-0 max-w-full p-3 space-y-2 hover:bg-slate-50/60 transition-colors">
                        {/* Baris 1: Avatar + Nama + Role badge */}
                        <div data-employee-primary-row className="flex min-w-0 items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs shrink-0 border border-blue-100">
                            {(emp.name || emp.displayName || emp.email || "?")[0].toUpperCase()}
                          </div>
                          <input
                            data-employee-name
                            type="text"
                            defaultValue={emp.name || emp.displayName || ""}
                            onBlur={(e) => { if (e.target.value !== (emp.name || emp.displayName || "")) updateUser(emp.id, "name", e.target.value); }}
                            placeholder="Nama penjaga utama..."
                            className="flex-1 min-w-0 text-xs font-bold text-slate-800 bg-white border border-slate-200 focus:border-blue-400 focus:outline-none px-2 py-1 rounded-lg transition-all"
                          />
                          <div data-employee-role className="w-[5.25rem] min-w-0 shrink-0">
                            <CustomSelect
                              value={emp.role}
                              onChange={(v) => updateUser(emp.id, "role", v)}
                              options={[
                                { value: "PENDING", label: "PENDING" },
                                { value: "ADMIN", label: "ADMIN" },
                                { value: "CASHIER", label: "KASIR" },
                                { value: "AUDIT", label: "AUDIT" },
                              ]}
                              keepTriggerBg
                              className="w-full min-w-0"
                              buttonClassName={`w-full min-w-0 text-[9px] font-black uppercase px-2 py-1 rounded-lg border ${emp.role === "PENDING" ? "bg-amber-50 text-amber-700 border-amber-200" : emp.role === "ADMIN" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}
                            />
                          </div>
                        </div>
                        {/* Baris 2: Nama alternatif */}
                        <input
                          data-employee-alias
                          type="text"
                          defaultValue={emp.alternativeNames || ""}
                          onBlur={(e) => { if (e.target.value !== (emp.alternativeNames || "")) updateUser(emp.id, "alternativeNames", e.target.value); }}
                          placeholder="Nama penjaga tambahan, pisahkan dengan koma..."
                          className="block w-full text-[9px] font-medium text-slate-400 bg-slate-50 border border-slate-100 focus:border-blue-400 focus:outline-none px-2 py-1 rounded-lg transition-all italic"
                        />
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[8px] font-bold text-slate-400 uppercase">Pilihan nama kasir:</span>
                          {getConfiguredKeeperNames(emp).map((name) => (
                            <span key={name} className="px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-[8px] font-bold text-blue-700">
                              {name}
                            </span>
                          ))}
                        </div>
                        <p className="text-[8px] text-slate-400">Perubahan tersimpan setelah Anda keluar dari kolom.</p>
                        {/* Baris 3: Cabang + tombol aksi */}
                        <div data-employee-branch-row className="flex min-w-0 items-center gap-1.5">
                          <div data-employee-branch-select className="min-w-0 flex-1">
                            <CustomSelect
                              value={emp.branchId || ""}
                              onChange={(v) => updateUser(emp.id, "branchId", v)}
                              placeholder="Belum ditempatkan"
                              options={[
                                { value: "", label: "-- Belum Ditempatkan --" },
                                ...branches.map((b) => ({ value: b.id, label: b.name })),
                              ]}
                              className="w-full min-w-0"
                              buttonClassName="w-full min-w-0 text-[9px] font-bold uppercase tracking-tight px-2 py-1 rounded-lg border border-slate-200 bg-white"
                            />
                          </div>
                          <div data-employee-actions className="flex shrink-0 items-center gap-1">
                            <button onClick={() => setResetUser(emp)} className="h-11 w-11 min-w-[44px] p-1.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all active:scale-95 shrink-0" title="Reset Password">
                              <Key className="w-3.5 h-3.5" />
                            </button>
                            {emp.id !== user?.uid && (
                              <button onClick={() => deleteUser(emp.id, emp.name)} className="h-11 w-11 min-w-[44px] p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-all active:scale-90 shrink-0" title="Hapus">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-[8px] text-slate-300 font-mono">{emp.email}</p>
                      </div>
                    ))}
                  </div>

                  {/* === DESKTOP TABLE (≥ md) === */}
                  <div className="hidden md:flex flex-1 overflow-auto">
                    <table className="w-full min-w-[620px] text-left border-collapse">
                      <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 z-10">
                        <tr>
                          <th className="px-3 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Karyawan</th>
                          <th className="px-3 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Role</th>
                          <th className="px-3 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cabang</th>
                          <th className="px-3 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {users.length === 0 && (
                          <tr><td colSpan={4} className="px-4 py-12 text-center">
                            <div className="flex flex-col items-center gap-2 text-slate-300">
                              <Users className="w-8 h-8" />
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Belum ada akun karyawan</p>
                            </div>
                          </td></tr>
                        )}
                        {[...users]
                          .sort((a, b) => {
                            const an = branches.find((x) => x.id === a.branchId)?.name || "\uffff";
                            const bn = branches.find((x) => x.id === b.branchId)?.name || "\uffff";
                            return an.localeCompare(bn) || (a.name || a.displayName || "").localeCompare(b.name || b.displayName || "");
                          })
                          .map((emp) => (
                          <tr key={emp.id} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2">
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  defaultValue={emp.name || emp.displayName || ""}
                                  onBlur={(e) => { if (e.target.value !== (emp.name || emp.displayName || "")) updateUser(emp.id, "name", e.target.value); }}
                                  placeholder="Nama penjaga utama..."
                                  className="block w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 focus:border-blue-400 focus:outline-none px-2 py-1 rounded-lg transition-all"
                                />
                                <input
                                  type="text"
                                  defaultValue={emp.alternativeNames || ""}
                                  onBlur={(e) => { if (e.target.value !== (emp.alternativeNames || "")) updateUser(emp.id, "alternativeNames", e.target.value); }}
                                  placeholder="Nama penjaga tambahan, pisahkan dengan koma..."
                                  className="block w-full text-[9px] font-medium text-slate-400 bg-slate-50 border border-slate-100 focus:border-blue-400 focus:outline-none px-2 py-0.5 rounded-lg transition-all italic"
                                />
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="text-[8px] font-bold text-slate-400 uppercase">Pilihan nama kasir:</span>
                                  {getConfiguredKeeperNames(emp).map((name) => (
                                    <span key={name} className="px-1.5 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-[8px] font-bold text-blue-700">
                                      {name}
                                    </span>
                                  ))}
                                </div>
                                <p className="text-[8px] text-slate-400">Perubahan tersimpan setelah Anda keluar dari kolom.</p>
                                <p className="text-[9px] text-slate-300 font-mono">{emp.email}</p>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <CustomSelect
                                value={emp.role}
                                onChange={(v) => updateUser(emp.id, "role", v)}
                                options={[
                                  { value: "PENDING", label: "PENDING (Terkunci)" },
                                  { value: "ADMIN", label: "ADMIN PUSAT" },
                                  { value: "CASHIER", label: "KASIR TOKO" },
                                  { value: "AUDIT", label: "TIM AUDIT" },
                                ]}
                                keepTriggerBg
                                buttonClassName={`text-[10px] font-bold uppercase px-2 py-1.5 rounded-lg border ${emp.role === "PENDING" ? "bg-amber-50 text-amber-700 border-amber-200" : emp.role === "ADMIN" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <CustomSelect
                                value={emp.branchId || ""}
                                onChange={(v) => updateUser(emp.id, "branchId", v)}
                                placeholder="-- BELUM DITEMPATKAN --"
                                options={[
                                  { value: "", label: "-- Belum Ditempatkan --" },
                                  ...branches.map((b) => ({ value: b.id, label: b.name })),
                                ]}
                                className="w-full max-w-[180px]"
                                buttonClassName="w-full text-[10px] font-bold uppercase tracking-tight px-2 py-1.5 rounded-lg border border-slate-200 bg-white"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => setResetUser(emp)} className="p-1.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all active:scale-95" title="Reset Password">
                                  <Key className="w-3.5 h-3.5" />
                                </button>
                                {emp.id !== user?.uid && (
                                  <button onClick={() => deleteUser(emp.id, emp.name)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-all active:scale-90" title="Hapus">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Reset Password */}
            {resetUser && (
              <div className="fixed inset-0 z-[5000] bg-slate-900/60 flex items-center justify-center p-4 text-left">
                <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-200">
                  <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center">
                        <Key className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-800 text-sm uppercase tracking-tight">
                          Ganti Password
                        </h3>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]">
                          User: {resetUser.username || resetUser.email || resetUser.name}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setResetUser(null)}
                      className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  <div className="p-6 space-y-4">
                    <div className="space-y-1.5 text-left">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        Password Baru
                      </label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                          <Lock className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          value={newPassInput}
                          onChange={(e) => setNewPassInput(e.target.value)}
                          placeholder="Masukkan password baru..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-10 pr-4 text-sm focus:ring-4 focus:ring-orange-100 outline-none transition-all font-bold"
                          autoFocus
                        />
                      </div>
                    </div>
                    
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => setResetUser(null)}
                        className="flex-1 py-3 px-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all"
                      >
                        Batal
                      </button>
                      <button
                        onClick={async () => {
                          if (!newPassInput) return alert("Password tidak boleh kosong.");
                          setIsUpdatingPass(true);
                          try {
                            await api.updateUser(resetUser.id, { password: newPassInput });
                            alert("Password berhasil diperbarui!");
                            setResetUser(null);
                            setNewPassInput("");
                          } catch (err) {
                            alert("Gagal memperbarui password.");
                          } finally {
                            setIsUpdatingPass(false);
                          }
                        }}
                        disabled={isUpdatingPass}
                        className="flex-[2] py-3 px-4 bg-orange-500 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-orange-200 hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isUpdatingPass ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Memproses...
                          </>
                        ) : (
                          "Update Password"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* --- 2. ADMIN: PENGATURAN CABANG --- */}
            {activeMenu === "reports" &&
              (profile?.role === "ADMIN" || profile?.role === "AUDIT") && (
                <div data-ui-screen="reports" className="ui-screen-reports flex-1 p-3 md:p-6 overflow-y-auto w-full bg-slate-50 content-fade">
                  <div data-report-toolbar className="mb-3 md:mb-4 text-left">
                    <div data-report-filters className="flex flex-wrap gap-2 md:gap-3 items-end shadow-sm">
                      <div data-report-subtabs className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                          onClick={() => setReportSubTab("summary")}
                          data-report-view-option
                          data-active={reportSubTab === "summary" ? "true" : undefined}
                          className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${reportSubTab === "summary" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                          Analisis
                        </button>
                        <button
                          onClick={() => setReportSubTab("excel")}
                          data-report-view-option
                          data-active={reportSubTab === "excel" ? "true" : undefined}
                          className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${reportSubTab === "excel" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                        >
                          Tabel Excel
                        </button>
                      </div>
                      <div data-report-date-start className="flex flex-col gap-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          Dari Tanggal
                        </span>
                        <div data-report-date-shell className="relative flex h-11 min-w-0 items-center justify-between gap-2 rounded-xl px-3">
                          <span data-report-date-label aria-hidden="true">
                            {formatReportDateLabel(reportStartDate)}
                          </span>
                          <CalendarDays data-report-calendar-icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                          <input
                            type="date"
                            value={reportStartDate}
                            onChange={(e) => setReportStartDate(e.target.value)}
                            aria-label="Dari tanggal laporan"
                            data-report-date-input
                            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                          />
                        </div>
                      </div>
                      <div data-report-date-end className="flex flex-col gap-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          Sampai Tanggal
                        </span>
                        <div data-report-date-shell className="relative flex h-11 min-w-0 items-center justify-between gap-2 rounded-xl px-3">
                          <span data-report-date-label aria-hidden="true">
                            {formatReportDateLabel(reportEndDate)}
                          </span>
                          <CalendarDays data-report-calendar-icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                          <input
                            type="date"
                            value={reportEndDate}
                            onChange={(e) => setReportEndDate(e.target.value)}
                            aria-label="Sampai tanggal laporan"
                            data-report-date-input
                            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                          />
                        </div>
                      </div>
                      <div data-report-branch className="min-w-0">
                        <CustomSelect
                          value={adminSalesBranchFilter}
                          onChange={(v) => setAdminSalesBranchFilter(v)}
                          options={[
                            { value: "", label: "Semua Cabang" },
                            ...branches.map((b) => ({
                              value: b.id,
                              label: b.name,
                            })),
                          ]}
                          className="min-w-0"
                          buttonClassName="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-black uppercase outline-none focus:ring-2 focus:ring-blue-100 h-[38px]"
                        />
                      </div>
                      {(reportStartDate || reportEndDate) && (
                        <button
                          data-report-reset
                          onClick={() => {
                            setReportStartDate("");
                            setReportEndDate("");
                          }}
                          className="h-[38px] px-4 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  <div data-report-content className="content-fade">
                    {reportSubTab === "summary" ? (
                      <div className="grid grid-cols-1 gap-4">
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2 flex items-center justify-between border-b border-slate-200 pb-2">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-emerald-500" />{" "}
                          Laporan Pendapatan Shift
                        </div>
                        <span className="text-[10px] text-slate-400 normal-case font-bold">
                          {reportStartDate && reportEndDate
                            ? `${reportStartDate} s/d ${reportEndDate}`
                            : "3 Hari Terakhir"}
                        </span>
                      </h3>
                      <div className="space-y-4">
                        {/* Summary Today & Yesterday */}
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            {
                              label: "Shift Hari Ini", date: new Date(),
                              card: "bg-white border border-slate-200",
                              blob: "hidden",
                              labelColor: "text-slate-500",
                              amount: "text-slate-900",
                              labaPill: "bg-emerald-50 border border-emerald-100 text-emerald-700",
                            },
                            {
                              label: "Shift Kemarin", date: new Date(Date.now() - 86400000),
                              card: "bg-white border border-slate-200",
                              blob: "hidden",
                              labelColor: "text-slate-500",
                              amount: "text-slate-900",
                              labaPill: "bg-emerald-50 border border-emerald-100 text-emerald-700",
                            }
                          ].map((day) => {
                            const logical = getLogicalShiftDate(day.date);
                            const stats = sales.filter(s => 
                              (s.shiftDate || getLogicalShiftDate(new Date(s.createdAt || s.timestamp || 0))) === logical &&
                              (!adminSalesBranchFilter || s.branchId === adminSalesBranchFilter) &&
                              isRevenueEligibleSaleStatus(s.status)
                            ).reduce((acc, s) => {
                              acc.revenue += (s.total || 0);
                              const capital = (s.items || []).reduce((sum: number, it: any) => {
                                let pPrice = it.purchasePrice;
                                if (pPrice === undefined || pPrice === null) {
                                  const m = products.find(p => p.id === (it.productId || it.id));
                                  pPrice = m?.buyingPrice || 0; // Use buyingPrice as per schema
                                }
                                return sum + (pPrice * (it.qty || 0));
                              }, 0);
                              acc.profit += ((s.total || 0) - capital);
                              return acc;
                            }, { revenue: 0, profit: 0 });
                            
                            return (
                              <div data-report-day-card key={day.label} className={`relative overflow-hidden p-3 md:p-4 rounded-2xl group ${day.card}`}>
                                <div className={`absolute top-0 right-0 w-20 h-20 rounded-bl-full transform translate-x-5 -translate-y-5 transition-transform group-hover:scale-110 ${day.blob}`}></div>
                                <p className={`relative text-[9px] font-black ${day.labelColor} uppercase tracking-wider mb-1`}>{day.label}</p>
                                <div className="relative flex flex-col items-start gap-1.5">
                                  <p className={`text-lg font-black ${day.amount}`}>Rp {stats.revenue.toLocaleString("id-ID")}</p>
                                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${day.labaPill}`}>Laba: Rp {stats.profit.toLocaleString("id-ID")}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {["Pagi", "Malam"].map((type) => {
                            const filteredForType = sales.filter((s) => {
                              const physicalDate = new Date(s.createdAt || s.timestamp || 0);
                              const saleLogicalStr = s.shiftDate || getLogicalShiftDate(physicalDate);
                              const saleLogicalDate = new Date(saleLogicalStr);
                              
                              const branchMatch = !adminSalesBranchFilter || s.branchId === adminSalesBranchFilter;

                              let dateMatch = true;
                              if (reportStartDate && reportEndDate) {
                                const start = new Date(reportStartDate);
                                start.setHours(0, 0, 0, 0);
                                const end = new Date(reportEndDate);
                                end.setHours(23, 59, 59, 999);
                                dateMatch = saleLogicalDate >= start && saleLogicalDate <= end;
                              } else {
                                const todayStr = getLogicalShiftDate();
                                const todayDate = new Date(todayStr);
                                const diffDays = Math.round((todayDate.getTime() - saleLogicalDate.getTime()) / (1000 * 3600 * 24));
                                dateMatch = diffDays <= 3;
                              }

                              const sType = s.shiftType || (physicalDate.getHours() >= 7 && physicalDate.getHours() < 19 ? "Pagi" : "Malam");
                              return branchMatch && sType === type && dateMatch && isRevenueEligibleSaleStatus(s.status);
                            });

                            const totalRevenue = filteredForType.reduce((acc, s) => acc + (s.total || 0), 0);
                            const totalComm = filteredForType.reduce((acc, s) => acc + (s.totalCommission || 0), 0);

                            return (
                              <div
                                data-report-period-card={type.toLowerCase()}
                                key={type}
                                className={`p-3 md:p-5 rounded-2xl border transition-all ${type === "Pagi" ? "bg-amber-50 border-amber-200" : "bg-indigo-50 border-indigo-200"}`}
                              >
                                <p className={`text-[10px] font-black uppercase tracking-widest mb-1.5 ${type === "Pagi" ? "text-amber-600" : "text-indigo-600"}`}>
                                  TOTAL {type.toUpperCase()} (PERIODE)
                                </p>
                                <p className="text-lg md:text-2xl font-black text-slate-900 tracking-tight">
                                  Rp {totalRevenue.toLocaleString("id-ID")}
                                </p>
                                <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between">
                                  <span className="text-[9px] text-slate-400 font-bold uppercase">Estimasi Komisi</span>
                                  <span className="text-[10px] font-bold text-slate-600">Rp {totalComm.toLocaleString("id-ID")}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                        {/* Summary Header: Shift Totals */}
                        {(() => {
                          let grandTotalPagi = 0;
                          let grandTotalMalam = 0;

                          shifts.filter(s => {
                            const branchMatch = !adminSalesBranchFilter || s.branchId === adminSalesBranchFilter;
                            let dateMatch = true;
                            if (reportStartDate && reportEndDate) {
                              const sDate = formatDateLocal(s.shiftDate);
                              dateMatch = sDate >= reportStartDate && sDate <= reportEndDate;
                            }
                            return branchMatch && dateMatch;
                          }).forEach(s => {
                            if (getShiftTypePref(s.shiftType) === "Pagi") {
                              grandTotalPagi += (s.totalSales || 0);
                            } else {
                              grandTotalMalam += (s.totalSales || 0);
                            }
                          });

                          return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
                              <div data-report-excel-total="day" className="bg-amber-50 border border-amber-200 rounded-2xl p-3 md:p-5 text-left relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-amber-100/50 rounded-bl-full transform translate-x-4 -translate-y-4 transition-transform group-hover:scale-110"></div>
                                <p className="text-[8px] md:text-[10px] font-black text-amber-600 uppercase tracking-[0.2em] mb-1">Shift Siang (Pagi)</p>
                                <p className="text-xl md:text-2xl font-black text-amber-900 font-mono leading-none">Rp {grandTotalPagi.toLocaleString("id-ID")}</p>
                                <p className="text-[7px] md:text-[9px] text-amber-500 font-bold uppercase mt-2">Pemasukan Siff Pagi</p>
                              </div>
                              <div data-report-excel-total="night" className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3 md:p-5 text-left relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-100/50 rounded-bl-full transform translate-x-4 -translate-y-4 transition-transform group-hover:scale-110"></div>
                                <p className="text-[8px] md:text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-1">Shift Malam</p>
                                <p className="text-xl md:text-2xl font-black text-indigo-900 font-mono leading-none">Rp {grandTotalMalam.toLocaleString("id-ID")}</p>
                                <p className="text-[7px] md:text-[9px] text-indigo-500 font-bold uppercase mt-2">Pemasukan Siff Malam</p>
                              </div>
                              <div data-report-excel-total="combined" className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 md:p-5 text-left relative overflow-hidden group sm:col-span-2 md:col-span-1">
                                <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-100/50 rounded-bl-full transform translate-x-4 -translate-y-4 transition-transform group-hover:scale-110"></div>
                                <p className="text-[8px] md:text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] mb-1">Total Pendapatan</p>
                                <p className="text-xl md:text-2xl font-black text-emerald-900 font-mono leading-none">Rp {(grandTotalPagi + grandTotalMalam).toLocaleString("id-ID")}</p>
                                <p className="text-[7px] md:text-[9px] text-emerald-500 font-bold uppercase mt-2">Periode yang dipilih</p>
                              </div>
                            </div>
                          );
                        })()}

                        <div data-report-excel-panel className="bg-white rounded-2xl border border-slate-200 overflow-hidden mt-4">
                          <div className="p-3 md:p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3 text-left">
                            <div>
                              <h3 className="text-xs md:text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-3">
                                <div className="w-7 h-7 md:w-8 md:h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
                                  <LayoutGrid className="w-4 h-4" />
                                </div>
                                Tabel Laporan Pendapatan (Excel View)
                              </h3>
                              <p className="text-[8px] md:text-[9px] text-slate-400 font-bold uppercase mt-1">Rekap per Tanggal, Cabang, & Siff</p>
                            </div>
                            <div data-report-export-row className="w-full md:w-auto">
                            <button
                              type="button"
                              data-report-export
                              onClick={() => {
                                const csvRows = [];
                                const headers = ["Tanggal", "Cabang", "Kasir Pagi", "Rp Pagi", "Kasir Malam", "Rp Malam", "Total Harian"];
                                csvRows.push(toCsvRow(headers));
                                
                                const grouped: Record<string, Record<string, { pagi: { val: number, kasir: string }, malam: { val: number, kasir: string } }>> = {};
                                shifts.filter(s => {
                                  const branchMatch = !adminSalesBranchFilter || s.branchId === adminSalesBranchFilter;
                                  let dateMatch = true;
                                  if (reportStartDate && reportEndDate) {
                                    const sDate = formatDateLocal(s.shiftDate);
                                    dateMatch = sDate >= reportStartDate && sDate <= reportEndDate;
                                  }
                                  return branchMatch && dateMatch;
                                }).forEach(s => {
                                  const date = s.shiftDate || "N/A";
                                  const bId = s.branchId || "center";
                                  if (!grouped[date]) grouped[date] = {};
                                  if (!grouped[date][bId]) grouped[date][bId] = { pagi: { val: 0, kasir: "" }, malam: { val: 0, kasir: "" } };
                                  const sType = getShiftTypePref(s.shiftType);
                                  const sKeeper = getShiftKeeperName(s);
                                  if (sType === "Pagi") {
                                    grouped[date][bId].pagi.val += (s.totalSales || 0);
                                    grouped[date][bId].pagi.kasir = sKeeper;
                                  } else {
                                    grouped[date][bId].malam.val += (s.totalSales || 0);
                                    grouped[date][bId].malam.kasir = sKeeper;
                                  }
                                });

                                Object.entries(grouped).sort((a,b) => b[0].localeCompare(a[0])).forEach(([date, branchMap]) => {
                                  Object.entries(branchMap).forEach(([bId, d]) => {
                                    const bName = branches.find(b => b.id === bId)?.name || "Pusat";
                                    csvRows.push(toCsvRow([date, bName, d.pagi.kasir, d.pagi.val, d.malam.kasir, d.malam.val, d.pagi.val + d.malam.val]));
                                  });
                                });

                                const csvString = csvRows.join("\n");
                                const blob = new Blob([csvString], { type: 'text/csv' });
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.setAttribute('hidden', '');
                                a.setAttribute('href', url);
                                a.setAttribute('download', `Rekap_Pendapatan_${new Date().toISOString().split('T')[0]}.csv`);
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                              }}
                              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#20385f] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-[#29436d] md:w-auto"
                            >
                              <Save className="w-3 md:w-4 h-3 md:h-4" /> Ekspor ke Excel (CSV)
                            </button>
                            </div>
                          </div>
                          <div data-report-revenue-scroll className="overflow-x-hidden">
                            <table aria-label="Tabel laporan pendapatan per tanggal dan cabang" className="admin-excel-table admin-revenue-report-table w-full min-w-0 text-left border-collapse">
                              <colgroup>
                                <col data-column="date" />
                                <col data-column="branch" />
                                <col data-column="day-cashier" />
                                <col data-column="day-income" />
                                <col data-column="night-cashier" />
                                <col data-column="night-income" />
                                <col data-column="total" />
                              </colgroup>
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                  <th scope="col" data-column="date" className="px-3 md:px-6 py-3 md:py-4 text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-200">Tanggal</th>
                                  <th scope="col" data-column="branch" className="px-3 md:px-6 py-3 md:py-4 text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-200">Cabang</th>
                                  <th scope="colgroup" data-column="day-group" className="px-2 md:px-4 py-3 md:py-4 text-[8px] md:text-[10px] font-black text-amber-600 uppercase tracking-widest border-r border-slate-200 bg-amber-50/20 text-center" colSpan={2}>Siff Siang (Pagi)</th>
                                  <th scope="colgroup" data-column="night-group" className="px-2 md:px-4 py-3 md:py-4 text-[8px] md:text-[10px] font-black text-indigo-600 uppercase tracking-widest border-r border-slate-200 bg-indigo-50/20 text-center" colSpan={2}>Siff Malam</th>
                                  <th scope="col" data-column="total" className="px-3 md:px-6 py-3 md:py-4 text-[8px] md:text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50/30 text-right">Total</th>
                                </tr>
                                <tr className="bg-slate-50 border-b border-slate-100 text-[7px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                  <th colSpan={2} className="border-r border-slate-200"></th>
                                  <th scope="col" data-column="day-cashier" className="px-2 py-2 border-r border-slate-100 bg-amber-50/5">Kasir</th>
                                  <th scope="col" data-column="day-income" className="px-2 py-2 border-r border-slate-200 bg-amber-50/5 text-right">Omzet</th>
                                  <th scope="col" data-column="night-cashier" className="px-2 py-2 border-r border-slate-100 bg-indigo-50/5">Kasir</th>
                                  <th scope="col" data-column="night-income" className="px-2 py-2 border-r border-slate-200 bg-indigo-50/5 text-right">Omzet</th>
                                  <th scope="col" data-column="total" className="bg-emerald-50/5 text-right">Harian</th>
                                </tr>
                              </thead>
                              <tbody className="text-[10px] md:text-[11px] font-bold text-slate-700 divide-y divide-slate-100">
                                {(() => {
                                  const grouped: Record<string, Record<string, { pagi: { val: number, kasir: string }, malam: { val: number, kasir: string } }>> = {};
                                  
                                  shifts.filter(s => {
                                    const branchMatch = !adminSalesBranchFilter || s.branchId === adminSalesBranchFilter;
                                    let dateMatch = true;
                                    if (reportStartDate && reportEndDate) {
                                      const sDate = formatDateLocal(s.shiftDate);
                                      dateMatch = sDate >= reportStartDate && sDate <= reportEndDate;
                                    }
                                    return branchMatch && dateMatch;
                                  }).forEach(s => {
                                    const date = s.shiftDate || "N/A";
                                    const bId = s.branchId || "center";
                                    if (!grouped[date]) grouped[date] = {};
                                    if (!grouped[date][bId]) grouped[date][bId] = { pagi: { val: 0, kasir: "" }, malam: { val: 0, kasir: "" } };
                                    const sType = getShiftTypePref(s.shiftType);
                                    const sKeeper = getShiftKeeperName(s);
                                    if (sType === "Pagi") {
                                      grouped[date][bId].pagi.val += (s.totalSales || 0);
                                      grouped[date][bId].pagi.kasir = sKeeper;
                                    } else {
                                      grouped[date][bId].malam.val += (s.totalSales || 0);
                                      grouped[date][bId].malam.kasir = sKeeper;
                                    }
                                  });

                                  const sortedDates = Object.entries(grouped).sort((a,b) => b[0].localeCompare(a[0]));

                                  if (sortedDates.length === 0) {
                                    return (
                                      <tr>
                                        <td colSpan={7} className="px-6 py-20 text-center text-slate-400 uppercase tracking-widest text-[8px] md:text-[9px]">
                                          Tidak ada data ditemukan untuk periode ini
                                        </td>
                                      </tr>
                                    );
                                  }

                                  return sortedDates.map(([date, branchMap]) => {
                                    return Object.entries(branchMap).map(([bId, d], bIdx) => {
                                      const bName = branches.find(b => b.id === bId)?.name || "Pusat";
                                      const rowTotal = d.pagi.val + d.malam.val;
                                      return (
                                        <tr key={`${date}-${bId}`} className="hover:bg-slate-50 transition-colors group">
                                          <td data-column="date" className="px-3 md:px-6 py-3 md:py-4 border-r border-slate-100 text-slate-500 font-mono text-[9px] md:text-[10px]">
                                            {bIdx === 0 ? formatCompactShiftDate(date) : <span className="opacity-0">{formatCompactShiftDate(date)}</span>}
                                          </td>
                                          <td data-column="branch" className="px-3 md:px-6 py-3 md:py-4 border-r border-slate-100 uppercase tracking-tighter font-black text-slate-900 whitespace-normal break-words">
                                            {bName}
                                          </td>
                                          <td data-column="day-cashier" className="px-2 md:px-4 py-3 md:py-4 border-r border-slate-100 bg-amber-50/5 text-slate-600 whitespace-normal break-words">
                                            {d.pagi.kasir || "-"}
                                          </td>
                                          <td data-column="day-income" className="px-2 md:px-4 py-3 md:py-4 border-r border-slate-200 bg-amber-50/10 text-amber-700 text-right font-mono">
                                            {d.pagi.val > 0 ? `Rp ${d.pagi.val.toLocaleString("id-ID")}` : "-"}
                                          </td>
                                          <td data-column="night-cashier" className="px-2 md:px-4 py-3 md:py-4 border-r border-slate-100 bg-indigo-50/5 text-slate-600 whitespace-normal break-words">
                                            {d.malam.kasir || "-"}
                                          </td>
                                          <td data-column="night-income" className="px-2 md:px-4 py-3 md:py-4 border-r border-slate-200 bg-indigo-50/10 text-indigo-700 text-right font-mono">
                                            {d.malam.val > 0 ? `Rp ${d.malam.val.toLocaleString("id-ID")}` : "-"}
                                          </td>
                                          <td data-column="total" className="px-3 md:px-6 py-3 md:py-4 bg-emerald-50/20 text-slate-900 font-black text-right text-xs md:text-sm font-mono whitespace-normal">
                                            Rp {rowTotal.toLocaleString("id-ID")}
                                          </td>
                                        </tr>
                                      );
                                    });
                                  });
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
 
                  {reportSubTab !== "excel" && (
                  <>
                  {/* RIWAYAT TUTUP SHIFT (DAILY REPORTS) */}
                    <div data-report-history-card className="xl:col-span-1 border border-slate-200 bg-white rounded-2xl overflow-hidden mt-4">
                      <div data-report-history-titlebar className="p-2.5 md:p-4 border-b border-slate-200 flex items-center justify-between gap-2">
                        <div className="text-left">
                          <h3 className="text-xs md:text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-500 shrink-0" /> Riwayat Tutup Shift
                          </h3>
                          <p className="text-[8px] text-slate-400 font-bold uppercase mt-1">Pendapatan kasir vs transaksi sukses</p>
                        </div>
                        <div className="bg-blue-50 text-blue-600 px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-wider shrink-0">
                          Audit Log
                        </div>
                      </div>
                      <div data-report-history-scroll className="report-excel-scroll max-h-[500px] overflow-y-auto overflow-x-hidden">
                        <table aria-label="Riwayat tutup shift" className="admin-excel-table admin-report-history-table w-full min-w-0">
                          <thead>
                            <tr>
                              <th scope="col" data-column="time">Waktu</th>
                              <th scope="col" data-column="cashier-branch">Kasir & Cabang</th>
                              <th scope="col" data-column="system" className="text-right">Sistem</th>
                              <th scope="col" data-column="reported" className="text-right">Dilaporkan</th>
                              <th scope="col" data-column="difference" className="text-right">Selisih</th>
                              {(profile?.role === "ADMIN" || profile?.role === "AUDIT") && (
                                <th scope="col" data-column="action" className="text-center">Aksi</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {shifts
                              .filter(sh => {
                                const branchMatch = !adminSalesBranchFilter || sh.branchId === adminSalesBranchFilter;
                                let dateMatch = true;
                                if (reportStartDate && reportEndDate) {
                                  const sDate = formatDateLocal(sh.shiftDate);
                                  dateMatch = sDate >= reportStartDate && sDate <= reportEndDate;
                                }
                                return branchMatch && dateMatch;
                              })
                              .map((sh) => {
                                const expected = Number(sh.totalSales || 0);
                                const reportedIncome = sh.reportedIncome == null ? null : Number(sh.reportedIncome);
                                const diff = sh.difference == null ? null : Number(sh.difference);
                                
                                return (
                                  <tr key={sh.id}>
                                    <td data-column="time" className="font-black text-slate-900">
                                      <p className="border-b border-slate-200/70 pb-1 mb-1">{formatCompactShiftDate(sh.shiftDate)}</p>
                                      <p className="text-[9px] font-mono text-slate-400">
                                        {new Date(sh.closeTime).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                                      </p>
                                    </td>
                                    <td data-column="cashier-branch">
                                      <p className="text-[10px] font-black text-slate-800 uppercase leading-tight">
                                        {sh.shiftType && sh.shiftType.includes(" - ") ? sh.shiftType.split(" - ")[1] : sh.cashier?.name || "Kasir"}
                                      </p>
                                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                        {branches.find(b => b.id === sh.branchId)?.name || "Pusat"} | {sh.shiftType && sh.shiftType.includes(" - ") ? sh.shiftType.split(" - ")[0] : sh.shiftType}
                                      </p>
                                    </td>
                                    <td data-column="system" className="text-right font-black text-slate-500">
                                      Rp {expected.toLocaleString("id-ID")}
                                    </td>
                                    <td data-column="reported" className="text-right font-black text-slate-900">
                                      {reportedIncome === null ? "—" : `Rp ${reportedIncome.toLocaleString("id-ID")}`}
                                    </td>
                                    <td data-column="difference" className="text-right">
                                      <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${
                                        diff === null ? "text-slate-400" : diff === 0 ? "bg-emerald-50 text-emerald-600" : diff > 0 ? "bg-blue-50 text-blue-600" : "bg-rose-50 text-rose-600"
                                      }`}>
                                        {diff === null ? "—" : `${diff > 0 ? "+" : ""}${diff.toLocaleString("id-ID")}`}
                                      </span>
                                    </td>
                                    {(profile?.role === "ADMIN" || profile?.role === "AUDIT") && (
                                      <td data-column="action" className="text-center">
                                        <button
                                          onClick={async () => {
                                            if (await triggerConfirm("Hapus riwayat shift ini? Tindakan ini tidak dapat dibatalkan.")) {
                                              try {
                                                await fetch(`/api/shifts/${sh.id}`, {
                                                  method: 'DELETE',
                                                  headers: {
                                                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                                                  }
                                                });
                                                const sData = await api.getShifts(buildShiftReadQueryParams(
                                                  true,
                                                  effectiveReadBranch,
                                                  reportStartDate,
                                                  reportEndDate,
                                                ));
                                                setShifts(sData);
                                              } catch (err) {
                                                alert("Gagal menghapus: " + err);
                                              }
                                            }
                                          }}
                                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                          title="Hapus duplikat/salah"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            {shifts.length === 0 && (
                              <tr>
                                <td colSpan={(profile?.role === "ADMIN" || profile?.role === "AUDIT") ? 6 : 5} className="text-center text-slate-400 font-bold uppercase tracking-widest opacity-70 italic">Belum ada laporan tutup shift</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                  )}
                  </div>
                )}

            {activeMenu === "settings" && profile?.role === "ADMIN" && (
              <div data-ui-screen="settings" className="ui-screen-settings flex-1 p-4 md:p-4 md:p-6 overflow-y-auto">
                <div data-settings-content className="max-w-3xl mx-auto space-y-6 text-left pb-20">
                  {/* Card Configuration Switch */}
                  <div data-ui-panel="global-access" className="bg-white p-4 md:p-7 rounded-2xl md:rounded-[32px]">
                    <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.2em] mb-4 md:mb-8 flex items-center gap-2">
                      <Settings className="w-4 h-4 text-emerald-500" />
                      Fitur & Hak Akses Global
                    </h3>
                    <div className="bg-slate-50 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-black text-slate-700 uppercase tracking-tight">
                          Kasir Input Stok Cabang
                        </p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 opacity-70">
                          Izinkan kasir melakukan input stok masuk mandiri di
                          cabang mereka.
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const newVal = !appConfig.allowCashierStockInput;
                            await fetch("/api/config", {
                              method: "PATCH",
                              headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${localStorage.getItem(
                                  "token",
                                )}`,
                              },
                              body: JSON.stringify({
                                allowCashierStockInput: newVal,
                              }),
                            });
                            setAppConfig((prev: any) => ({
                              ...prev,
                              allowCashierStockInput: newVal,
                            }));
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                        aria-label="Izinkan kasir input stok cabang"
                        aria-pressed={appConfig.allowCashierStockInput}
                        className="relative flex h-11 w-12 shrink-0 items-center justify-center rounded-full"
                      >
                        <div
                          className={`absolute inset-x-1 top-1/2 h-6 -translate-y-1/2 rounded-full transition-colors ${appConfig.allowCashierStockInput ? "bg-slate-700" : "bg-slate-300"}`}
                        />
                        <span
                          className={`absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform ${appConfig.allowCashierStockInput ? "translate-x-4" : "translate-x-0"}`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Card Add Branch */}
                  <div data-ui-panel="branch-registration" className="bg-white p-3 md:p-4 rounded-2xl border border-slate-200">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-3 mb-4 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-600" /> Registrasi
                      Cabang Baru
                    </h3>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        placeholder="Nama cabang baru"
                        value={newBranch}
                        onChange={(e) => setNewBranch(e.target.value)}
                        className="flex-1 bg-slate-50 rounded-xl px-4 py-2 text-sm font-medium border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
                      />
                      <button
                        onClick={handleAddBranch}
                        disabled={!newBranch.trim()}
                        className="bg-slate-800 disabled:opacity-50 text-white px-4 md:px-6 py-2 rounded-xl text-[11px] font-bold uppercase tracking-widest shrink-0 transition-all hover:bg-slate-900 shadow-sm disabled:shadow-none"
                      >
                        Simpan Cabang
                      </button>
                    </div>
                  </div>

                  {/* List Branches */}
                  <div data-ui-panel="branch-list" className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-200 bg-slate-50">
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">
                        Daftar Cabang Aktif
                      </h3>
                    </div>
                    <div className="divide-y divide-slate-200">
                      {branches.length === 0 ? (
                        <p className="p-4 text-xs text-center text-slate-500 font-medium">
                          Belum ada cabang terdaftar.
                        </p>
                      ) : null}
                      {branches
                        .slice()
                        .sort((a, b) => naturalSort(a.name, b.name))
                        .map((b, idx) => (
                          <div
                            key={b.id}
                            className="p-3 flex items-center gap-3 hover:bg-slate-50/70 transition-colors"
                          >
                            {/* Nomor */}
                            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs shrink-0 border border-blue-100">
                              {idx + 1}
                            </div>
                            {/* Nama + Toggle */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <h4 className="text-xs font-black text-slate-800 truncate">{b.name}</h4>
                                <button
                                  onClick={async () => {
                                    const newName = await triggerPrompt(`Ubah Nama Cabang "${b.name}" menjadi:`, b.name);
                                    if (newName === null) return;
                                    const trimmed = newName.trim();
                                    if (!trimmed) return alert("Nama cabang tidak boleh kosong!");
                                    try {
                                      const res = await fetch(`/api/branches/${b.id}`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
                                        body: JSON.stringify({ name: trimmed }),
                                      });
                                      if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.error || "Gagal mengubah nama cabang"); }
                                      const bData = await api.getBranches();
                                      setBranches(bData.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")));
                                    } catch (err: any) { alert(err.message || "Gagal mengubah nama cabang"); }
                                  }}
                                  className="p-0.5 text-slate-400 hover:text-slate-800 transition-colors shrink-0"
                                  title="Ubah Nama"
                                >
                                  <Edit className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <button
                                  onClick={async () => {
                                    try {
                                      const newVal = !b.allowEmployeeInput;
                                      await fetch(`/api/branches/${b.id}`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
                                        body: JSON.stringify({ allowEmployeeInput: newVal }),
                                      });
                                      const bData = await api.getBranches();
                                      setBranches(bData.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")));
                                    } catch (e) { console.error(e); }
                                  }}
                                  className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tight transition-all ${b.allowEmployeeInput !== false ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
                                >
                                  {b.allowEmployeeInput !== false ? "Input ✓" : "Input Off"}
                                </button>
                                <button
                                  onClick={() => toggleBranchShoppingHidden(b.id)}
                                  className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tight transition-all ${!hiddenShoppingBranchIds.includes(b.id) ? "bg-slate-100 text-slate-700 border border-slate-200" : "bg-rose-50 text-rose-600 border border-rose-100"}`}
                                  title={!hiddenShoppingBranchIds.includes(b.id) ? "Tampil di Daftar Belanja" : "Disembunyikan dari Daftar Belanja"}
                                >
                                  {!hiddenShoppingBranchIds.includes(b.id) ? "Belanja ✓" : "Belanja ✗"}
                                </button>
                              </div>
                            </div>
                            {/* Hapus */}
                            <button
                              onClick={async () => {
                                if (b.id === "default-branch-id") {
                                  alert(`PERINGATAN: "${b.name}" adalah Cabang Sistem Utama bawaan (seed) yang tertaut dengan akun 'admin' and 'cashier' default.\n\nSangat disarankan untuk mengubah NAMA cabang ini di database (atau rename) daripada menghapusnya.\n\nSetiap kali web restart, Cabang Sistem Utama ini akan otomatis dibuat kembali jika tidak ada.`);
                                  return;
                                }
                                if (await triggerConfirm(`Hapus Cabang "${b.name}"?\nSemua data stok dan voucher di cabang ini akan dihapus. Data penjualan tetap tersimpan.`)) {
                                  try {
                                    const res = await fetch(`/api/branches/${b.id}`, {
                                      method: "DELETE",
                                      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
                                    });
                                    if (!res.ok) { const errData = await res.json().catch(() => ({})); throw new Error(errData.error || "Gagal menghapus cabang"); }
                                    const bData = await api.getBranches();
                                    setBranches(bData.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || "")));
                                  } catch (e: any) { alert(e.message || "Gagal menghapus cabang"); console.error(e); }
                                }
                              }}
                              className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all active:scale-90 shrink-0"
                              title="Hapus Cabang"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* --- 3. ADMIN: INVENTORY MASTER --- */}
            {activeMenu === "inventory" && profile?.role === "ADMIN" && (
              <div data-ui-screen="inventory" className="ui-screen-inventory flex-1 flex flex-col bg-white md:m-4 md:rounded-2xl overflow-hidden relative">
                {/* PRODUCT FORM MODAL */}
                {showProductForm && (
                  <div data-product-form-overlay role="presentation" className="absolute inset-0 z-[40] bg-white flex items-center justify-center p-2 pb-[env(safe-area-inset-bottom,0px)] md:z-[120] md:p-4 md:pb-4">
                    <div data-product-form-card role="dialog" aria-modal="true" aria-labelledby="product-form-title" className="bg-white rounded-2xl shadow-xl w-full max-w-2xl h-full max-h-full overflow-hidden flex flex-col min-h-0 md:h-auto md:max-h-[90dvh]">
                      <div data-product-form-header className="sticky top-0 z-10 px-3 py-3 sm:p-4 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
                        <h3 id="product-form-title" className="font-black text-slate-800 uppercase tracking-tight">
                          {editingProduct
                            ? "Ubah Master Produk"
                            : "Formulir Master Produk Baru"}
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            setShowProductForm(false);
                            resetProductForm();
                          }}
                          aria-label="Tutup formulir produk"
                          title="Tutup formulir"
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-red-600"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div data-product-form-body className="min-h-0 p-3 sm:p-4 md:p-6 overflow-y-auto overscroll-contain flex-1">
                        <form
                          onSubmit={handleSaveProduct}
                          className="space-y-4"
                          data-product-form
                        >
                          <div data-product-form-section-heading="identity" className="flex items-center gap-2.5">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[#c9aa6d]/30 bg-[#c9aa6d]/10 font-mono text-[10px] font-bold text-[#8a7040]">01</span>
                            <div className="min-w-0">
                              <h4 className="text-[12px] font-black text-slate-800">Identitas produk</h4>
                              <p className="mt-0.5 text-[9px] font-medium text-slate-400">Susun kategori dan varian agar mudah ditemukan kasir.</p>
                            </div>
                          </div>
                          <div data-product-identity className="grid grid-cols-1">
                            <div data-product-taxonomy className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div data-product-field="category">
                                <ProductCombobox
                                  label="Kategori Produk"
                                  value={prodCategory}
                                  onChange={(val) => {
                                    setProdCategory(val);
                                    setProdBrand("");
                                    setProdSubCategory("");
                                    setProdProvider("");
                                  }}
                                  options={dynamicCategories}
                                  placeholder="Ketik atau pilih Kategori"
                                />
                              </div>
                              <div data-product-field="brand">
                                <ProductCombobox
                                  label={(prodCategory === "Voucher" || prodCategory?.includes("Perdana")) ? "Pilih Provider" : "Merek (Brand)"}
                                  value={(prodCategory === "Voucher" || prodCategory?.includes("Perdana")) ? prodProvider : prodBrand}
                                  onChange={(val) => {
                                    if (prodCategory === "Voucher" || prodCategory?.includes("Perdana")) {
                                      setProdProvider(val);
                                      setProdBrand(val); // Keep brand in sync for legacy or generic checks
                                    } else {
                                      setProdBrand(val);
                                    }
                                    setProdSubCategory("");
                                  }}
                                  options={(prodCategory === "Voucher" || prodCategory?.includes("Perdana")) ? dynamicProviders : dynamicBrands}
                                  placeholder={(prodCategory === "Voucher" || prodCategory?.includes("Perdana")) ? "Pilih Provider" : "Ketik Merek"}
                                />
                              </div>
                              {(prodCategory === "Aksesoris" || prodCategory === "Handphone" || prodCategory === "Parfum") && (
                                <div data-product-field="subcategory">
                                  <ProductCombobox
                                    label={prodCategory === "Parfum" ? "Jenis Parfum" : "Model / Sub-Kategori"}
                                    value={prodSubCategory}
                                    onChange={setProdSubCategory}
                                    options={dynamicSubCategories}
                                    placeholder={prodCategory === "Parfum" ? "Pilih jenis (EDP/EDT...)" : "Ketik Model..."}
                                  />
                                </div>
                              )}
                              {prodCategory === "Parfum" && (
                                <div data-product-field="size">
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                    Ukuran / Volume
                                  </label>
                                  <input
                                    type="text"
                                    value={prodSize}
                                    onChange={(e) => setProdSize(e.target.value)}
                                    placeholder="Cth: 30ml / 100ml"
                                    className="w-full border border-slate-300 rounded-2xl px-4 py-3 text-sm focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none font-bold transition-all shadow-sm"
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                            <div data-product-details className="grid grid-cols-1 md:grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                {prodCategory === "Voucher" || prodCategory?.includes("Perdana")
                                  ? "Nominal / Kuota"
                                  : prodCategory === "Handphone"
                                    ? "Varian (RAM / Storage / Warna)"
                                    : prodCategory === "Parfum"
                                      ? "Aroma / Varian"
                                      : prodCategory === "Aksesoris"
                                        ? "Varian / Tipe"
                                        : "Nama Produk"}{" "}
                                <span className="text-red-500 font-black">*</span>
                                {(prodCategory === "Voucher" || prodCategory?.includes("Perdana")) && (prodProvider || prodBrand) && (
                                  <span className="ml-2 text-[8px] font-black text-emerald-600 normal-case tracking-normal">
                                    — provider <span className="text-emerald-700">{prodProvider || prodBrand}</span> sudah otomatis
                                  </span>
                                )}
                              </label>
                              <input
                                type="text"
                                placeholder={
                                  prodCategory === "Voucher" || prodCategory?.includes("Perdana")
                                    ? "Cth: 10GB 30 Hari  atau  25.000"
                                    : prodCategory === "Handphone"
                                      ? "Cth: 8/256 Hitam"
                                      : prodCategory === "Parfum"
                                        ? "Cth: Farhampton"
                                        : prodCategory === "Aksesoris"
                                          ? "Cth: Type-C 2A Putih"
                                          : "Cth: nama / varian produk"
                                }
                                value={prodType}
                                onChange={(e) => setProdType(e.target.value)}
                                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                                required
                              />
                              <div data-product-name-preview className="mt-2 flex items-start gap-2 rounded-2xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 px-3 py-2">
                                <Sparkles className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-[8px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-widest leading-none">
                                    Nama Produk Tersimpan
                                  </p>
                                  <p className="text-[11px] font-black text-slate-700 dark:text-slate-200 mt-1 break-words leading-snug">
                                    {buildProductName() || "—"}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1.5 flex justify-between">
                                <span>Barcode / SN Master Produk</span>{" "}
                                <span className="text-[9px] text-blue-500 font-black lowercase">
                                  (Kosongi untuk otomatis)
                                </span>
                              </label>
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Scan atau Kosongi"
                                  value={prodBarcode}
                                  onChange={(e) =>
                                    setProdBarcode(e.target.value)
                                  }
                                  readOnly={!!prodBarcode}
                                  className={`w-full border border-blue-400 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono tracking-widest pr-20 ${prodBarcode ? "bg-slate-100 text-slate-500 cursor-not-allowed opacity-80" : "bg-blue-50 focus:bg-white"}`}
                                />
                                <div className="absolute right-2 top-1.5 flex items-center gap-1">
                                  {!prodBarcode ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setProdBarcode(generateAutoBarcode())
                                      }
                                      title="Generate Otomatis"
                                      className="p-1.5 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors"
                                    >
                                      <Sparkles className="w-4 h-4" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setProdBarcode("")}
                                      title="Hapus Barkod"
                                      className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowScanner(true);
                                      setScannerCallback(
                                        () => (code: string) =>
                                          setProdBarcode(code),
                                      );
                                    }}
                                    title="Buka Kamera"
                                    className="p-1.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors"
                                  >
                                    <Camera className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>

                          </div>

                          <div data-product-description>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                              Deskripsi Operasional Barang (Opsional)
                            </label>
                            <textarea
                              placeholder="Bisa disi catatan klaim garansi produk, spesifikasi teknis..."
                              value={prodDesc}
                              onChange={(e) => setProdDesc(e.target.value)}
                              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                              rows={2}
                            />
                          </div>

                          <details data-product-visibility>
                            <summary data-product-visibility-summary>
                              <Eye className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                              <span>Visibilitas cabang</span>
                              <span data-product-visibility-status>
                                {prodVisibleBranchIds === "*" ? "Semua cabang" : "Pilih cabang"}
                              </span>
                            </summary>
                            <div data-product-visibility-content>
                              <div className="space-y-2">
                                <label className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-slate-200 cursor-pointer hover:border-blue-300 transition-all group">
                                  <input
                                    type="checkbox"
                                    checked={prodVisibleBranchIds === "*"}
                                    onChange={(e) => setProdVisibleBranchIds(e.target.checked ? "*" : "")}
                                    className="w-5 h-5 rounded-lg text-blue-600 border-slate-300 focus:ring-blue-500"
                                  />
                                  <span className="text-[11px] font-black uppercase text-slate-600 group-hover:text-blue-700">Semua Cabang Toko</span>
                                </label>

                                {prodVisibleBranchIds !== "*" && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                                    {branches.map(b => {
                                      const ids = prodVisibleBranchIds ? prodVisibleBranchIds.split(",") : [];
                                      const isChecked = ids.includes(b.id);
                                      return (
                                        <label key={b.id} className={`flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${isChecked ? "bg-blue-50 border-blue-200" : "bg-white border-slate-200 hover:border-slate-300"}`}>
                                          <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={(e) => {
                                              const newIds = e.target.checked
                                                ? [...ids, b.id]
                                                : ids.filter(id => id !== b.id);
                                              setProdVisibleBranchIds(newIds.join(","));
                                            }}
                                            className="w-4 h-4 rounded text-blue-600 border-slate-300"
                                          />
                                          <span className={`text-[10px] font-bold uppercase truncate ${isChecked ? "text-blue-700" : "text-slate-500"}`}>{b.name}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </details>

                          <div data-product-form-section-heading="pricing" className="flex items-center gap-2.5 pt-1">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[#c9aa6d]/30 bg-[#c9aa6d]/10 font-mono text-[10px] font-bold text-[#8a7040]">02</span>
                            <div className="min-w-0">
                              <h4 className="text-[12px] font-black text-slate-800">Harga &amp; pengendalian</h4>
                              <p className="mt-0.5 text-[9px] font-medium text-slate-400">Nilai jual dan laba terlihat dalam satu area.</p>
                            </div>
                          </div>
                          <div data-product-pricing className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 rounded border border-slate-200 shadow-inner">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                Harga Modal (Rp)
                              </label>
                              <input
                                type="number"
                                placeholder="HPP"
                                value={prodCapital}
                                onChange={(e) => setProdCapital(e.target.value)}
                                className="w-full border border-slate-300 rounded px-2 py-2 text-sm font-bold text-slate-600 focus:ring-2 focus:ring-blue-500"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                Harga Jual (Rp)
                              </label>
                              <input
                                type="number"
                                placeholder="Jual"
                                value={prodSell}
                                onChange={(e) => setProdSell(e.target.value)}
                                className="w-full border border-slate-300 rounded px-2 py-2 text-sm font-bold text-blue-600 focus:ring-2 focus:ring-blue-500"
                                required
                              />
                            </div>
                            <div className="relative">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                Harga Promo (Rp)
                              </label>
                              <input
                                type="number"
                                placeholder="Diskon"
                                value={prodDiscount}
                                onChange={(e) =>
                                  setProdDiscount(e.target.value)
                                }
                                className="w-full border border-slate-300 rounded px-2 py-2 text-sm font-bold text-emerald-600 focus:ring-2 focus:ring-emerald-500"
                              />
                            </div>
                            <div className="relative">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 text-blue-600">
                                Bonus Kasir / Item (Rp)
                              </label>
                              <input
                                type="number"
                                placeholder="Bonus"
                                value={prodCommission}
                                onChange={(e) =>
                                  setProdCommission(e.target.value)
                                }
                                className="w-full border border-blue-200 bg-blue-50 rounded px-2 py-2 text-sm font-bold text-blue-700 focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            
                            {/* PROFIT ANALYSIS PREVIEW */}
                            <div data-product-profit-preview className="col-span-full mt-2 p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between shadow-sm">
                              <div className="text-left">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1 text-left">ESTIMASI LABA BERSIH</p>
                                <div className="flex items-baseline gap-2">
                                  <h4 className={`text-lg font-black tracking-tighter ${(Number(prodSell) - Number(prodCapital)) > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                    Rp {(Number(prodSell) - Number(prodCapital)).toLocaleString('id-ID')}
                                  </h4>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ (Number(prodSell) - Number(prodCapital)) > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                                    {prodSell && Number(prodSell) > 0 ? (((Number(prodSell) - Number(prodCapital)) / Number(prodSell)) * 100).toFixed(1) : 0}%
                                  </span>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1 text-right">VALUE MODAL</p>
                                <p className="text-xs font-bold text-slate-500 tracking-tight text-right">
                                  {prodSell && Number(prodSell) > 0 ? ((Number(prodCapital) / Number(prodSell)) * 100).toFixed(0) : 0}% DARI HARGA JUAL
                                </p>
                              </div>
                            </div>

                            <div data-product-extra-fields className="grid grid-cols-1 sm:grid-cols-2 gap-4 col-span-2 mt-4 pt-4 border-t border-slate-200">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex justify-between">
                                  <span>Stok Minimal Aman</span>
                                  <span className="text-[9px] text-amber-500 font-black lowercase">
                                    peringatan
                                  </span>
                                </label>
                                <input
                                  type="number"
                                  value={prodMinStock}
                                  onChange={(e) =>
                                    setProdMinStock(e.target.value)
                                  }
                                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              {(prodCategory === "Voucher" ||
                                prodCategory?.includes("Perdana")) && (
                                <div>
                                  <label className="block text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1.5">
                                    Masa Aktif / Kadaluarsa
                                  </label>
                                  <input
                                    type="date"
                                    value={prodExpiredAt}
                                    onChange={(e) =>
                                      setProdExpiredAt(e.target.value)
                                    }
                                    className="w-full border border-blue-200 bg-blue-50 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          <div data-product-form-actions className="sticky bottom-0 z-10 -mx-3 sm:-mx-4 md:-mx-6 mt-4 grid grid-cols-1 gap-2 border-t border-slate-200 bg-white/95 px-3 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] backdrop-blur sm:-mx-4 sm:items-center sm:px-4 md:px-6">
                            <div className="grid grid-cols-[minmax(5.5rem,0.8fr)_minmax(0,1.5fr)] gap-2 sm:flex sm:justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowProductForm(false);
                                  resetProductForm();
                                }}
                                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                              >
                                Batal
                              </button>
                              <button
                                type="submit"
                                className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-blue-700 px-3 text-[10px] font-black uppercase tracking-normal text-white hover:bg-blue-800 active:scale-[0.99] transition-all sm:min-w-52 sm:px-4 sm:text-[11px]"
                              >
                                Simpan &amp; publikasikan
                                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        </form>
                      </div>
                    </div>
                  </div>
                )}

                {/* USER FORM MODAL */ }
                {/* MOVED TO TOP LEVEL */ }

                <div data-inventory-toolbar className="p-3 md:p-4 border-b border-slate-200 bg-slate-50 flex flex-col gap-3 shrink-0">
                  <div className="flex flex-col sm:flex-row gap-3 justify-between items-center w-full">
                    <div className="relative w-full max-w-sm">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Cari master barang..."
                        className="w-full bg-white border border-slate-300 rounded pl-9 pr-4 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          if (e.target.value) setDrillPath([]);
                        }}
                      />
                    </div>
                    <button
                      onClick={() => {
                        resetProductForm();
                        setShowProductForm(true);
                      }}
                      className="bg-blue-600 text-white px-4 py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 shrink-0 w-full sm:w-auto self-end sm:self-center shadow-[0_0_22px_3px_rgba(37,99,235,0.6)]"
                    >
                      <Plus className="w-3 h-3 inline mr-1" /> Tambah Master
                      Produk
                    </button>
                  </div>

                </div>
                {searchTerm ? (
                <div data-inventory-search-results className="flex-1 overflow-x-auto bg-slate-50">
                  <table data-inventory-search-table aria-label="Hasil pencarian master barang" className={`w-full text-left border-collapse ${(searchTerm || drillPath.length >= 3 || (drillPath.length === 2 && drillPath[0] !== "Aksesoris")) ? "min-w-[700px]" : ""}`}>
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 z-10">
                      {(searchTerm || drillPath.length >= 3 || (drillPath.length === 2 && drillPath[0] !== "Aksesoris")) ? (
                      <tr>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          Item Master
                        </th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          Kategori & Spek
                        </th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">
                          Modal Pokok
                        </th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">
                          Harga Jual
                        </th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
                          Visibilitas
                        </th>
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
                          Aksi
                        </th>
                      </tr>
                      ) : (
                      <tr>
                        <th className="px-7 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          Item Master
                        </th>
                        <th className="px-7 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">
                          Jumlah
                        </th>
                      </tr>
                      )}
                    </thead>
                    <tbody className={`text-sm ${(searchTerm || drillPath.length >= 3 || (drillPath.length === 2 && drillPath[0] !== "Aksesoris")) ? "divide-y divide-slate-100" : ""}`}>
                      {(() => {
                        const filtered = products.filter(
                          (p) =>
                            p &&
                            (!searchTerm ||
                              (p.name || "")
                                .toLowerCase()
                                .includes(searchTerm.toLowerCase()) ||
                              (p.barcode || "").includes(searchTerm)),
                        );
                        const isAksesoris = drillPath[0] === "Aksesoris";
                        const isEndLevel =
                          searchTerm ||
                          drillPath.length >= 3 ||
                          (drillPath.length === 2 && !isAksesoris);

                        if (isEndLevel) {
                          const finalFiltered = !searchTerm
                            ? filtered.filter((p) => {
                                if (drillPath.length === 2) {
                                  const field =
                                    drillPath[0] === "Voucher" ||
                                    drillPath[0].includes("Perdana")
                                      ? "provider"
                                      : "brand";
                                  return (
                                    (p.category || "Lain-lain") === drillPath[0] &&
                                    (p[field] || p.brand || p.provider || drillPath[0]) === drillPath[1]
                                  );
                                }
                                if (drillPath.length === 3) {
                                  return (
                                    (p.category || "Lain-lain") === drillPath[0] &&
                                    (p.brand || p.provider || drillPath[0]) === drillPath[1] &&
                                    (p.subCategory || drillPath[0]) === drillPath[2]
                                  );
                                }
                                return true;
                              })
                              .sort((a,b) => {
                                const getPrice = (p: any) => p.discountPrice > 0 ? p.discountPrice : p.sellingPrice;
                                return getPrice(a) - getPrice(b);
                              })
                            : filtered.sort((a,b) => {
                                const getPrice = (p: any) => p.discountPrice > 0 ? p.discountPrice : p.sellingPrice;
                                return getPrice(a) - getPrice(b);
                              });

                          return finalFiltered.map((p) => (
                            <tr key={p.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3">
                                <p className="font-bold text-slate-800">
                                  {getProductName(p)}
                                </p>
                                <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                                  {p.barcode}
                                </p>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1 items-start">
                                  <span
                                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border ${p.category === "Voucher" || p.category?.includes("Perdana") ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-blue-50 border-blue-200 text-blue-700"}`}
                                  >
                                    {p.category === "Voucher" ||
                                    p.category?.includes("Perdana") ? (
                                      <Wifi className="w-3 h-3" />
                                    ) : (
                                      <Smartphone className="w-3 h-3" />
                                    )}
                                    {p.category}{" "}
                                    {p.brand
                                      ? `• ${p.brand}`
                                      : p.provider
                                        ? `• ${p.provider}`
                                        : ""}
                                  </span>
                                  {p.description && (
                                    <p className="text-[9px] text-slate-400 font-medium max-w-[200px] truncate">
                                      {p.description}
                                    </p>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-slate-500 text-xs">
                                Rp {p.purchasePrice?.toLocaleString("id-ID")}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="font-bold text-blue-600">
                                  Rp {p.sellingPrice?.toLocaleString("id-ID")}
                                </span>
                                {p.discountPrice > 0 && (
                                  <p className="text-[9px] font-bold text-emerald-500 mt-1 uppercase">
                                    Promo: Rp{" "}
                                    {p.discountPrice.toLocaleString("id-ID")}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {p.visibleBranchIds === "*" ? (
                                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase px-2 py-1 rounded-full border border-emerald-100">
                                    <CheckCircle2 className="w-3 h-3" /> Semua
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 text-[9px] font-black uppercase px-2 py-1 rounded-full border border-amber-100" title={p.visibleBranchIds}>
                                    <MapPin className="w-3 h-3" /> {p.visibleBranchIds?.split(",").length} Cabang
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => startEditing(p)}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Ubah"
                                  >
                                    <Settings className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleDeleteProduct(p.id, p.name)
                                    }
                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Hapus"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ));
                        }

                        let groups: any = {};
                        if (drillPath.length === 0) {
                          groups = filtered.reduce((acc: any, p) => {
                            const val = p.category && p.category !== "UMUM" && p.category !== "LAINNYA" ? p.category : "Lain-lain";
                            if (!acc[val]) acc[val] = [];
                            acc[val].push(p);
                            return acc;
                          }, {});
                        } else if (drillPath.length === 1) {
                          const cat = drillPath[0];
                          const field =
                            cat === "Voucher" || cat.includes("Perdana")
                              ? "provider"
                              : "brand";
                          groups = filtered
                            .filter((p) => (p.category || "Lain-lain") === cat)
                            .reduce((acc: any, p) => {
                              const val = p[field] || p.brand || p.provider || cat;
                              if (!acc[val]) acc[val] = [];
                              acc[val].push(p);
                              return acc;
                            }, {});
                        } else if (drillPath.length === 2 && isAksesoris) {
                          const [cat, brand] = drillPath;
                          groups = filtered
                            .filter(
                              (p) =>
                                (p.category || "Lain-lain") === cat &&
                                (p.brand || p.provider || cat) === brand,
                            )
                            .reduce((acc: any, p) => {
                              const val = p.subCategory || cat;
                              if (!acc[val]) acc[val] = [];
                              acc[val].push(p);
                              return acc;
                            }, {});
                        }

                        return Object.entries(groups).map(
                          ([groupName, items]: [any, any]) => (
                            <tr
                              key={groupName}
                              className="cursor-pointer group"
                              onClick={() =>
                                setDrillPath([...drillPath, groupName])
                              }
                            >
                              <td colSpan={2} className="px-3 md:px-4 py-2">
                                <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4 transition-all shadow-[6px_6px_14px_#b8c2d0,-6px_-6px_14px_#ffffff] dark:shadow-[6px_6px_14px_#1c1e24,-6px_-6px_14px_#34373f] group-hover:shadow-[8px_8px_18px_#b3bdcc,-8px_-8px_18px_#ffffff] dark:group-hover:shadow-[8px_8px_18px_#17191f,-8px_-8px_18px_#3a3e48]">
                                  <div
                                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-slate-50 transition-all group-hover:scale-105 ${drillPath.length === 0 ? "text-blue-600 shadow-[0_0_18px_2px_rgba(59,130,246,0.55),4px_4px_9px_#b8c2d0,-4px_-4px_9px_#ffffff] dark:shadow-[0_0_18px_2px_rgba(59,130,246,0.55),4px_4px_9px_#1c1e24,-4px_-4px_9px_#34373f]" : drillPath.length === 1 ? "text-emerald-600 shadow-[0_0_18px_2px_rgba(16,185,129,0.55),4px_4px_9px_#b8c2d0,-4px_-4px_9px_#ffffff] dark:shadow-[0_0_18px_2px_rgba(16,185,129,0.55),4px_4px_9px_#1c1e24,-4px_-4px_9px_#34373f]" : "text-purple-600 shadow-[0_0_18px_2px_rgba(168,85,247,0.55),4px_4px_9px_#b8c2d0,-4px_-4px_9px_#ffffff] dark:shadow-[0_0_18px_2px_rgba(168,85,247,0.55),4px_4px_9px_#1c1e24,-4px_-4px_9px_#34373f]"}`}
                                  >
                                    {drillPath.length === 0 ? (
                                      <LayoutList className="w-6 h-6" />
                                    ) : drillPath.length === 1 ? (
                                      <Store className="w-6 h-6" />
                                    ) : (
                                      <PackagePlus className="w-6 h-6" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">
                                      {drillPath.length === 0
                                        ? "Kategori Utama"
                                        : drillPath.length === 1
                                          ? "Merek / Provider"
                                          : "Sub-Kategori / Tipe"}
                                    </p>
                                    <p className="text-sm md:text-base font-black text-slate-800 uppercase tracking-tight truncate">
                                      {groupName}
                                    </p>
                                  </div>
                                  <div className="flex flex-col items-end gap-1 shrink-0">
                                    <span className="px-3 py-1 rounded-full bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-widest shadow-[inset_4px_4px_8px_#b8c2d0,inset_-4px_-4px_8px_#ffffff] dark:shadow-[inset_4px_4px_8px_#16181d,inset_-4px_-4px_8px_#34373f]">
                                      {items.length} Macam
                                    </span>
                                    <div className="flex items-center gap-1 text-blue-600 text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all">
                                      LIHAT DETAIL{" "}
                                      <ArrowRightLeft className="w-3 h-3" />
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ),
                        );
                      })()}
                    </tbody>
                  </table>
                  {hasMoreProducts && (
                    <div className="p-4 bg-slate-50 flex justify-center border-t border-slate-100">
                      <button 
                        onClick={loadMoreProducts}
                        className="px-6 py-2 bg-white text-blue-600 font-black text-[10px] uppercase tracking-widest rounded-lg border border-slate-200 shadow-sm hover:bg-blue-50 transition-all flex items-center gap-2"
                      >
                        Muat Lebih Banyak Produk...
                      </button>
                    </div>
                  )}
                </div>
                ) : (
                  <MasterProductCatalog
                    products={products}
                    searchTerm=""
                    getProductName={getProductName}
                    onEdit={startEditing}
                    onDelete={handleDeleteProduct}
                    hasMoreProducts={hasMoreProducts}
                    onLoadMore={loadMoreProducts}
                  />
                )}
              </div>
            )}

            {/* --- 4. ADMIN: STOK PER CABANG --- */}
            {activeMenu === "branch_stocks" && profile?.role === "ADMIN" && (
              <div data-ui-screen="branch-stocks" className="ui-screen-branch-stocks flex-1 p-4 md:p-8 overflow-y-auto w-full bg-slate-50 content-fade">
                <div data-stock-toolbar className="flex flex-col md:flex-row md:items-end justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-xl md:text-3xl font-black text-slate-900 tracking-tight">
                      Laporan Stok per Cabang
                    </h2>
                    <p className="text-slate-500 font-medium mt-1">
                      Stok detail setiap barang di tiap lokasi cabang.
                    </p>
                  </div>
                  <div data-stock-search-box className="relative w-full md:w-80">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      data-stock-search
                      type="text"
                      placeholder="Cari Barang..."
                      className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-11 pr-4 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all outline-none shadow-sm"
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                <div data-stock-table-card className="bg-white rounded-2xl overflow-hidden border border-slate-200">
                  <div className="overflow-x-auto" data-branch-stock-matrix>
                    <table data-stock-table className="w-full min-w-0 text-left table-auto border-collapse">
                      <thead>
                        <tr data-stock-header-row>
                          <th data-column="product" className="px-2 py-2 text-[10px] font-black uppercase tracking-wide sticky left-0 z-20 border-r">
                            Master Data Produk
                          </th>
                          {branches
                            .slice()
                            .sort((a, b) => naturalSort(a.name, b.name))
                            .map((b) => (
                              <th
                                key={b.id}
                                data-column="branch-qty"
                                className="px-1 py-2 text-[9px] font-black uppercase tracking-wide text-center min-w-0 border-r"
                              >
                                {b.name}
                              </th>
                            ))}
                          <th data-column="total" className="px-1 py-2 text-[9px] font-black uppercase tracking-wide text-center">
                            Total Stok
                          </th>
                          <th data-column="action" className="px-1 py-2 text-[9px] font-black uppercase tracking-wide text-center">
                            Aksi
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-300">
                        {products
                          .filter(
                            (p) =>
                              !searchTerm ||
                              p.name
                                .toLowerCase()
                                .includes(searchTerm.toLowerCase()) ||
                              p.barcode
                                ?.toLowerCase()
                                .includes(searchTerm.toLowerCase()),
                          )
                          .map((p) => {
                            let rowTotal = 0;
                            return (
                              <tr
                                key={p.id}
                                data-stock-row
                                className="hover:bg-blue-50/30 transition-colors"
                              >
                                <td data-column="product" className="px-2 py-2 sticky left-0 border-r z-10">
                                  <div className="flex flex-col">
                                    <p data-stock-product-name className="font-bold text-slate-900 text-[11px] leading-tight mb-1">
                                      {p.name}
                                    </p>
                                    <div data-stock-product-meta className="flex flex-wrap items-center gap-1">
                                      <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                        {p.barcode}
                                      </span>
                                      {p.expiredAt && (
                                        <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 uppercase tracking-widest">
                                          Exp: {p.expiredAt}
                                        </span>
                                      )}
                                      {p.minStock > 0 && (
                                        <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 uppercase tracking-widest">
                                          Min: {p.minStock}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                {branches
                                  .slice()
                                  .sort((a, b) => naturalSort(a.name, b.name))
                                  .map((b) => {
                                    const visibleIds = p.visibleBranchIds || "*";
                                    const isProductVisibleInBranch = visibleIds === "*" || visibleIds.split(",").map((id: string) => id.trim()).includes(b.id);
                                    const qty = isProductVisibleInBranch ? getBranchStock(b.id, p.id) : 0;
                                    rowTotal += qty;
                                    const isLow = isProductVisibleInBranch && p.minStock > 0 && qty <= p.minStock;
                                    return (
                                      <td
                                        key={b.id}
                                        data-column="branch-qty"
                                        data-stock-level={!isProductVisibleInBranch ? "hidden" : isLow ? "low" : qty === 0 ? "zero" : "normal"}
                                        className={`px-2 py-3 text-center text-sm font-black font-mono border-r border-slate-200 ${
                                          !isProductVisibleInBranch 
                                            ? "text-slate-300 bg-slate-50/30 font-normal italic" 
                                            : isLow 
                                              ? "text-red-600 bg-red-50/50" 
                                              : "text-slate-600"
                                        }`}
                                      >
                                        {!isProductVisibleInBranch ? (
                                          <span className="text-[10px] opacity-40">—</span>
                                        ) : qty === 0 ? (
                                          <span className="opacity-20 text-[10px]">
                                            0
                                          </span>
                                        ) : (
                                          qty
                                        )}
                                      </td>
                                    );
                                  })}
                                <td data-column="total" className="px-1 py-2 text-center text-[11px] font-black text-blue-700 font-mono border-r">
                                  {rowTotal}
                                </td>
                                <td data-column="action" className="px-0 py-1 text-center">
                                  <button
                                    data-stock-delete
                                    onClick={() =>
                                      handleDeleteProduct(p.id, p.name)
                                    }
                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                    title="Hapus Master Produk"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* --- 5. ADMIN: DAFTAR BELANJA (LOW STOCK) --- */}
            {activeMenu === "shopping_list" && profile?.role === "ADMIN" && (
              <div data-ui-screen="shopping-list" className="ui-screen-shopping-list flex-1 p-4 md:p-8 overflow-y-auto w-full bg-slate-50 content-fade">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 text-left">
                  <div>
                    <div className="flex items-center gap-3 mb-2 text-left">
                      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner">
                        <ShoppingCart className="w-5 h-5" />
                      </div>
                      <h2 className="text-xl md:text-3xl font-black text-slate-900 tracking-tight">
                        Daftar Belanja
                      </h2>
                    </div>
                    <p className="text-slate-500 font-medium text-left">
                      Restok inventori atau buat rencana belanja per cabang.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => {
                        setIsCreatingPlan(!isCreatingPlan);
                        if (!isCreatingPlan) {
                          let itemsToDraft: any[] = products
                            .filter((p) => {
                              if (shoppingListCategory === "Aksesoris")
                                return p.category === "Aksesoris";
                              if (shoppingListCategory === "Voucher/Perdana")
                                return (
                                  p.category === "Voucher" ||
                                  p.category?.includes("Perdana")
                                );
                              return true;
                            })
                            .map((p) => ({ productId: p.id, branchQtys: {} }));
                          setPlanDraftItems(itemsToDraft);
                          setPlanDraftTitle(
                            `Belanja ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "short" })}${shoppingListCategory ? " - " + shoppingListCategory : ""}`,
                          );
                        }
                      }}
                      className={`flex items-center gap-2 px-4 md:px-6 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all ${isCreatingPlan ? "bg-slate-800 text-white" : "bg-blue-600 text-white shadow-lg shadow-blue-200 hover:bg-blue-700"}`}
                    >
                      {isCreatingPlan ? (
                        <>
                          <X className="w-4 h-4" /> Batal
                        </>
                      ) : (
                        <>
                          <PlusSquare className="w-4 h-4" /> Buat Rencana Baru
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {!isCreatingPlan ? (
                  <div className="space-y-8">
                    {/* LOW STOCK ALERTS SECTION */}
                    <div data-ui-panel="low-stock-alerts" className="bg-white rounded-[32px] overflow-hidden text-left">
                      <div className="p-4 md:p-6 border-b border-slate-100 bg-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div className="text-left">
                          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest text-left flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" /> Auto-Alert: Stok Kritis
                          </h3>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.1em] mt-1 text-left">
                            Otomatis mendeteksi barang yang perlu segera dipesan/dikirim
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <div className="hidden md:flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100">
                            <div className="w-2 h-2 bg-amber-500 rounded-full animate-ping"></div>
                            <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Sistem Memantau Real-time</span>
                          </div>
                          <CustomSelect
                            value={shoppingListBranch}
                            onChange={(v) => setShoppingListBranch(v)}
                            options={[
                              { value: "", label: "Semua Cabang" },
                              ...branches
                                .filter(
                                  (b) =>
                                    !hiddenShoppingBranchIds.includes(b.id),
                                )
                                .map((b) => ({ value: b.id, label: b.name })),
                            ]}
                            buttonClassName="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-blue-100"
                          />
                          <CustomSelect
                            value={shoppingListCategory}
                            onChange={(v) => setShoppingListCategory(v)}
                            options={[
                              { value: "", label: "Semua Kategori" },
                              { value: "Aksesoris", label: "Aksesoris" },
                              {
                                value: "Voucher/Perdana",
                                label: "Voucher & Perdana",
                              },
                            ]}
                            buttonClassName="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-[9px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                              <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] text-left">
                                Produk · Cabang
                              </th>
                              <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] text-center w-14">
                                Stok
                              </th>
                              <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] text-center w-14">
                                Min
                              </th>
                              <th className="px-2 py-2 text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] text-right w-24">
                                Aksi
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {(() => {
                              const alerts: any[] = [];
                              products.forEach((p) => {
                                if (!p.minStock || p.minStock <= 0) return;
                                if (
                                  shoppingListCategory === "Aksesoris" &&
                                  p.category !== "Aksesoris"
                                )
                                  return;
                                if (
                                  shoppingListCategory === "Voucher/Perdana" &&
                                  (p.category === "Aksesoris" ||
                                    p.category === "UMUM")
                                )
                                  return;
                                branches.forEach((b) => {
                                  if (hiddenShoppingBranchIds.includes(b.id)) return;
                                  if (
                                    shoppingListBranch &&
                                    b.id !== shoppingListBranch
                                  )
                                    return;
                                  // Check product visibility for this branch
                                  const visibleIds = p.visibleBranchIds || "*";
                                  const isProductVisibleInBranch = visibleIds === "*" || visibleIds.split(",").map((id: string) => id.trim()).includes(b.id);
                                  if (!isProductVisibleInBranch) return;

                                  const qty = getBranchStock(b.id, p.id);
                                  if (qty <= p.minStock) {
                                    alerts.push({ product: p, branch: b, qty });
                                  }
                                });
                              });
                              if (alerts.length === 0) {
                                return (
                                  <tr>
                                    <td
                                      colSpan={4}
                                      className="px-3 py-10 text-center text-slate-400"
                                    >
                                      <div className="flex flex-col items-center gap-3">
                                        <div className="w-10 h-10 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center">
                                          <CheckCircle2 className="w-5 h-5" />
                                        </div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic text-center">
                                          Semua stok aman terpantau
                                        </p>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              }
                              return alerts.map((a, idx) => (
                                <tr
                                  key={`${a.product.id}-${a.branch.id}`}
                                  className="hover:bg-slate-50/50 transition-colors group"
                                >
                                  <td className="px-3 py-2 text-left">
                                    <p className="font-bold text-slate-800 text-xs tracking-tight leading-snug">
                                      {a.product.name}
                                    </p>
                                    <p className="text-[8.5px] text-slate-400 font-bold uppercase tracking-wide mt-0.5 flex items-center gap-1.5">
                                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[8px] font-black">{a.branch.name}</span>
                                      <span className="text-slate-300">·</span>
                                      <span>{a.product.category}</span>
                                    </p>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <p className={`font-mono font-black text-sm leading-none ${a.qty === 0 ? "text-red-500" : "text-amber-500"}`}>
                                      {a.qty}
                                    </p>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <p className="font-mono font-bold text-slate-400 text-xs leading-none">
                                      {a.product.minStock}
                                    </p>
                                  </td>
                                  <td className="px-2 py-2 text-right">
                                    <button
                                      onClick={() => {
                                        setIsCreatingPlan(true);
                                        setPlanDraftTitle(
                                          `Restok ${a.branch.name}`,
                                        );
                                        setPlanDraftItems([
                                          {
                                            productId: a.product.id,
                                            branchQtys: {
                                              [a.branch.id]: (
                                                a.product.minStock * 2
                                              ).toString(),
                                            },
                                          },
                                        ]);
                                      }}
                                      className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-[8px] font-black uppercase tracking-wider hover:bg-blue-600 hover:text-white transition-all whitespace-nowrap"
                                    >
                                      + Rencana
                                    </button>
                                  </td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* COMPLETED PLANS HISTORY */}
                    <div data-shopping-plans className="grid grid-cols-1 md:grid-cols-1 sm:grid-cols-2 gap-6">
                      {shoppingPlans.map((plan) => (
                        <div
                          key={plan.id}
                          className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 p-4 md:p-6 shadow-sm hover:shadow-md transition-all text-left group"
                        >
                          <div className="flex justify-between items-start mb-4 text-left">
                            <div className="text-left">
                              <h4 className="font-black text-slate-800 text-lg tracking-tight mb-1 text-left">
                                {plan.title}
                              </h4>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-2 text-left">
                                <Clock className="w-3 h-3" />{" "}
                                {new Date(plan.createdAt).toLocaleDateString(
                                  "id-ID",
                                  {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                  },
                                )}
                              </p>
                            </div>
                            <span
                              className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${plan.status === "COMPLETED" ? "bg-emerald-50 text-emerald-600" : plan.status === "SENT" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"}`}
                            >
                              {plan.status}
                            </span>
                          </div>
                          <div className="space-y-2 mb-6">
                            {(plan.items || [])
                              .slice(0, 3)
                              .map((it: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="flex justify-between items-center text-xs"
                                >
                                  <span className="text-slate-600 truncate max-w-[200px] text-left">
                                    {products.find((p) => p.id === it.productId)
                                      ?.name || "Unknown Product"}
                                  </span>
                                  <span className="font-mono font-black text-slate-400">
                                    ×
                                    {Object.values(
                                      (it.branchQtys || {}) as {
                                        [s: string]: string;
                                      },
                                    ).reduce(
                                      (s, v) => s + parseInt(v || "0"),
                                      0,
                                    )}
                                  </span>
                                </div>
                              ))}
                            {(plan.items || []).length > 3 && (
                              <p className="text-[10px] text-slate-400 font-bold text-center">
                                +{(plan.items || []).length - 3} item lainnya...
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const msg = generateWhatsAppMessage(
                                  plan.items || [],
                                );
                                window.open(
                                  `https://wa.me/?text=${encodeURIComponent(msg)}`,
                                  "_blank",
                                );
                              }}
                              className="flex-1 py-3 bg-emerald-50 text-emerald-600 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-2"
                            >
                              <Smartphone className="w-3.5 h-3.5" /> Kirim WA
                            </button>
                            <button
                              onClick={async () => {
                                if (await triggerConfirm("Review rencana ini?")) {
                                  setIsCreatingPlan(true);
                                  setPlanDraftTitle(plan.title + " (Copy)");
                                  setPlanDraftItems(plan.items || []);
                                }
                              }}
                              className="px-4 py-3 bg-slate-50 text-slate-500 rounded-2xl hover:bg-slate-100 transition-all font-black text-[9px] uppercase tracking-widest"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                              onClick={async () => {
                                if (await triggerConfirm("Hapus rencana ini?")) {
                                  try {
                                    await api.deleteShoppingPlan(plan.id);
                                    setShoppingPlans((prev) =>
                                      prev.filter((p) => p.id !== plan.id),
                                    );
                                  } catch (e: any) {
                                    alert("Gagal menghapus rencana: " + e.message);
                                  }
                                }
                              }}
                              className="px-4 py-3 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {shoppingPlans.length === 0 && (
                        <div className="col-span-full py-16 bg-slate-50 rounded-2xl md:rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-4 text-center">
                          <PackagePlus className="w-12 h-12 text-slate-300" />
                          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest text-center">
                            Belum ada riwayat rencana belanja
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* DRAFT EDITOR MODE */
                  <div className="bg-white rounded-[40px] border border-slate-200 shadow-2xl overflow-hidden flex flex-col min-h-[600px] content-fade">
                    <div className="p-4 md:p-8 border-b border-slate-100 bg-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6 overflow-hidden text-left">
                      <div className="flex-1 text-left">
                        <input
                          value={planDraftTitle}
                          onChange={(e) => setPlanDraftTitle(e.target.value)}
                          placeholder="Judul Rencana Belanja..."
                          className="text-lg md:text-2xl font-black text-slate-900 tracking-tight outline-none w-full bg-transparent border-b-2 border-transparent focus:border-blue-500/30 pb-1 text-left"
                        />
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 text-left">
                          Menyusun kebutuhan stok multisabang
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={async () => {
                            const prod = await triggerPrompt(
                              "Masukkan Barcode atau Nama Produk:",
                            );
                            if (prod) {
                              const found = products.find(
                                (p) =>
                                  p.barcode === prod ||
                                  p.name
                                    .toLowerCase()
                                    .includes(prod.toLowerCase()),
                              );
                              if (found) {
                                if (
                                  planDraftItems.some(
                                    (i) => i.productId === found.id,
                                  )
                                )
                                  return alert("Produk sudah ada!");
                                setPlanDraftItems([
                                  ...planDraftItems,
                                  { productId: found.id, branchQtys: {} },
                                ]);
                              } else {
                                alert("Produk tidak ditemukan!");
                              }
                            }
                          }}
                          className="px-4 md:px-6 py-3 md:py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" /> Tambah Produk
                        </button>
                        <button
                          onClick={async () => {
                            if (planDraftItems.length === 0)
                              return alert("Tambahkan produk dulu!");
                            const planObj = {
                              title: planDraftTitle,
                              items: planDraftItems,
                              status: "DRAFT",
                              creatorId: profile?.uid || profile?.id || null,
                            };
                            try {
                              const created = await api.createShoppingPlan(planObj);
                              setShoppingPlans((prev) => [created, ...prev]);
                              setIsCreatingPlan(false);
                            } catch (e: any) {
                              alert("Gagal menyimpan rencana: " + e.message);
                            }
                          }}
                          className="px-4 md:px-6 py-3 md:py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all flex items-center gap-2"
                        >
                          <Save className="w-4 h-4" /> Simpan Draft
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2">
                      {planDraftItems.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center py-20 gap-4">
                          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                            <Search className="w-8 h-8 text-slate-300" />
                          </div>
                          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest text-center">
                            Belum ada item yang dipilih
                          </p>
                        </div>
                      ) : (
                        planDraftItems
                          .slice()
                          .sort((a, b) => {
                            const pa = products.find((p) => p.id === a.productId)?.name || "";
                            const pb = products.find((p) => p.id === b.productId)?.name || "";
                            return naturalSort(pa, pb);
                          })
                          .map((item) => {
                            const p = products.find((x) => x.id === item.productId);
                            const globalIdx = planDraftItems.findIndex((x) => x.productId === item.productId);
                            const total = Object.values((item.branchQtys || {}) as Record<string, string>)
                              .reduce((s: number, v) => s + (parseInt(v || "0") || 0), 0);
                            const visibleBranches = branches
                              .slice()
                              .sort((a, b) => naturalSort(a.name, b.name))
                              .filter((b) => {
                                if (hiddenShoppingBranchIds.includes(b.id)) return false;
                                const visibleIds = p?.visibleBranchIds || "*";
                                return visibleIds === "*" || visibleIds.split(",").map((id: string) => id.trim()).includes(b.id);
                              });
                            return (
                              <div key={item.productId} className="bg-white border border-slate-100 rounded-2xl p-3 shadow-sm hover:border-blue-200 transition-all">
                                {/* Header row */}
                                <div className="flex items-start justify-between mb-2.5 gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-extrabold text-slate-800 text-[13px] tracking-tight leading-snug truncate">
                                      {p?.name || "Invalid Product"}
                                    </p>
                                    <p className="text-[8.5px] text-blue-500 font-bold uppercase tracking-widest mt-0.5">
                                      {p?.category}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <div className="text-right">
                                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider leading-none">Total</p>
                                      <p className="text-base font-black text-slate-900 leading-tight">{total}</p>
                                    </div>
                                    <button
                                      onClick={() => setPlanDraftItems(planDraftItems.filter((x) => x.productId !== item.productId))}
                                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                                {/* Branch inputs row */}
                                <div className="flex flex-wrap gap-2">
                                  {visibleBranches.map((b) => {
                                    const isSafe = getBranchStock(b.id, item.productId) > (p?.minStock || 0);
                                    const currentStock = getBranchStock(b.id, item.productId);
                                    return (
                                      <div key={b.id} className="flex flex-col items-center gap-0.5">
                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-wide leading-none">{b.name}</span>
                                        <input
                                          type="number"
                                          inputMode="numeric"
                                          disabled={isSafe}
                                          value={item.branchQtys[b.id] || ""}
                                          onChange={(e) => {
                                            const newItems = [...planDraftItems];
                                            newItems[globalIdx].branchQtys = {
                                              ...newItems[globalIdx].branchQtys,
                                              [b.id]: e.target.value,
                                            };
                                            setPlanDraftItems(newItems);
                                          }}
                                          placeholder="0"
                                          title={isSafe ? `Stok aman: ${currentStock} (Min: ${p?.minStock || 0})` : `Sisa stok: ${currentStock} (Min: ${p?.minStock || 0})`}
                                          className={`w-14 border rounded-xl px-1 py-1.5 text-center font-mono font-black text-sm outline-none focus:ring-2 transition-all ${isSafe ? "bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed" : "bg-white border-slate-300 text-slate-700 focus:ring-blue-300 focus:border-blue-400"}`}
                                        />
                                        {!isSafe && (
                                          <span className={`text-[7.5px] font-bold leading-none ${currentStock === 0 ? "text-red-400" : "text-amber-400"}`}>
                                            stok:{currentStock}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {branches.filter(b => {
                                    if (hiddenShoppingBranchIds.includes(b.id)) return false;
                                    const visibleIds = p?.visibleBranchIds || "*";
                                    return visibleIds !== "*" && !visibleIds.split(",").map((id: string) => id.trim()).includes(b.id);
                                  }).map(b => (
                                    <div key={b.id} className="flex flex-col items-center gap-0.5 opacity-30">
                                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-wide leading-none">{b.name}</span>
                                      <div className="w-14 h-[34px] border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-center">
                                        <span className="text-slate-300 text-xs">—</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>

                    <div className="p-4 md:p-8 border-t border-slate-100 bg-slate-50/50 flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-4 text-left">
                        <div className="bg-white px-4 md:px-6 py-3 rounded-2xl border border-slate-200 shadow-sm text-left">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 text-left">
                            Total Item Berbeda
                          </p>
                          <p className="text-xl font-black text-slate-900 text-left">
                            {planDraftItems.length} Produk
                          </p>
                        </div>
                        <div className="bg-white px-4 md:px-6 py-3 rounded-2xl border border-slate-200 shadow-sm text-left">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 text-left">
                            Total Unit Pesanan
                          </p>
                          <p className="text-xl font-black text-blue-600 text-left">
                            {planDraftItems.reduce(
                              (acc, it) =>
                                acc +
                                Object.values(
                                  (it.branchQtys || {}) as Record<
                                    string,
                                    string
                                  >,
                                ).reduce(
                                  (s: number, v) =>
                                    s + (parseInt(v || "0") || 0),
                                  0,
                                ),
                              0,
                            )}{" "}
                            Pcs
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3 w-full md:w-auto">
                        <button
                          onClick={() => {
                            if (planDraftItems.length === 0)
                              return alert("Daftar belanja kosong!");
                            const msg = generateWhatsAppMessage(planDraftItems);
                            window.open(
                              `https://wa.me/?text=${encodeURIComponent(msg)}`,
                              "_blank",
                            );
                          }}
                          className="flex-1 md:flex-none px-4 md:px-8 py-3 md:py-5 bg-emerald-600 text-white rounded-[24px] font-black text-[11px] uppercase tracking-[0.2em] shadow-xl shadow-emerald-200 hover:bg-emerald-700 hover:scale-[1.02] transition-all flex items-center justify-center gap-3"
                        >
                          <Smartphone className="w-5 h-5" /> Export WA Sekarang
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeMenu === "stock_audit" &&
              (profile?.role === "AUDIT" || profile?.role === "ADMIN") && (
                <BranchStockAuditPage
                  branches={branches.map((branch) => ({ id: branch.id, name: branch.name }))}
                  role={profile.role}
                  userId={profile.id}
                  api={branchStockAuditApi}
                />
              )}
            {activeMenu === "audit" &&
              (profile?.role === "AUDIT" || profile?.role === "ADMIN") && (
                <div data-ui-screen="opname" className="ui-screen-opname flex-1 flex flex-col bg-white md:m-4 md:rounded shadow-sm border-t md:border border-slate-200 overflow-hidden">
                  <div data-opname-header className="p-3 md:p-4 border-b border-slate-200 bg-white flex flex-col gap-3 justify-between shrink-0">
                    <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
                      <div className="flex-1 w-full text-left">
                        <div className="flex items-center gap-4 mb-2">
                          <h2 className="text-base md:text-lg font-black text-slate-900 uppercase tracking-tight">Manajemen Stok Opname</h2>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 text-left">
                          Target Audit Institusi Cabang:
                        </p>
                        <div data-opname-branch>
                        <CustomSelect
                          value={auditSelectedBranch}
                          onChange={(v) => setAuditSelectedBranch(v)}
                          placeholder="-- Pilih Cabang yang Diaudit --"
                          options={[
                            {
                              value: "",
                              label: "-- Pilih Cabang yang Diaudit --",
                            },
                            ...branches.map((b) => ({
                              value: b.id,
                              label: b.name,
                            })),
                          ]}
                          className="w-full sm:max-w-xs"
                          buttonClassName="w-full min-h-11 text-sm font-bold uppercase tracking-wide px-3 py-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-slate-400 text-left outline-none"
                        />
                        </div>
                      </div>

                      <div data-opname-sku-search className="relative w-full sm:max-w-xs shrink-0 items-center">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder={
                            auditSelectedBranch
                              ? "Cari SKU / Barcode..."
                              : "Pilih cabang untuk mencari..."
                          }
                          disabled={!auditSelectedBranch}
                          className={`w-full min-h-11 bg-white border border-slate-300 rounded-xl pl-9 pr-12 py-2.5 text-sm focus:ring-2 focus:ring-slate-400 outline-none transition-all ${!auditSelectedBranch ? "bg-slate-50 cursor-not-allowed opacity-50" : "bg-white"}`}
                          value={searchTerm}
                          onChange={(e) => {
                            setSearchTerm(e.target.value);
                            if (e.target.value) setDrillPath([]);
                          }}
                        />
                        <button
                          disabled={!auditSelectedBranch}
                          onClick={() => {
                            if (!auditSelectedBranch) return;
                            setScannerCallback(() => (code: string) => {
                              const found = products.find(
                                (p) => p.barcode === code,
                              );
                              if (found) {
                                setQuickAuditProduct(found);
                              } else {
                                setSearchTerm(code);
                              }
                            });
                            setShowScanner(true);
                          }}
                          className={`absolute right-1 top-1/2 -translate-y-1/2 p-2 transition-colors ${!auditSelectedBranch ? "text-slate-300 cursor-not-allowed" : "text-slate-600 hover:text-slate-900"}`}
                        >
                          <Camera className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {!searchTerm && (
                      <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar text-[10px] font-bold uppercase tracking-wide">
                        <button
                          onClick={() => setDrillPath([])}
                          className={`shrink-0 min-h-10 flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors ${drillPath.length === 0 ? "bg-slate-800 border-slate-800 text-white" : "bg-slate-100 border-transparent text-slate-600 hover:bg-slate-200 hover:text-slate-900"}`}
                        >
                          <LayoutList className="w-3 h-3" />
                          SEMUA KATEGORI
                        </button>
                        {drillPath.map((path, idx) => (
                          <React.Fragment key={idx}>
                            <ArrowRightLeft className="w-3 h-3 text-slate-300 transform rotate-90 sm:rotate-0" />
                            <button
                              onClick={() =>
                                setDrillPath(drillPath.slice(0, idx + 1))
                              }
                              className="shrink-0 min-h-10 px-3 py-2 rounded-lg border bg-slate-100 border-slate-200 text-slate-700"
                            >
                              {path}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 overflow-x-auto relative flex flex-col lg:flex-row h-full overflow-hidden">
                    <div className="flex-1 overflow-y-auto lg:min-w-[700px] border-r border-slate-100 bg-white">
                      {!auditSelectedBranch && (
                        <div className="absolute inset-0 bg-slate-50/80 z-20 flex flex-col items-center justify-center p-4 md:p-6 text-center">
                          <MapPin className="w-12 h-12 text-slate-300 mb-3" />
                          <h3 className="text-xl font-black text-slate-800 tracking-tight">
                            Pilih Cabang Terlebih Dahulu
                          </h3>
                          <p className="text-xs text-slate-500 mt-2 max-w-sm">
                            Anda harus memilih cabang mana yang sedang Anda
                            audit stoknya agar sinkronisasi data tepat sasaran.
                          </p>
                        </div>
                      )}

                      <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 z-10 shadow-sm">
                          <tr>
                            <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                              {searchTerm ||
                              drillPath.length >= 3 ||
                              (drillPath.length === 2 &&
                                drillPath[0] !== "Aksesoris")
                                ? "Produk Audit"
                                : "Pilih Grup"}
                            </th>
                            <th className="px-2 md:px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center w-20 md:w-32 border-x border-slate-200">
                              Stok Sistem
                            </th>
                            <th className="px-2 md:px-4 py-3 text-[10px] font-bold text-blue-600 uppercase tracking-widest w-32 md:w-48">
                              Edit Fisik Stok
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs text-left">
                          {(() => {
                            const filtered = products
                              .filter((p) => {
                                if (!p) return false;
                                // Visibility check
                                const visibleIds = p.visibleBranchIds || "*";
                                const isVisible =
                                  visibleIds === "*" ||
                                  (auditSelectedBranch &&
                                    visibleIds
                                      .split(",")
                                      .map((id: string) => id.trim())
                                      .includes(auditSelectedBranch));
                                if (!isVisible) return false;

                                return (
                                  !searchTerm ||
                                  (p.name || "")
                                    .toLowerCase()
                                    .includes(searchTerm.toLowerCase()) ||
                                  (p.barcode || "").includes(searchTerm)
                                );
                              })
                              .sort((a, b) => {
                                const getPrice = (px: any) =>
                                  px.discountPrice > 0
                                    ? px.discountPrice
                                    : px.sellingPrice;
                                return getPrice(a) - getPrice(b);
                              });

                            const isAksesoris = drillPath[0] === "Aksesoris";
                            const isEndLevel =
                              searchTerm ||
                              drillPath.length >= 3 ||
                              (drillPath.length === 2 && !isAksesoris);

                            if (isEndLevel) {
                              const finalFiltered = !searchTerm
                                ? filtered.filter((p) => {
                                    if (drillPath.length === 2) {
                                      const field =
                                        drillPath[0] === "Voucher" ||
                                        (drillPath[0] &&
                                          drillPath[0].includes("Perdana"))
                                          ? "provider"
                                          : "brand";
                                      return (
                                        (p.category || "UMUM") ===
                                          drillPath[0] &&
                                        (p[field] || "UMUM") ===
                                          drillPath[1]
                                      );
                                    }
                                    if (drillPath.length === 3) {
                                      return (
                                        (p.category || "UMUM") ===
                                          drillPath[0] &&
                                        (p.brand || "UMUM") ===
                                          drillPath[1] &&
                                        (p.subCategory || "UMUM") ===
                                          drillPath[2]
                                      );
                                    }
                                    return true;
                                  })
                                : filtered;

                              return finalFiltered.map((p: any) => {
                                const currentStock =
                                  stocks.find(
                                    (s) =>
                                      s.branchId === auditSelectedBranch &&
                                      s.productId === p.id,
                                  )?.qty || 0;
                                return (
                                  <tr key={`${auditSelectedBranch}:${p.id}`} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 text-left">
                                      <p className="font-bold text-slate-800 flex items-center gap-2 uppercase tracking-tight text-left">
                                        {p.type === "Voucher" ? (
                                          <Wifi className="w-3.5 h-3.5 text-purple-600" />
                                        ) : (
                                          <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                                        )}
                                        {p.name}
                                      </p>
                                      <p className="text-[10px] font-mono text-slate-400 mt-0.5 text-left flex items-center gap-2">
                                        <span>{p.barcode}</span>
                                        {p.masterSN && p.masterSN !== p.barcode && (
                                          <span className="text-purple-500 font-bold">| M-SN: {p.masterSN}</span>
                                        )}
                                      </p>
                                    </td>
                                    <td className="px-2 md:px-4 py-3 text-center border-x border-slate-50">
                                      <span className="inline-flex items-center justify-center min-w-[40px] h-9 px-2 rounded-lg bg-slate-900 text-white font-black text-[10px]">
                                        {currentStock}
                                      </span>
                                    </td>
                                    <td className="px-2 md:px-4 py-3">
                                      <OpnameStockInput
                                        branchId={auditSelectedBranch}
                                        productId={p.id}
                                        currentStock={currentStock}
                                        onSave={handleAuditStock}
                                      />
                                    </td>
                                  </tr>
                                );
                              });
                            }

                            let groups: any = {};
                            if (drillPath.length === 0) {
                              groups = filtered.reduce((acc: any, p) => {
                                const val = p.category || "UMUM";
                                if (!acc[val]) acc[val] = [];
                                acc[val].push(p);
                                return acc;
                              }, {});
                            } else if (drillPath.length === 1) {
                              const cat = drillPath[0];
                              const field =
                                cat === "Voucher" ||
                                (cat && cat.includes("Perdana"))
                                  ? "provider"
                                  : "brand";
                              groups = filtered
                                .filter(
                                  (p) => (p.category || "UMUM") === cat,
                                )
                                .reduce((acc: any, p) => {
                                  const val = p[field] || "UMUM";
                                  if (!acc[val]) acc[val] = [];
                                  acc[val].push(p);
                                  return acc;
                                }, {});
                            } else if (drillPath.length === 2 && isAksesoris) {
                              const [cat, brand] = drillPath;
                              groups = filtered
                                .filter(
                                  (p) =>
                                    (p.category || "UMUM") === cat &&
                                    (p.brand || "UMUM") === brand,
                                )
                                .reduce((acc: any, p) => {
                                  const val = p.subCategory || "UMUM";
                                  if (!acc[val]) acc[val] = [];
                                  acc[val].push(p);
                                  return acc;
                                }, {});
                            }

                            return Object.entries(groups).map(
                              ([groupName, items]: [any, any]) => (
                                <tr
                                  key={groupName}
                                  className="hover:bg-slate-50 cursor-pointer group"
                                  onClick={() =>
                                    setDrillPath([...drillPath, groupName])
                                  }
                                >
                                  <td className="px-3 py-2.5 md:px-4 md:py-3 text-left">
                                    <div className="flex items-center gap-3">
                                      <div
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${drillPath.length === 0 ? "bg-slate-50 border-slate-200 text-slate-700" : drillPath.length === 1 ? "bg-blue-50 border-blue-100 text-blue-700" : "bg-purple-50 border-purple-100 text-purple-700"}`}
                                      >
                                        {drillPath.length === 0 ? (
                                          <LayoutList className="w-5 h-5" />
                                        ) : drillPath.length === 1 ? (
                                          <Store className="w-5 h-5" />
                                        ) : (
                                          <PackagePlus className="w-5 h-5" />
                                        )}
                                      </div>
                                      <div className="text-left">
                                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1 text-left">
                                          {drillPath.length === 0
                                            ? "Grup Kategori"
                                            : drillPath.length === 1
                                              ? "Merek / Provider"
                                              : "Sub-Kategori / Tipe"}
                                        </p>
                                        <p className="text-sm font-black text-slate-800 uppercase tracking-tight text-left">
                                          {groupName}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td
                                    colSpan={2}
                                    className="px-4 py-3 md:py-4 text-right"
                                  >
                                    <div className="flex flex-col items-end gap-1">
                                      <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest">
                                        {items.length} Barang
                                      </span>
                                      <div className="flex items-center gap-1 text-slate-600 text-[10px] font-bold uppercase tracking-wide opacity-0 group-hover:opacity-100 transition-all">
                                        BUKA FOLDER{" "}
                                        <ArrowRightLeft className="w-3 h-3" />
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ),
                            );
                          })()}
                        </tbody>
                      </table>
                  </div>

                  {/* SIDEBAR: AUDIT OPERATIONS */}
                  <div data-opname-entry className="w-full lg:w-[350px] bg-white lg:bg-slate-50 overflow-y-auto shrink-0 flex flex-col h-full border-t border-slate-200 lg:border-t-0 lg:border-l relative">
                      {!auditSelectedBranch && (
                        <div className="absolute inset-0 bg-slate-50/70 z-20 flex flex-col items-center justify-center p-4 md:p-8 text-center">
                          <div className="w-16 h-16 bg-white rounded-2xl md:rounded-3xl shadow-xl flex items-center justify-center mb-4 border border-slate-100">
                            <Lock className="w-7 h-7 text-slate-300" />
                          </div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            Operasi Terkunci
                          </p>
                          <p className="text-[8px] text-slate-400 font-bold uppercase mt-2">
                            Pilih cabang di atas untuk input stok
                          </p>
                        </div>
                      )}
                      <div data-opname-tabs className="p-3 md:p-4 bg-white lg:bg-slate-50 border-b border-slate-200 sticky top-0 z-10 text-left">
                        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
                          <button
                            onClick={() => setAuditSidebarTab("incoming")}
                            className={`flex-1 min-h-11 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg transition-colors font-black text-[9px] uppercase tracking-wide whitespace-nowrap ${auditSidebarTab === "incoming" ? "bg-white text-slate-800 border border-slate-200 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                          >
                            <Plus className="w-3.5 h-3.5" /> Stok Masuk
                          </button>
                          <button
                            onClick={() => setAuditSidebarTab("disposal")}
                            className={`flex-1 min-h-11 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg transition-colors font-black text-[9px] uppercase tracking-wide whitespace-nowrap ${auditSidebarTab === "disposal" ? "bg-white text-slate-800 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800"}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Pemusnahan
                          </button>
                          <button
                            onClick={() => setAuditSidebarTab("transfer")}
                            className={`flex-1 min-h-11 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg transition-colors font-black text-[9px] uppercase tracking-wide whitespace-nowrap ${auditSidebarTab === "transfer" ? "bg-white text-slate-800 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800"}`}
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" /> Antar Cabang
                          </button>
                          <button
                            onClick={() => setAuditSidebarTab("logs")}
                            className={`flex-1 min-h-11 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg transition-colors font-black text-[9px] uppercase tracking-wide whitespace-nowrap ${auditSidebarTab === "logs" ? "bg-white text-slate-800 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800"}`}
                          >
                            <HistoryIcon className="w-3.5 h-3.5" /> Riwayat
                          </button>
                        </div>
                      </div>

                      <div data-opname-form className="p-3 md:p-5">
                        {auditSidebarTab === "incoming" ? (
                          <>
                            <div data-opname-section-heading className="flex items-center gap-3 mb-4 bg-white p-3 md:p-4 rounded-2xl border border-slate-200 text-left">
                              <div className="w-10 h-10 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl flex items-center justify-center shrink-0">
                                <PackagePlus className="w-6 h-6" />
                              </div>
                              <div className="text-left">
                                <h4 className="text-sm font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
                                  Pemasokan
                                </h4>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">
                                  Tambah Stok Baru Dari Pusat
                                </p>
                              </div>
                            </div>

                            <div className="space-y-4 text-left">
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 text-left">
                                  Pilih Barang:
                                </label>
                                <div className="space-y-2">
                                  <div data-opname-product-search className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                      type="text"
                                      placeholder="Cari Nama Produk..."
                                      value={auditProductSearch}
                                      onChange={(e) => setAuditProductSearch(e.target.value)}
                                       className="w-full min-h-11 bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-[11px] font-bold uppercase focus:ring-2 focus:ring-slate-400 outline-none transition-all"
                                    />
                                    {auditProductSearch && (
                                      <button 
                                        onClick={() => setAuditProductSearch("")}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                  <ProductResultGrid
                                    products={products}
                                    stocks={stocks}
                                    branchId={auditSelectedBranch}
                                    search={auditProductSearch}
                                    selectedId={auditSelectedProductId}
                                    onSelect={setAuditSelectedProductId}
                                  />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 text-left">
                                  Supplier / Keterangan:
                                </label>
                                <input
                                  id="audit-add-supplier"
                                  type="text"
                                  placeholder="Contoh: Stok Pusat / Kiriman JNE"
                                  className="w-full min-h-11 bg-white border border-slate-300 rounded-xl px-4 py-3 text-xs font-black focus:ring-2 focus:ring-slate-400 outline-none"
                                />
                              </div>

                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 text-left">
                                  Jumlah Tambahan:
                                </label>
                                <input
                                  id="audit-add-qty"
                                  type="number"
                                  placeholder="Contoh: 50"
                                  className="w-full min-h-11 bg-white border border-slate-300 rounded-xl px-4 py-3 text-xs font-black focus:ring-2 focus:ring-slate-400 text-center outline-none"
                                />
                              </div>

                              <button
                                onClick={async () => {
                                  const pId = auditSelectedProductId;
                                  const q = parseInt(
                                    (
                                      document.getElementById(
                                        "audit-add-qty",
                                      ) as HTMLInputElement
                                    ).value,
                                  );
                                  const s = (
                                    document.getElementById(
                                      "audit-add-supplier",
                                    ) as HTMLInputElement
                                  ).value;
                                  if (
                                    !pId ||
                                    isNaN(q) ||
                                    q <= 0 ||
                                    !auditSelectedBranch
                                  )
                                    return alert(
                                      "Lengkapi data pemasokan & pilih cabang!",
                                    );
 
                                  await handleStockAddition(
                                    pId,
                                    q,
                                    s || "Stok Pusat",
                                    auditSelectedBranch,
                                  );
 
                                  setAuditSelectedProductId("");
                                  setAuditProductSearch("");
                                  (
                                    document.getElementById(
                                      "audit-add-qty",
                                    ) as HTMLInputElement
                                  ).value = "";
                                  (
                                    document.getElementById(
                                      "audit-add-supplier",
                                    ) as HTMLInputElement
                                  ).value = "";
                                }}
                                className="w-full min-h-11 bg-slate-800 text-white py-3 rounded-xl font-black text-[11px] uppercase tracking-wide shadow-sm hover:bg-slate-900 transition-colors flex items-center justify-center gap-3 active:scale-[0.99]"
                              >
                                Patenkan Pemasokan
                              </button>
                            </div>
                          </>
                        ) : auditSidebarTab === "disposal" ? (
                          <div className="sidebar-group-disposal">
                            <div data-opname-section-heading className="flex items-center gap-3 mb-4 bg-white p-3 md:p-4 rounded-2xl border border-slate-200 text-left">
                              <div className="w-10 h-10 bg-red-50 text-red-600 border border-red-100 rounded-xl flex items-center justify-center shrink-0">
                                <Trash2 className="w-5 h-5" />
                              </div>
                              <div className="text-left">
                                <h4 className="text-sm font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
                                  Pemusnahan
                                </h4>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">
                                  Lapor Barang Riject/ED
                                </p>
                              </div>
                            </div>

                            <div className="space-y-4 text-left">
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 text-left">
                                  Pilih Barang:
                                </label>
                                <div className="space-y-2">
                                  <div data-opname-product-search className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                      type="text"
                                      placeholder="Cari Nama Produk..."
                                      value={auditProductSearch}
                                      onChange={(e) => setAuditProductSearch(e.target.value)}
                                       className="w-full min-h-11 bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-[11px] font-bold uppercase focus:ring-2 focus:ring-slate-400 outline-none transition-all"
                                    />
                                    {auditProductSearch && (
                                      <button 
                                        onClick={() => setAuditProductSearch("")}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                  <ProductResultGrid
                                    products={products}
                                    stocks={stocks}
                                    branchId={auditSelectedBranch}
                                    search={auditProductSearch}
                                    selectedId={auditSelectedProductId}
                                    onSelect={setAuditSelectedProductId}
                                  />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 text-left">
                                  Kategori Alasan:
                                </label>
                                <CustomSelect
                                  hiddenId="audit-dispose-reason"
                                  defaultValue="Expired"
                                  options={[
                                    {
                                      value: "Expired",
                                      label: "Kadaluarsa / ED",
                                    },
                                    {
                                      value: "Damaged",
                                      label: "Barang Rusak / Fisik Cacat",
                                    },
                                    {
                                      value: "Lost",
                                      label: "Hilang / Selisih Kurang",
                                    },
                                  ]}
                                  className="w-full"
                                   buttonClassName="w-full min-h-11 bg-white border border-slate-300 rounded-xl px-4 py-3 text-[11px] font-black uppercase focus:ring-2 focus:ring-slate-400 transition-colors outline-none"
                                />
                              </div>

                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 text-left">
                                  Kuantitas Pemusnahan:
                                </label>
                                <input
                                  id="audit-dispose-qty"
                                  type="number"
                                  placeholder="Contoh: 5"
                                  className="w-full min-h-11 bg-white border border-slate-300 rounded-xl px-4 py-3 text-xs font-black focus:ring-2 focus:ring-slate-400 text-center outline-none"
                                />
                              </div>

                              <button
                                onClick={async () => {
                                  const pId = auditSelectedProductId;
                                  const q = parseInt(
                                    (
                                      document.getElementById(
                                        "audit-dispose-qty",
                                      ) as HTMLInputElement
                                    ).value,
                                  );
                                  const r = (
                                    document.getElementById(
                                      "audit-dispose-reason",
                                    ) as HTMLSelectElement
                                  ).value;
                                  if (
                                    !pId ||
                                    isNaN(q) ||
                                    q <= 0 ||
                                    !auditSelectedBranch
                                  )
                                    return alert(
                                      "Lengkapi data pemusnahan & pilih cabang!",
                                    );
                                  if (
                                    !(await triggerConfirm(
                                      "Yakin ingin memusnahkan stok?\nTindakan ini akan memotong stok sistem secara permanen.",
                                    ))
                                  )
                                    return;

                                  await handleStockAdjustment(
                                    pId,
                                    q,
                                    r,
                                    auditSelectedBranch,
                                  );

                                  setAuditSelectedProductId("");
                                  setAuditProductSearch("");
                                  (
                                    document.getElementById(
                                      "audit-dispose-qty",
                                    ) as HTMLInputElement
                                  ).value = "";
                                }}
                                className="w-full min-h-11 bg-slate-800 text-white py-3 rounded-xl font-black text-[11px] uppercase tracking-wide shadow-sm hover:bg-slate-900 transition-colors flex items-center justify-center gap-3 active:scale-[0.99]"
                              >
                                Patenkan Pemusnahan
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="sidebar-group-transfer">
                            <div data-opname-section-heading className="flex items-center gap-3 mb-4 bg-white p-3 md:p-4 rounded-2xl border border-slate-200 text-left">
                              <div className="w-10 h-10 bg-slate-50 text-slate-700 border border-slate-200 rounded-xl flex items-center justify-center shrink-0">
                                <ArrowRightLeft className="w-5 h-5" />
                              </div>
                              <div className="text-left">
                                <h4 className="text-sm font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
                                  Transfer Stok
                                </h4>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">
                                  Kirim Stok Ke Cabang Lain
                                </p>
                              </div>
                            </div>

                            <div className="space-y-4 text-left">
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 text-left">
                                  Pilih Barang:
                                </label>
                                <div className="space-y-2">
                                  <div data-opname-product-search className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                      type="text"
                                      placeholder="Cari Nama Produk..."
                                      value={auditProductSearch}
                                      onChange={(e) => setAuditProductSearch(e.target.value)}
                                      className="w-full min-h-11 bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-[11px] font-bold uppercase focus:ring-2 focus:ring-slate-400 outline-none transition-all"
                                    />
                                    {auditProductSearch && (
                                      <button 
                                        onClick={() => setAuditProductSearch("")}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                  <ProductResultGrid
                                    products={products}
                                    stocks={stocks}
                                    branchId={auditSelectedBranch}
                                    search={auditProductSearch}
                                    selectedId={auditSelectedProductId}
                                    onSelect={setAuditSelectedProductId}
                                  />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 text-left">
                                  Cabang Tujuan:
                                </label>
                                <CustomSelect
                                  hiddenId="audit-transfer-target"
                                  defaultValue=""
                                  placeholder="-- PILIH CABANG TUJUAN --"
                                  options={[
                                    {
                                      value: "",
                                      label: "-- PILIH CABANG TUJUAN --",
                                    },
                                    ...branches
                                      .filter(
                                        (b) => b.id !== auditSelectedBranch,
                                      )
                                      .map((b) => ({
                                        value: b.id,
                                        label: b.name,
                                      })),
                                  ]}
                                  className="w-full"
                                  buttonClassName="w-full min-h-11 bg-white border border-slate-300 rounded-xl px-4 py-3 text-[11px] font-black uppercase focus:ring-2 focus:ring-slate-400 transition-colors outline-none"
                                />
                              </div>

                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 text-left">
                                  Kuantitas Transfer:
                                </label>
                                <input
                                  id="audit-transfer-qty"
                                  type="number"
                                  placeholder="Contoh: 10"
                                  className="w-full min-h-11 bg-white border border-slate-300 rounded-xl px-4 py-3 text-xs font-black focus:ring-2 focus:ring-slate-400 text-center outline-none"
                                />
                              </div>

                              <button
                                onClick={async () => {
                                  const pId = auditSelectedProductId;
                                  const q = parseInt(
                                    (
                                      document.getElementById(
                                        "audit-transfer-qty",
                                      ) as HTMLInputElement
                                    ).value,
                                  );
                                  const tId = (
                                    document.getElementById(
                                      "audit-transfer-target",
                                    ) as HTMLSelectElement
                                  ).value;
                                  if (
                                    !pId ||
                                    isNaN(q) ||
                                    q <= 0 ||
                                    !tId ||
                                    !auditSelectedBranch
                                  )
                                    return alert(
                                      "Lengkapi data transfer & pilih cabang!",
                                    );

                                  await handleStockTransfer(
                                    pId,
                                    q,
                                    tId,
                                    auditSelectedBranch,
                                  );

                                  setAuditSelectedProductId("");
                                  setAuditProductSearch("");
                                  (
                                    document.getElementById(
                                      "audit-transfer-qty",
                                    ) as HTMLInputElement
                                  ).value = "";
                                }}
                                className="w-full min-h-11 bg-slate-800 text-white py-3 rounded-xl font-black text-[11px] uppercase tracking-wide shadow-sm hover:bg-slate-900 transition-colors flex items-center justify-center gap-3 active:scale-[0.99]"
                              >
                                Patenkan Transfer
                              </button>
                            </div>
                          </div>
                        )}
                        {auditSidebarTab === "logs" && (
                          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                             <div className="flex items-center gap-3 mb-4 bg-white p-3 rounded-2xl border border-slate-200 text-left">
                               <div className="w-10 h-10 bg-amber-50 text-amber-700 border border-amber-100 rounded-xl flex items-center justify-center shrink-0">
                                 <HistoryIcon className="w-5 h-5" />
                               </div>
                               <div className="text-left">
                                 <h4 className="text-sm font-black text-slate-900 uppercase tracking-tighter leading-none mb-1">
                                   Jejak Audit
                                 </h4>
                                 <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">
                                   Riwayat Mutasi Cabang Ini
                                 </p>
                               </div>
                             </div>

                             <div className="space-y-3">
                               {adjustments
                                 .filter(a => !auditSelectedBranch || a.branchId === auditSelectedBranch)
                                 .slice(0, 30)
                                 .map((log: any, idx: number) => (
                                    <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 transition-colors text-left">
                                     <div className="flex justify-between items-start mb-2">
                                       <p className="text-[10px] font-black text-slate-900 uppercase tracking-tight truncate max-w-[150px]">
                                         {products.find(p => p.id === log.productId)?.name || "Produk N/A"}
                                       </p>
                                       <span className={`px-2 py-0.5 rounded font-black uppercase text-[8px] tracking-widest ${
                                          log.type?.includes("IN") ? "bg-slate-100 text-slate-700" : log.type?.includes("OUT") ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-700"
                                       }`}>
                                         {log.type === "STOCK_IN" ? "Masuk" : log.type === "STOCK_OUT" ? "Keluar" : log.type === "TRANSFER_IN" ? "Trf In" : "Trf Out"}
                                       </span>
                                     </div>
                                     <div className="flex justify-between items-end">
                                       <div>
                                         <p className="text-[9px] text-slate-400 font-medium uppercase tracking-widest mb-1">
                                           {log.reason || "Tanpa Keterangan"}
                                         </p>
                                         <p className="text-[8px] font-mono text-slate-300 font-bold">
                                           {new Date(log.createdAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                         </p>
                                       </div>
                                       <p className="text-sm font-black text-slate-800">
                                         {log.qty > 0 ? `+${log.qty}` : log.qty}
                                       </p>
                                     </div>
                                   </div>
                                 ))}

                               {adjustments.filter(a => !auditSelectedBranch || a.branchId === auditSelectedBranch).length === 0 && (
                                  <div className="py-8 text-center opacity-40">
                                   <HistoryIcon className="w-12 h-12 mx-auto mb-3" />
                                   <p className="text-[10px] font-black uppercase tracking-widest">Belum ada riwayat</p>
                                 </div>
                               )}
                             </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
            )}

            {/* --- 5. CASHIER: POS AREA --- */}
            {/* --- NEW: CASHIER STOCK INPUT --- */}
            {activeMenu === "cashier_stock" && profile?.role === "CASHIER" && !shiftOpen && (
              <div data-ui-screen="cashier-stock" className="ui-screen-cashier-stock flex-1 flex items-center justify-center bg-slate-50 p-4">
                <div
                  role="status"
                  className="w-full max-w-sm rounded-3xl border border-amber-200 bg-white p-6 text-center shadow-xl"
                >
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <Lock className="h-6 w-6" />
                  </div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
                    Input stok terkunci
                  </h2>
                  <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
                    Shift belum dibuka atau sudah ditutup. Input stok cabang hanya tersedia saat shift aktif.
                  </p>
                  <button
                    onClick={() => setActiveMenu("shift")}
                    className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-blue-700"
                  >
                    Buka halaman shift
                  </button>
                </div>
              </div>
            )}

            {activeMenu === "cashier_stock" && profile?.role === "CASHIER" && shiftOpen && (
              <div data-ui-screen="cashier-stock" data-stock-workspace className="ui-screen-cashier-stock flex-1 bg-slate-50 flex flex-col lg:flex-row gap-4 p-3 md:p-6 overflow-y-auto lg:overflow-hidden h-full">
                {!appConfig.allowCashierStockInput ? (
                  <div className="flex flex-col items-center justify-center p-8 md:p-12 bg-white rounded-[32px] border border-slate-200 shadow-sm max-w-md mx-auto my-auto text-center space-y-6">
                    <div className="w-16 h-16 md:w-20 md:h-20 bg-amber-50 rounded-full flex items-center justify-center border border-amber-100 shadow-inner">
                      <Lock className="w-8 h-8 md:w-10 md:h-10 text-amber-500" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-lg md:text-2xl font-black text-slate-800 uppercase tracking-tighter">
                        Akses Terkunci
                      </h2>
                      <p className="text-[10px] md:text-xs text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
                        Menu input stok mandiri saat ini dinonaktifkan oleh
                        Admin Pusat. Hubungi atasan Anda untuk mengaktifkan
                        fitur ini.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* ── LEFT: product browser ── */}
                    <div data-cashier-stock-products className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px] lg:min-h-0">
                      {/* header */}
                      <div className="px-3 py-2.5 border-b border-slate-100 shrink-0 flex items-center gap-2">
                        <div className="w-7 h-7 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
                          <PlusSquare className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest flex-1">Pilih Produk Stok-In</span>
                        <button
                          onClick={() => {
                            setScannerCallback(() => (code: string) => {
                              const found = products.find(p => p.barcode === code);
                              if (found) setSelectedTransferProduct(found);
                              setShowScanner(false);
                            });
                            setShowScanner(true);
                          }}
                          className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-black text-[9px] uppercase tracking-widest hover:bg-emerald-700 active:scale-95 transition-all outline-none"
                        >
                          <Camera className="w-3 h-3" /> Scan
                        </button>
                      </div>

                      {/* search */}
                      <div className="px-3 py-2 border-b border-slate-100 shrink-0">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Cari nama / barcode..."
                            value={transferSearch}
                            onChange={(e) => setTransferSearch(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 py-2 pl-9 pr-3 rounded-lg text-[11px] font-semibold focus:ring-2 focus:ring-emerald-100 focus:bg-white focus:border-emerald-400 outline-none transition-all"
                          />
                        </div>
                      </div>

                      {/* breadcrumb */}
                      {transferDrillPath.length > 0 && !transferSearch && (
                        <div className="bg-slate-50 px-3 py-1.5 flex items-center gap-1.5 shrink-0 border-b border-slate-200">
                          <button onClick={() => setTransferDrillPath([])} className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-700 transition-colors">Semua</button>
                          {transferDrillPath.map((path, idx) => (
                            <React.Fragment key={idx}>
                              <ChevronRight className="w-3 h-3 text-slate-400" />
                              <button
                                onClick={() => setTransferDrillPath(transferDrillPath.slice(0, idx + 1))}
                                className={`text-[10px] font-black uppercase tracking-widest max-w-[120px] truncate ${idx === transferDrillPath.length - 1 ? "text-slate-900" : "text-slate-400"}`}
                              >{path}</button>
                            </React.Fragment>
                          ))}
                        </div>
                      )}

                      {/* DRILLDOWN / BROWSE AREA */}
                      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                        {(() => {
                          const filtered = products
                            .filter((p) =>
                              !transferSearch ||
                              (p?.name || "").toLowerCase().includes(transferSearch.toLowerCase()) ||
                              (p?.barcode || "").includes(transferSearch) ||
                              (p?.brand || "").toLowerCase().includes(transferSearch.toLowerCase())
                            )
                            .sort((a, b) => {
                              const getPrice = (px: any) => px.discountPrice > 0 ? px.discountPrice : px.sellingPrice;
                              return getPrice(a) - getPrice(b);
                            });

                          if (transferSearch || transferDrillPath.length >= 2) {
                            const final = !transferSearch
                              ? filtered.filter((p) => {
                                  if (transferDrillPath.length === 1) return (p.category || "UMUM") === transferDrillPath[0];
                                  if (transferDrillPath.length === 2) return (p.category || "UMUM") === transferDrillPath[0] && (p.brand || "UMUM") === transferDrillPath[1];
                                  return true;
                                })
                              : filtered;

                            return (
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                    <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Produk</th>
                                    <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:table-cell">Barcode</th>
                                    <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right w-16">Pilih</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {final.map((p) => {
                                    const selected = selectedTransferProduct?.id === p.id;
                                    return (
                                      <tr
                                        key={p.id}
                                        onClick={() => setSelectedTransferProduct(p)}
                                        className={`cursor-pointer border-b border-slate-100 transition-colors ${selected ? "bg-emerald-50" : "hover:bg-slate-50"}`}
                                      >
                                        <td className="px-3 py-2">
                                          <p className="text-[9px] text-slate-400 font-bold uppercase">{p.brand || "UMUM"}</p>
                                          <p className={`text-[11px] font-black uppercase leading-tight ${selected ? "text-emerald-700" : "text-slate-800"}`}>{p.name}</p>
                                          {p.masterSN && <p className="text-[9px] text-emerald-500 font-mono">SN: {p.masterSN}</p>}
                                        </td>
                                        <td className="px-3 py-2 hidden sm:table-cell">
                                          <span className="text-[10px] font-mono text-slate-500">{p.barcode || "—"}</span>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                          <div className={`inline-flex items-center justify-center w-6 h-6 rounded-md ${selected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                                            {selected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {final.length === 0 && (
                                    <tr><td colSpan={3} className="py-8 text-center text-[10px] text-slate-400 font-bold uppercase">Tidak ada produk ditemukan</td></tr>
                                  )}
                                </tbody>
                              </table>
                            );
                          }

                          let groups: any = {};
                          if (transferDrillPath.length === 0) {
                            groups = filtered.reduce((acc: any, p) => {
                              const val = p.category || "UMUM";
                              if (!acc[val]) acc[val] = [];
                              acc[val].push(p);
                              return acc;
                            }, {});
                          } else if (transferDrillPath.length === 1) {
                            groups = filtered
                              .filter((p) => (p.category || "UMUM") === transferDrillPath[0])
                              .reduce((acc: any, p) => {
                                const val = p.brand || "UMUM";
                                if (!acc[val]) acc[val] = [];
                                acc[val].push(p);
                                return acc;
                              }, {});
                          }

                          return (
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                    {transferDrillPath.length === 0 ? "Kategori" : "Brand / Tipe"}
                                  </th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right w-24">Jml Produk</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(groups).map(([name, items]: [any, any]) => (
                                  <tr
                                    key={name}
                                    onClick={() => setTransferDrillPath([...transferDrillPath, name])}
                                    className="cursor-pointer border-b border-slate-100 hover:bg-emerald-50 transition-colors group"
                                  >
                                    <td className="px-3 py-2.5">
                                      <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 bg-slate-100 group-hover:bg-emerald-100 text-slate-400 group-hover:text-emerald-600 rounded-md flex items-center justify-center shrink-0 transition-colors">
                                          {transferDrillPath.length === 0 ? <LayoutGrid className="w-3.5 h-3.5" /> : <Tag className="w-3.5 h-3.5" />}
                                        </div>
                                        <span className="text-[11px] font-black text-slate-800 uppercase">{name}</span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                      <span className="text-[10px] font-bold text-slate-400">{items.length}</span>
                                      <ChevronRight className="w-3 h-3 text-slate-400 inline ml-1" />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>
                    </div>

                    {/* ── RIGHT: input form ── */}
                    <div data-cashier-stock-entry className="w-full lg:w-[300px] xl:w-[320px] flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
                      {/* product info */}
                      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 shrink-0">
                        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-2">Input Detail Stok</p>
                        {selectedTransferProduct ? (
                          <div className="flex gap-3 items-center">
                            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                              <Package className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[9px] font-black text-emerald-600 uppercase leading-none mb-0.5">{selectedTransferProduct.brand}</p>
                              <p className="text-[12px] font-black uppercase leading-tight line-clamp-2 text-slate-900">{selectedTransferProduct.name}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="py-2 flex items-center gap-2 opacity-30">
                            <Hand className="w-5 h-5" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Pilih produk di sebelah kiri</p>
                          </div>
                        )}
                      </div>

                      {/* form fields */}
                      <div className="p-3 space-y-2.5 shrink-0 border-b border-slate-100">
                        <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Kuantitas Masuk</label>
                          <input
                            type="number"
                            id="cs-qty"
                            placeholder="0"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xl font-black text-center focus:ring-2 focus:ring-emerald-100 focus:bg-white focus:border-emerald-400 outline-none transition-all placeholder:text-slate-200"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Keterangan / Supplier</label>
                          <input
                            type="text"
                            id="cs-supplier"
                            placeholder="Contoh: Stok Pusat"
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-semibold focus:ring-2 focus:ring-emerald-100 focus:bg-white focus:border-emerald-400 outline-none transition-all"
                          />
                        </div>
                        <button
                          disabled={!selectedTransferProduct}
                          onClick={async () => {
                            const pId = selectedTransferProduct?.id;
                            const qtyInput = document.getElementById("cs-qty") as HTMLInputElement;
                            const supplierInput = document.getElementById("cs-supplier") as HTMLInputElement;
                            const qty = parseInt(qtyInput.value);
                            const supplier = supplierInput.value;
                            if (!pId || isNaN(qty) || qty <= 0) return alert("Masukkan qty!");
                            await handleStockAddition(pId, qty, supplier || "Input Kasir", profile.branchId);
                            qtyInput.value = "";
                            supplierInput.value = "";
                            setSelectedTransferProduct(null);
                          }}
                          className={`w-full py-2.5 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95 ${
                            selectedTransferProduct
                              ? "bg-emerald-600 text-white hover:bg-emerald-700"
                              : "bg-slate-100 text-slate-300 cursor-not-allowed"
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Simpan Stok Masuk
                        </button>
                      </div>

                      {/* aktivitas terakhir — tabel compact */}
                      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                        <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 sticky top-0">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Aktivitas Terakhir</span>
                        </div>
                        {(() => {
                          const acts = adjustments.filter((a) => a.branchId === profile.branchId).slice(0, 20);
                          if (acts.length === 0) return (
                            <div className="py-8 flex flex-col items-center opacity-20">
                              <Activity className="w-6 h-6 mb-1" />
                              <p className="text-[9px] font-black uppercase tracking-widest">Belum ada riwayat</p>
                            </div>
                          );
                          return (
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-slate-100">
                                  <th className="px-3 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Produk</th>
                                  <th className="px-3 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:table-cell">Ket.</th>
                                  <th className="px-3 py-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right w-12">Qty</th>
                                </tr>
                              </thead>
                              <tbody>
                                {acts.map((a, idx) => {
                                  const isPos = a.type === "STOCK_IN" || a.type === "TRANSFER_IN";
                                  const isSale = a.reason && a.reason.includes("SALE_");
                                  const prodName = products.find((p) => p.id === a.productId)?.name || "Produk";
                                  const timeStr = new Date(a.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
                                  return (
                                    <tr key={idx} className={`border-b border-slate-50 ${idx % 2 === 0 ? "" : "bg-slate-50/60"}`}>
                                      <td className="px-3 py-1.5">
                                        <p className="text-[10px] font-bold text-slate-800 uppercase leading-tight truncate max-w-[110px]">{prodName}</p>
                                        <p className="text-[9px] text-slate-400 font-mono">{timeStr}</p>
                                      </td>
                                      <td className="px-3 py-1.5 hidden sm:table-cell">
                                        <span className={`text-[9px] font-black uppercase tracking-wide ${isSale ? "text-blue-500" : isPos ? "text-emerald-500" : "text-rose-500"}`}>
                                          {isSale ? "Terjual" : a.reason ? a.reason.slice(0, 14) : isPos ? "Masuk" : "Keluar"}
                                        </span>
                                      </td>
                                      <td className="px-3 py-1.5 text-right">
                                        <span className={`text-[11px] font-black tabular-nums ${isPos ? "text-emerald-600" : "text-rose-600"}`}>
                                          {isPos ? "+" : "−"}{a.qty}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeMenu === "pos" && profile?.role === "CASHIER" && !shiftOpen && (
              <div data-ui-screen="pos-locked" className="ui-screen-pos-locked flex-1 flex items-center justify-center bg-slate-50 p-4">
                <div
                  role="status"
                  className="w-full max-w-sm rounded-3xl border border-amber-200 bg-white p-6 text-center shadow-xl"
                >
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <Lock className="h-6 w-6" />
                  </div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
                    Menu kasir terkunci
                  </h2>
                  <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
                    Shift belum dibuka atau sudah ditutup. Transaksi, transfer stok, dan refund hanya tersedia saat shift aktif.
                  </p>
                  <button
                    onClick={() => setActiveMenu("shift")}
                    className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-blue-700"
                  >
                    Buka halaman shift
                  </button>
                </div>
              </div>
            )}

            {activeMenu === "pos" && profile?.role === "CASHIER" && shiftOpen && (
              <div data-ui-screen="pos" className="ui-screen-pos flex-1 flex flex-col h-full overflow-hidden relative bg-slate-50">
                {/* 1. HEADER POS (Sub-navigation & Omzet) */}
                <div data-pos-header className="p-2 bg-white shadow-[0_6px_16px_rgba(184,194,208,0.4)] dark:shadow-[0_6px_16px_rgba(0,0,0,0.4)] shrink-0 relative z-50">
                  <div className="flex items-center justify-between mb-2 px-1 text-left">
                    <div className="text-left">
                      <h3 className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-0.5 text-left">
                        POS SYSTEM
                      </h3>
                      <p className="text-sm font-black text-slate-900 leading-none tracking-tight text-left">
                        PULSA & VOUCHER KASIR
                      </p>
                      {shiftOpen && (
                        <p className="text-[9px] font-bold text-blue-700 mt-1 truncate">
                          Penjaga bertugas: {cashierName.trim() || displayedAccountName}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {/* Cart total — only when cart has items */}
                      {cart.length > 0 && (
                        <div className="flex items-center gap-1.5 bg-blue-600 text-white px-2.5 py-1.5 rounded-xl shadow-sm">
                          <ShoppingCart className="w-3 h-3" />
                          <p className="text-[10px] font-black uppercase tracking-tight leading-none shrink-0">
                            Rp {cartTotal.toLocaleString("id-ID")}
                          </p>
                        </div>
                      )}
                      {/* Omzet + Bonus dalam 1 baris horizontal */}
                      <div className="flex items-center gap-1.5">
                        <div data-pos-shift-revenue className="flex items-center gap-1.5 bg-emerald-600 text-white px-2.5 py-1.5 rounded-xl shadow-sm">
                          <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                          <p className="flex flex-col items-start gap-0.5 leading-none">
                            <span data-pos-revenue-label className="text-[7px] font-black uppercase tracking-wider whitespace-nowrap">
                              Pendapatan {shiftOpen ? `Sif ${shiftType || ""}` : "Hari Ini"}
                            </span>
                            <strong data-pos-revenue-amount className="text-[12px] md:text-sm font-black tracking-tight tabular-nums whitespace-nowrap">
                              Rp {sales
                                .filter(
                                  (s) =>
                                    s.branchId === profile.branchId &&
                                    isRevenueEligibleSaleStatus(s.status) &&
                                    (shiftOpen && shiftStartTime
                                      ? new Date(s.createdAt || s.timestamp || 0).getTime() >= new Date(shiftStartTime).getTime()
                                      : (s.shiftDate || getLogicalShiftDate(new Date(s.createdAt || s.timestamp || 0))) === getLogicalShiftDate()),
                                )
                                .reduce((acc, s) => acc + (s.total || 0), 0)
                                .toLocaleString("id-ID")}
                            </strong>
                          </p>
                        </div>
                        <div
                          data-pos-bonus-summary
                          className="flex items-center gap-1 bg-blue-600 text-white px-2 py-1.5 rounded-xl shadow-sm cursor-pointer hover:bg-blue-700 active:scale-95 transition-all"
                          onClick={() => setActiveMenu("incentive")}
                          title="Lihat Detail Bonus Cabang"
                        >
                          <Sparkles className="w-3.5 h-3.5 shrink-0" />
                          <p className="flex flex-col items-start gap-0.5 leading-none">
                            <span data-pos-bonus-label className="text-[7px] font-black uppercase tracking-wider">Bonus</span>
                            <strong data-pos-bonus-amount className="text-[12px] md:text-sm font-black tracking-tight tabular-nums whitespace-nowrap">
                              Rp {(profile?.role === "ADMIN"
                                ? (branchSummaries[profile.branchId || ""]?.totalEarned || 0)
                                : (commissionsSummary?.totalEarned || 0)
                              ).toLocaleString("id-ID")}
                            </strong>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SUB-NAVIGATION TABS */}
                  <div data-pos-subnavigation className="flex gap-1 bg-slate-100 p-1 rounded-2xl shadow-[inset_2px_2px_5px_#b8c2d0,inset_-2px_-2px_5px_#ffffff] dark:shadow-[inset_2px_2px_5px_#1c1e24,inset_-2px_-2px_5px_#34373f]">
                    {[
                      { id: "billing", label: "Billing", icon: Calculator },
                      { id: "history", label: "Riwayat", icon: Clock },
                      {
                        id: "transfer",
                        label: "Transfer Stok",
                        icon: ArrowRightLeft,
                      },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setPosSubView(tab.id as any)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all font-black text-[9px] uppercase tracking-widest ${posSubView === tab.id ? "bg-white text-blue-600 shadow-sm border border-slate-200/70" : "text-slate-400 hover:text-slate-600"}`}
                      >
                        <tab.icon className="w-3.5 h-3.5" /> {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* CONTENT VIEWPORT */}
                <div data-pos-content-viewport className="flex-1 overflow-hidden relative flex flex-col">
                  {/* --- TAMPILAN BILLING (RE-DESIGNED PREMIUM POS COHESIVE SYSTEM) --- */}
                  {posSubView === "billing" && (
                    <div data-pos-billing className="flex-1 flex flex-col md:flex-row overflow-hidden h-full bg-slate-100">
                      {/* AREA KIRI: KATALOG PRODUK INTERAKTIF & FILTER KATEGORI RAILING (LEBIH LUAS - 60% Width) */}
                    <div data-pos-catalog className="flex-1 flex flex-col overflow-hidden relative border-r border-slate-200">
                        
                        {/* 1. BAR PENCARIAN & SCANNER UTAMA */}
                        <div data-pos-catalog-toolbar className="px-3 pt-3 pb-2.5 bg-slate-100 dark:bg-slate-900 shrink-0">
                          <div className="relative group">
                            <Search data-pos-search-icon className="w-4 h-4 absolute left-4 top-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors z-10" />
                            <input
                              data-pos-search-input
                              ref={searchInputRef}
                              type="text"
                              placeholder="CARI ATAU PINDAI BARCODE..."
                              value={searchTerm}
                              onChange={(e) => handleSearchChange(e.target.value)}
                              className="w-full bg-white dark:bg-slate-800 rounded-2xl pl-11 pr-[4.5rem] py-3 text-[11px] font-black focus:outline-none focus:ring-2 focus:ring-blue-400/50 transition-all uppercase tracking-tight placeholder:text-slate-400 text-slate-800 dark:text-slate-100 shadow-[inset_3px_3px_7px_#c5cdd8,inset_-2px_-2px_6px_#ffffff] dark:shadow-[inset_3px_3px_7px_#1c1e24,inset_-2px_-2px_6px_#34373f]"
                            />
                            
                            <div data-pos-search-actions className="absolute right-2 top-[7px] flex items-center gap-1">
                              {searchTerm && (
                                <button
                                  onClick={() => {
                                    setSearchTerm("");
                                    setSearchSuggestions([]);
                                    searchInputRef.current?.focus();
                                  }}
                                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                data-pos-scan-button
                                onClick={() => {
                                  setShowScanner(true);
                                  setScannerCallback(
                                    () => (code: string) => setSearchTerm(code),
                                  );
                                }}
                                className="p-2 bg-white dark:bg-slate-700 hover:bg-blue-600 text-slate-400 hover:text-white rounded-xl transition-all flex items-center justify-center shadow-[2px_2px_5px_#b8c2d0,-1px_-1px_4px_#ffffff] hover:shadow-none dark:shadow-[2px_2px_5px_#1c1e24,-1px_-1px_4px_#34373f]"
                                title="Buka Kamera Barcode"
                              >
                                <Camera className="w-4 h-4" />
                              </button>
                            </div>

                            {/* DROPDOWN HASIL PENCARIAN CEPAT */}
                            {searchSuggestions.length > 0 && (
                              <div data-pos-search-results className="app-solid absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 shadow-2xl rounded-2xl overflow-hidden z-[100] animate-in fade-in slide-in-from-top-1 duration-200">
                                <div data-pos-search-result-list className="max-h-[320px] overflow-y-auto">
                                  {/* Header berbagi area gulir agar lebar kolom selalu sama */}
                                  <div data-pos-search-table-header className="sticky top-0 z-10 grid grid-cols-[1.5rem_minmax(0,1fr)_3.25rem_5rem] gap-0 border-b border-slate-300 bg-white pl-[3px]">
                                    <span data-pos-search-column="number" className="border-r border-slate-200 bg-slate-100 py-2 text-[9px] font-black uppercase tracking-wide text-center text-slate-600">#</span>
                                    <span data-pos-search-column="product" className="border-r border-slate-200 bg-blue-50 px-2 py-2 text-[9px] font-black uppercase tracking-wide text-blue-800">Nama Produk</span>
                                    <span data-pos-search-column="stock" className="border-r border-slate-200 bg-emerald-50 py-2 text-[9px] font-black uppercase tracking-wide text-center text-emerald-800">Stok</span>
                                    <span data-pos-search-column="price" className="bg-indigo-50 px-2 py-2 text-[9px] font-black uppercase tracking-wide text-right text-indigo-800">Harga</span>
                                  </div>
                                  {searchSuggestions.slice(0, 15).map((p, idx) => {
                                    const stock = getBranchStock(profile?.branchId || "", p.id);
                                    const hasDiscount = p.discountPrice > 0;
                                    const price = hasDiscount ? p.discountPrice : p.sellingPrice;
                                    const isEmpty = stock <= 0;
                                    const rowBg = idx % 2 === 0 ? "bg-white" : "bg-sky-50/70";
                                    return (
                                    <button
                                      data-pos-search-result-row
                                      key={p.id}
                                      onClick={() => {
                                        addToCart(p);
                                        setSearchTerm("");
                                        setSearchSuggestions([]);
                                        searchInputRef.current?.focus();
                                      }}
                                      className={`w-full min-h-11 text-left grid grid-cols-[1.5rem_minmax(0,1fr)_3.25rem_5rem] gap-0 items-center py-1.5 border-l-[3px] border-l-transparent border-b border-slate-200 last:border-0 hover:border-l-blue-600 hover:bg-blue-50 group transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${rowBg}`}
                                    >
                                      {/* No urut */}
                                      <span data-pos-search-column="number" className={`flex self-stretch items-center justify-center border-r border-slate-200 text-[9px] font-bold text-slate-400 group-hover:text-slate-500 tabular-nums ${idx % 2 === 0 ? "bg-slate-50" : "bg-blue-50"}`}>{idx + 1}</span>

                                      {/* Nama produk */}
                                      <span data-pos-search-column="product" className={`flex min-w-0 self-stretch items-center border-r border-slate-200 px-2 py-1 ${rowBg}`}>
                                        <span className={`line-clamp-2 text-[11px] font-black uppercase tracking-normal leading-tight text-left transition-colors ${isEmpty ? "text-slate-400 line-through decoration-slate-400" : "text-slate-900"} group-hover:text-blue-800 group-hover:no-underline`}>
                                          {getProductName(p)}
                                          {p.masterSN && <span className="ml-1 font-mono text-[8px] text-purple-400 group-hover:text-purple-200">·{p.masterSN}</span>}
                                        </span>
                                      </span>

                                      {/* Stok */}
                                      <span data-pos-search-column="stock" className={`flex self-stretch items-center justify-center border-r border-slate-200 text-[10px] font-black text-center tabular-nums transition-colors ${isEmpty ? "bg-rose-50 text-rose-600 group-hover:text-rose-700" : "bg-emerald-50 text-emerald-700 group-hover:text-emerald-800"}`}>
                                        {isEmpty ? "HABIS" : `${stock}`}
                                      </span>

                                      {/* Harga */}
                                      <div data-pos-search-column="price" className="flex self-stretch flex-col justify-center bg-indigo-50 pr-1 text-right">
                                        <span className={`block text-[10.5px] font-black tabular-nums font-mono transition-colors ${isEmpty ? "text-slate-400" : "text-indigo-900"} group-hover:text-indigo-900`}>
                                          {price.toLocaleString("id-ID")}
                                        </span>
                                        {hasDiscount && (
                                          <span className="text-[8px] font-bold text-slate-400 group-hover:text-slate-500 line-through font-mono block">
                                            {p.sellingPrice.toLocaleString("id-ID")}
                                          </span>
                                        )}
                                      </div>
                                    </button>
                                    );
                                  })}
                                  {searchTerm.length >= 3 && (
                                    <button 
                                      data-pos-search-deep-button
                                      onClick={handleFullDatabaseSearch}
                                      disabled={isSearchingProducts}
                                      className="w-full px-3 py-2 bg-slate-50 text-blue-600 font-black text-[9px] uppercase tracking-widest hover:bg-blue-100 flex items-center justify-center gap-2 border-t border-slate-200 disabled:opacity-50"
                                    >
                                      {isSearchingProducts ? <Loader2 className="w-3 h-3 animate-spin text-blue-600"/> : <Search className="w-3 h-3 text-blue-600"/>}
                                      Cari Mendalam di Database Pusat
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                          {scanIndicator && (
                            <div className="mt-2 bg-emerald-600 text-white text-[8px] p-2 rounded-lg font-black uppercase text-center animate-pulse shadow-sm flex items-center justify-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                              {scanIndicator}
                            </div>
                          )}
                        </div>

                        {/* 1.5 PANEL PRODUK TERLARIS — compact strip */}
                        {bestSellers.length > 0 && !searchTerm && (
                          <div data-pos-best-sellers className="bg-white px-2 py-1.5 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                            <TrendingUp className="h-3 w-3 shrink-0 text-blue-500" aria-hidden="true" />
                            {bestSellers.map(p => (
                              <button
                                key={p.id}
                                onClick={() => addToCart(p)}
                                className="flex-shrink-0 bg-white hover:bg-blue-50 active:scale-95 border border-slate-300 hover:border-blue-400 px-2 py-1 rounded-lg text-left transition-colors"
                              >
                                <p className="text-[8px] font-black uppercase text-slate-700 truncate max-w-[90px] leading-none mb-0.5">{getProductName(p)}</p>
                                <p className="text-[8px] text-slate-500 font-mono leading-none">Rp {p.sellingPrice.toLocaleString("id-ID")}</p>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* 2. CAPSULE SCROLL BAR KATEGORI (INTERAKTIF & INDAH) */}
                        <div data-pos-category-nav className="bg-white px-3 py-2 border-b border-slate-200/60 shrink-0 flex gap-1.5 overflow-x-auto no-scrollbar scroll-smooth items-center">
                          <button
                            onClick={() => {
                              setPosSelectedCategory("Semua");
                              setPosSelectedBrand("Semua");
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-colors ${
                              posSelectedCategory === "Semua"
                                ? "bg-blue-600 text-white"
                                : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                            }`}
                          >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            <span>SEMUA</span>
                            <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded-full ${posSelectedCategory === "Semua" ? "bg-white/25 text-white" : "bg-slate-200 text-slate-600"}`}>
                              {products.filter(p => {
                                const visibleIds = p.visibleBranchIds || "*";
                                return visibleIds === "*" || (profile?.branchId && visibleIds.split(",").map((id: string) => id.trim()).includes(profile.branchId));
                              }).length}
                            </span>
                          </button>

                          {DEFAULT_CATEGORIES.map((cat) => {
                            const matchCount = products.filter(p => {
                              const visibleIds = p.visibleBranchIds || "*";
                              const isVisible = visibleIds === "*" || (profile?.branchId && visibleIds.split(",").map((id: string) => id.trim()).includes(profile.branchId));
                              return isVisible && p.category === cat;
                            }).length;

                            return (
                              <button
                                key={cat}
                                onClick={() => {
                                  setPosSelectedCategory(cat);
                                  setPosSelectedBrand("Semua");
                                }}
                                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-colors ${
                                  posSelectedCategory === cat
                                    ? "bg-blue-600 text-white"
                                    : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                                }`}
                              >
                                <span>{cat}</span>
                                {matchCount > 0 && (
                                  <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded-full ${posSelectedCategory === cat ? "bg-white/25 text-white" : "bg-slate-200 text-slate-600"}`}>
                                    {matchCount}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* SUB-BAR FILTER MERK KHUSUS AKSESORIS */}
                        {posSelectedCategory === "Aksesoris" && (
                          <div data-pos-brand-filter className="bg-slate-50/50 px-3 py-1.5 border-b border-slate-200/45 shrink-0 flex gap-1 overflow-x-auto no-scrollbar items-center">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mr-1">Brand:</span>
                            {["Semua", "Robot", "Vivan", "Foomee", "Acome", "Ugreen", "Baseus", "Anker", "Lenyes", "Jete"].map((brand) => (
                              <button
                                key={brand}
                                onClick={() => setPosSelectedBrand(brand)}
                                className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all ${
                                  posSelectedBrand === brand
                                    ? "bg-white border-blue-500 text-blue-600 shadow-sm font-black"
                                    : "bg-transparent border-slate-250 text-slate-400 hover:text-slate-600 hover:border-slate-350"
                                }`}
                              >
                                {brand}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* 3. SHELF GRID UTAMA: PRODUK DAFTAR DI CABANG INI */}
                        <div data-pos-product-shelf className="flex-1 overflow-y-auto min-h-0 bg-slate-50 relative">
                          <div className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[8px] font-black text-slate-450 uppercase tracking-widest flex items-center gap-1">
                                <LayoutList className="w-3 h-3 text-slate-400" />
                                Katalog Rak: {posSelectedCategory}
                                {posSelectedCategory === "Aksesoris" && posSelectedBrand !== "Semua" && ` • ${posSelectedBrand}`}
                              </p>
                              <p className="text-[8px] font-black text-slate-400 lowercase tracking-tight">
                                {posFilteredProducts.length} produk di cabang
                              </p>
                            </div>

                            {posFilteredProducts.length === 0 ? (
                              <div className="py-24 text-center flex flex-col items-center justify-center max-w-[320px] mx-auto opacity-70">
                                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4 border border-slate-150 shadow-inner">
                                  <Boxes className="w-6 h-6 text-slate-400" />
                                </div>
                                <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest mb-1">Stok Rak Kosong</h4>
                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider leading-relaxed">
                                  Tidak ada item yang cocok dengan filter atau kata kunci di cabang ini. Silakan ubah filter kategori atau bersihkan pencarian.
                                </p>
                              </div>
                            ) : (
                              <div data-pos-product-grid className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                                {posFilteredProducts
                                  .filter(p => {
                                    if (posSelectedCategory === "Aksesoris" && posSelectedBrand !== "Semua") {
                                      return p.brand?.toLowerCase() === posSelectedBrand.toLowerCase();
                                    }
                                    return true;
                                  })
                                  .map((p) => {
                                    const stock = getBranchStock(profile?.branchId || "", p.id);
                                    const isOutOfStock = stock <= 0;
                                    const hasDiscount = p.discountPrice > 0;
                                    const price = hasDiscount ? p.discountPrice : p.sellingPrice;
                                    const expiry = getExpiryInfo(p.expiredAt);
                                    
                                    return (
                                      <button
                                        data-pos-product-card
                                        key={p.id}
                                        onClick={async () => {
                                          if (isOutOfStock) {
                                            const confirmAdd = await triggerConfirm(`Peringatan: Stok ${p.name} di sistem terdeteksi kosong (0 Pcs).\n\nTetap tambahkan ke nota penjualan?`);
                                            if (!confirmAdd) return;
                                          }
                                          addToCart(p);
                                          setScanIndicator(`Ditambahkan: ${getProductName(p)}`);
                                          setTimeout(() => setScanIndicator(null), 1000);
                                        }}
                                        className={`group text-left bg-white border border-slate-200 rounded-xl p-2.5 min-h-[100px] flex flex-col justify-between transition-colors shadow-sm hover:border-blue-500 hover:bg-blue-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 active:bg-blue-100 cursor-pointer relative overflow-hidden ${isOutOfStock ? "opacity-60" : ""}`}
                                      >
                                        {/* Expiry ribbon */}
                                        {expiry && (
                                          <div className={`absolute top-0 left-0 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest rounded-br-lg leading-none z-10 ${
                                            expiry.urgency === "expired"  ? "bg-rose-600 text-white" :
                                            expiry.urgency === "critical" ? "bg-rose-500 text-white" :
                                                                            "bg-amber-400 text-amber-900"
                                          }`}>
                                            {expiry.urgency === "expired" ? "⚠ KADALUARSA" : `⚠ ${expiry.label}`}
                                          </div>
                                        )}

                                        <div className={expiry ? "pt-3.5" : ""}>
                                          {/* Mini Tag Brand / Provider */}
                                          <div className="flex justify-between items-start mb-1.5 gap-1.5">
                                            <OperatorBadge brand={
                                              ["Voucher","Kartu Perdana Kuota","Kartu Perdana Biasa"].includes(p.category)
                                                ? (p.provider || p.brand || p.category)
                                                : (p.brand || p.category || "Umum")
                                            } />
                                            
                                              <span data-pos-product-stock className={`text-[8px] font-black px-2 py-1 rounded-md leading-none ${
                                              isOutOfStock 
                                                ? "bg-rose-50 text-rose-600" 
                                                : stock < 5 
                                                  ? "bg-amber-100 text-amber-800" 
                                                  : "bg-emerald-50 text-emerald-600"
                                            }`}>
                                              {isOutOfStock ? "HABIS" : `STOK: ${stock}`}
                                            </span>
                                          </div>

                                          <h5 className="text-[11px] md:text-xs font-black text-slate-900 uppercase leading-snug tracking-normal mb-2 group-hover:text-blue-700 transition-colors line-clamp-2 min-h-[2.4em]">
                                            {getProductName(p)}
                                          </h5>
                                        </div>

                                        <div className="mt-auto pt-2 border-t border-slate-200 flex items-end justify-between">
                                          <div>
                                            {hasDiscount && (
                                              <p className="text-[7.5px] font-black text-slate-400 line-through leading-none mb-0.5">
                                                Rp {p.sellingPrice.toLocaleString("id-ID")}
                                              </p>
                                            )}
                                            <p className="text-sm font-black text-slate-900 tracking-tight leading-none">
                                              Rp {price.toLocaleString("id-ID")}
                                            </p>
                                          </div>
                                          <div data-pos-product-add className="w-7 h-7 bg-blue-50 group-hover:bg-blue-600 text-blue-700 group-hover:text-white rounded-lg flex items-center justify-center transition-colors border border-blue-200 group-hover:border-blue-600">
                                            <Plus className="w-4 h-4 group-hover:stroke-[3]" />
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* AREA KANAN: NOTA TAGIHAN & CHECKOUT KASIR PERSISTEN (370px - 410px Width di Desktop) */}
                      <div data-pos-cart className="w-full md:w-[370px] lg:w-[410px] bg-white flex flex-col shrink-0 overflow-hidden relative z-30 border-l border-slate-200">
                        
                        {/* HEADER DAFTAR NOTA */}
                        <div data-pos-cart-header className="p-3 border-b border-slate-150 flex justify-between items-center bg-white shrink-0">
                          <div className="flex items-center gap-1.5">
                            <ShoppingCart className="w-4 h-4 text-slate-650" />
                            <h4 className="text-[10px] font-black text-slate-850 uppercase tracking-widest leading-none">
                              Nota Pelanggan ({cart.reduce((s, i) => s + i.qty, 0)})
                            </h4>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setShowHeldList(true)}
                              className="flex items-center gap-1 text-[9px] font-black text-amber-700 hover:text-amber-900 transition-colors uppercase tracking-widest hover:underline"
                            >
                              <Hand className="w-3 h-3" />
                              Ditahan
                              {heldTransactions.length > 0 && (
                                <span className="bg-amber-500 text-white rounded-full min-w-[14px] h-[14px] px-1 flex items-center justify-center text-[8px] font-black leading-none">
                                  {heldTransactions.length}
                                </span>
                              )}
                            </button>
                            {cart.length > 0 && (
                              <button
                                onClick={async () => {
                                  const confirmClear = await triggerConfirm("Batal seluruh nota dan kosongkan keranjang?");
                                  if (confirmClear) {
                                    setCart([]);
                                  }
                                }}
                                className="text-[9px] font-black text-rose-650 hover:text-rose-855 transition-colors uppercase tracking-widest hover:underline"
                              >
                                Bersihkan
                              </button>
                            )}
                          </div>
                        </div>

                        {/* LIST ACTIVE ITEMS */}
                        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 min-h-0">
                          {cart.length === 0 ? (
                            <div className="py-20 px-6 text-center flex flex-col items-center justify-center opacity-70">
                              <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-3 shadow-inner">
                                <Calculator className="w-6 h-6 text-slate-300" />
                              </div>
                              <h5 className="text-[9px] font-black text-slate-750 uppercase tracking-widest mb-1">Nota Kosong</h5>
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-relaxed">
                                Silakan ketik nama produk, scan barcode, atau tap katalog di rak sebelah kiri untuk mengisi penjualan nota.
                              </p>
                            </div>
                          ) : (
                            <div className="divide-y divide-slate-100 bg-white">
                              {cart.map((item, idx) => {
                                const stockVal = getBranchStock(profile?.branchId || "", item.product.id);
                                const isDiscont = item.product.discountPrice > 0;
                                const itemPrice = isDiscont ? item.product.discountPrice : item.product.sellingPrice;
                                const itemSubtotal = itemPrice * item.qty;

                                return (
                                  <div
                                    key={item.product.id + (item.sn || '') + idx}
                                    className="p-3 hover:bg-slate-50/70 transition-colors flex gap-2.5 items-start"
                                  >
                                    <button
                                      onClick={() => removeFromCart(item.product.id, item.sn)}
                                      className="p-1.5 mt-1 text-slate-350 hover:text-red-650 rounded-lg transition-colors group shrink-0"
                                      title="Hapus dari Nota"
                                    >
                                      <Trash2 className="w-4 h-4 text-slate-300 group-hover:text-red-500" />
                                    </button>

                                    <div className="flex-1 min-w-0 text-left">
                                      <div className="flex items-start gap-1 justify-between">
                                        <h6 className="text-[10px] font-black text-slate-800 uppercase leading-snug truncate">
                                          {getProductName(item.product)}
                                        </h6>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[9px] text-left">
                                        <span className="font-bold text-blue-650 text-left">
                                          @Rp {itemPrice.toLocaleString("id-ID")}
                                        </span>
                                        <span className="text-slate-300">•</span>
                                        <span className="text-slate-400 font-medium">
                                          Sub: Rp {itemSubtotal.toLocaleString("id-ID")}
                                        </span>
                                        {item.sn && (
                                          <span className="bg-slate-800 text-white rounded px-1.5 py-0.5 text-[7.5px] font-black tracking-widest uppercase">
                                            SN: {item.sn}
                                          </span>
                                        )}
                                      </div>
                                      {(() => {
                                        const exp = getExpiryInfo(item.product.expiredAt);
                                        if (!exp) return null;
                                        return (
                                          <div className={`flex items-center gap-1 mt-1 text-[8.5px] font-black uppercase tracking-wide ${
                                            exp.urgency === "expired"  ? "text-rose-600" :
                                            exp.urgency === "critical" ? "text-rose-500" :
                                                                         "text-amber-600"
                                          }`}>
                                            <span>⚠</span>
                                            <span>{exp.urgency === "expired" ? "Kartu sudah kadaluarsa" : `Kadaluarsa ${exp.label} lagi`}</span>
                                          </div>
                                        );
                                      })()}
                                    </div>

                                    {/* CONTROLLER JUMLAH */}
                                    <div className="flex items-center gap-1.5 shrink-0 scale-90">
                                      <button
                                        onClick={() => updateCartQty(item.product.id, -1)}
                                        className="w-7 h-7 bg-slate-50 text-slate-400 hover:text-red-600 rounded-lg transition-all active:scale-90 flex items-center justify-center font-bold shadow-[2px_2px_5px_#b8c2d0,-2px_-2px_5px_#ffffff] dark:shadow-[2px_2px_5px_#1c1e24,-2px_-2px_5px_#34373f] active:shadow-[inset_2px_2px_4px_#b8c2d0,inset_-2px_-2px_4px_#ffffff] dark:active:shadow-[inset_2px_2px_4px_#1c1e24,inset_-2px_-2px_4px_#34373f]"
                                      >
                                        <Minus className="w-3.5 h-3.5" />
                                      </button>
                                      <span className="text-[10.5px] font-black w-6 text-center text-slate-900 leading-none">
                                        {item.qty}
                                      </span>
                                      <button
                                        onClick={() => updateCartQty(item.product.id, 1)}
                                        className="w-7 h-7 bg-slate-50 text-slate-400 hover:text-emerald-600 rounded-lg transition-all active:scale-90 flex items-center justify-center font-bold shadow-[2px_2px_5px_#b8c2d0,-2px_-2px_5px_#ffffff] dark:shadow-[2px_2px_5px_#1c1e24,-2px_-2px_5px_#34373f] active:shadow-[inset_2px_2px_4px_#b8c2d0,inset_-2px_-2px_4px_#ffffff] dark:active:shadow-[inset_2px_2px_4px_#1c1e24,inset_-2px_-2px_4px_#34373f]"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* PANEL TOTAL & TOMBOL AKSI */}
                        <div data-pos-cart-summary className="bg-white border-t border-slate-200 shrink-0">

                          {/* TOTAL TAGIHAN */}
                          <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Tagihan</span>
                            <span className="text-2xl font-black text-slate-900 tracking-tight leading-none">
                              Rp {cartTotal.toLocaleString("id-ID")}
                            </span>
                          </div>

                          {/* BONUS INSENTIF */}
                          {cart.some(i => (i.product.commissionAmount || 0) > 0) && (
                                          <div data-pos-cart-incentive className="mx-4 mb-3 px-3 py-1.5 bg-blue-50 rounded-lg flex items-center justify-between">
                              <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Insentif Kamu</span>
                              <span className="text-[11px] font-black text-blue-700">
                                +Rp {cart.reduce((a, i) => a + ((i.product.commissionAmount || 0) * i.qty), 0).toLocaleString("id-ID")}
                              </span>
                            </div>
                          )}

                          {/* TOMBOL AKSI */}
                          <div className="px-3 pb-3 flex flex-col gap-2">
                            <button
                              data-pos-checkout
                              onClick={handleCheckout}
                              disabled={cart.length === 0 || isProcessingCheckout}
                              className="w-full bg-emerald-600 hover:bg-emerald-700 active:shadow-[inset_3px_3px_6px_rgba(0,0,0,0.25)] disabled:opacity-35 text-white font-black py-4 rounded-2xl text-[11px] shadow-[0_0_20px_2px_rgba(16,185,129,0.5),4px_4px_10px_#b8c2d0,-4px_-4px_10px_#ffffff] dark:shadow-[0_0_20px_2px_rgba(16,185,129,0.5),4px_4px_10px_#1c1e24,-4px_-4px_10px_#34373f] disabled:shadow-none flex items-center justify-center gap-2 uppercase tracking-widest transition-all cursor-pointer"
                            >
                              {isProcessingCheckout ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Banknote className="w-4 h-4" />
                              )}
                              <span>{isProcessingCheckout ? "Memproses..." : "Bayar & Cetak Nota"}</span>
                            </button>

                            <button
                              data-pos-hold
                              onClick={holdCurrentCart}
                              disabled={cart.length === 0 || isProcessingCheckout}
                              className="w-full bg-slate-50 hover:bg-amber-50 active:shadow-[inset_3px_3px_6px_#b8c2d0,inset_-3px_-3px_6px_#ffffff] dark:active:shadow-[inset_3px_3px_6px_#1c1e24,inset_-3px_-3px_6px_#34373f] disabled:opacity-35 text-slate-500 hover:text-amber-700 font-black py-3 rounded-2xl text-[10px] shadow-[4px_4px_9px_#b8c2d0,-4px_-4px_9px_#ffffff] dark:shadow-[4px_4px_9px_#1c1e24,-4px_-4px_9px_#34373f] flex items-center justify-center gap-2 uppercase tracking-widest transition-all cursor-pointer"
                            >
                              <Hand className="w-4 h-4" />
                              <span>Tahan Transaksi</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* CATALOG MOBILE DRAWER OVERLAY (HANYA AKTIF JIKA TERSEGMENTASI DI SCREEN KECIL) */}
                      {showMobileCart && (
                        <div className="fixed inset-0 z-[100] bg-slate-900/60 animate-in fade-in duration-300 flex justify-end">
                          <div className="w-[290px] md:w-[400px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-500 ease-out">
                            <div className="p-4 border-b border-slate-150 flex items-center justify-between">
                              <div>
                                <h4 className="text-xs font-black uppercase tracking-widest text-slate-800">
                                  Katalog Produk Cabang
                                </h4>
                                <p className="text-[8px] font-bold text-blue-600 uppercase tracking-tighter mt-1">Terlaris dan Rekomendasi</p>
                              </div>
                              <button
                                onClick={() => setShowMobileCart(false)}
                                className="w-9 h-9 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors"
                              >
                                <X className="w-5 h-5 text-slate-500" />
                              </button>
                            </div>

                            {/* Catalog Search */}
                            <div className="p-3 border-b border-slate-50">
                               <div className="relative">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                  <input 
                                    type="text"
                                    placeholder="Cari produk terlaris..."
                                    className="w-full pl-9 pr-4 py-2.5 bg-slate-100 border-none rounded-xl text-xs font-bold"
                                    value={catalogSearch}
                                    onChange={(e) => setCatalogSearch(e.target.value)}
                                  />
                               </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-3 text-left">
                              <div className="grid grid-cols-1 gap-2.5">
                                {sortedProductsBySales
                                  .filter(p => {
                                    if (!catalogSearch) return true;
                                    const searchLower = catalogSearch.toLowerCase();
                                    const searchWords = searchLower.split(/\s+/).filter(Boolean);
                                    const name = (p.name || "").toLowerCase();
                                    const barcode = (p.barcode || "").toLowerCase();
                                    const brand = (p.brand || "").toLowerCase();
                                    const category = (p.category || "").toLowerCase();
                                    const provider = (p.provider || "").toLowerCase();
                                    
                                    return searchWords.every(word => 
                                      name.includes(word) || 
                                      barcode.includes(word) ||
                                      brand.includes(word) ||
                                      category.includes(word) ||
                                      provider.includes(word)
                                    );
                                  })
                                  .sort((a, b) => {
                                    if (!catalogSearch) return 0;
                                    
                                    const nameA = (a.name || "").toLowerCase();
                                    const nameB = (b.name || "").toLowerCase();
                                    const searchLower = catalogSearch.toLowerCase();
                                    const searchWords = searchLower.split(/\s+/).filter(Boolean);

                                    const startsA = nameA.startsWith(searchLower);
                                    const startsB = nameB.startsWith(searchLower);
                                    if (startsA && !startsB) return -1;
                                    if (!startsA && startsB) return 1;

                                    const priceA = a.discountPrice > 0 ? a.discountPrice : a.sellingPrice;
                                    const priceB = b.discountPrice > 0 ? b.discountPrice : b.sellingPrice;
                                    return priceA - priceB;
                                  })
                                  .map((p) => {
                                    const stock = getBranchStock(profile?.branchId || "", p.id);
                                    const isOutOfStock = stock <= 0;

                                    return (
                                      <button
                                        key={p.id}
                                        onClick={async () => {
                                          if (isOutOfStock) {
                                            const confirmAdd = await triggerConfirm(`Peringatan: Stok ${p.name} di sistem kosong.\n\nTetap tambahkan ke nota penjualan?`);
                                            if (!confirmAdd) return;
                                          }
                                          addToCart(p);
                                          setScanIndicator(`Ditambah: ${p.name}`);
                                          setTimeout(() => setScanIndicator(null), 1000);
                                        }}
                                        className="w-full text-left p-2.5 bg-white border border-slate-200 rounded-2xl flex items-center gap-3 hover:border-blue-500 hover:shadow-md transition-all active:scale-[0.98] group"
                                      >
                                        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                          {p.category === "Voucher" ? (
                                            <Wifi className="w-4 h-4" />
                                          ) : (
                                            <Smartphone className="w-4 h-4" />
                                          )}
                                        </div>
                                        <div className="min-w-0 flex-1 flex flex-col justify-between text-left">
                                          <p className="text-[9.5px] font-black uppercase text-slate-800 leading-tight">
                                            {getProductName(p)}
                                            {p.salesCount > 0 && <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 bg-amber-500 text-white text-[7px] rounded font-black tracking-widest uppercase"><TrendingUp className="w-2.5 h-2.5" aria-hidden="true" /> Terlaris ({p.salesCount})</span>}
                                            {p.masterSN && <span className="block text-[7px] text-blue-500 font-bold mt-0.5">SN: {p.masterSN}</span>}
                                          </p>
                                          <div className="flex items-center justify-between mt-1">
                                             <p className="text-[9px] font-bold text-blue-600">
                                                Rp ${p.sellingPrice.toLocaleString("id-ID")}
                                             </p>
                                             <div className="bg-slate-100 text-[8px] font-black px-1.5 py-0.5 rounded text-slate-500">
                                               + TAMBAH
                                             </div>
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* --- TAMPILAN RIWAYAT (HISTORY) --- */}
                  {posSubView === "history" && (
                    <div data-pos-history-view className="flex-1 overflow-y-auto bg-slate-50 p-2 space-y-2 text-left">
                      <div data-pos-history-card className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm w-full max-w-4xl mx-auto text-left">
                        <div className="flex items-center justify-between mb-3 px-1 text-left">
                          <h4 className="text-[9px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5 text-left">
                            <Clock className="w-3 h-3 text-blue-600 text-left" />{" "}
                            Rekap Trx Hari Ini
                          </h4>
                          <span className="text-[7px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-widest">
                            Live Updates
                          </span>
                        </div>
                        {/* Tabel Excel — riwayat transaksi kompak */}
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table data-pos-history-table className="w-full text-left border-collapse text-[8px]">
                            <thead>
                              <tr className="bg-blue-600 text-white">
                                <th className="py-1.5 px-2 font-black uppercase tracking-widest text-center w-5">#</th>
                                <th className="py-1.5 px-2 font-black uppercase tracking-widest">Nota</th>
                                <th className="py-1.5 px-2 font-black uppercase tracking-widest whitespace-nowrap">Waktu</th>
                                <th className="py-1.5 px-2 font-black uppercase tracking-widest">Produk</th>
                                <th className="py-1.5 px-2 font-black uppercase tracking-widest text-right whitespace-nowrap">Total</th>
                                <th className="py-1.5 px-2 font-black uppercase tracking-widest text-center">Status</th>
                                <th className="py-1.5 px-2 font-black uppercase tracking-widest text-center">Aksi</th>
                              </tr>
                            </thead>
                            {sales
                              .filter(
                                (s) =>
                                  s.branchId === profile.branchId &&
                                  (shiftOpen && shiftStartTime
                                    ? new Date(s.createdAt || s.timestamp || 0).getTime() >= new Date(shiftStartTime).getTime()
                                    : (s.shiftDate || getLogicalShiftDate(new Date(s.createdAt || s.timestamp || 0))) === (shiftLogicalDate || getLogicalShiftDate())),
                              )
                              .sort(
                                (a, b) =>
                                  new Date(b.createdAt || b.timestamp || 0).getTime() -
                                  new Date(a.createdAt || a.timestamp || 0).getTime(),
                              )
                              .map((sale, sIdx) => (
                                // Setiap transaksi = 1 <tbody>: baris header + sub-baris item
                                <tbody key={sale.id} className={sIdx % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                                  {/* Baris ringkasan transaksi */}
                                  <tr className="border-t border-slate-100">
                                    <td className="py-1 px-2 text-slate-400 font-black text-center">{sIdx + 1}</td>
                                    <td className="py-1 px-2 font-black text-slate-800 whitespace-nowrap">
                                      #{sale.id?.slice(-6).toUpperCase()}
                                    </td>
                                    <td className="py-1 px-2 font-bold text-slate-500 whitespace-nowrap">
                                      {new Date(sale.createdAt || sale.timestamp || 0).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                                    </td>
                                    <td className="py-1 px-2 text-slate-400 font-bold">
                                      {sale.items?.length || 0} item
                                    </td>
                                    <td className="py-1 px-2 font-black text-slate-800 text-right whitespace-nowrap">
                                      Rp {(sale.total || 0).toLocaleString("id-ID")}
                                    </td>
                                    <td className="py-1 px-2 text-center">
                                      <span className={`font-black uppercase px-1.5 py-0.5 rounded-sm leading-none ${sale.status === "refunded" ? "bg-red-100 text-red-600" : sale.status === "cancelled" ? "bg-slate-100 text-slate-600" : sale.status === "success" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                        {sale.status === "refunded" ? "REFUND" : sale.status === "cancelled" ? "BATAL" : sale.status === "success" ? "OK" : "LAINNYA"}
                                      </span>
                                    </td>
                                    <td className="py-1 px-2 text-center">
                                      {profile?.role === "CASHIER" && (
                                        <button
                                          onClick={() => handleRefund(sale)}
                                          disabled={sale.status === "refunded" || sale.items?.every((i: any) => i.refunded)}
                                          className="px-2 py-0.5 text-[7px] font-black uppercase tracking-widest rounded border border-red-200 text-red-500 bg-white hover:bg-red-50 disabled:opacity-25 disabled:grayscale transition-all whitespace-nowrap"
                                        >
                                          {sale.status === "refunded" ? "✓ Done" : "Refund"}
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                  {/* Sub-baris per item */}
                                  {sale.items?.map((item: any, iIdx: number) => (
                                    <tr key={iIdx} className="border-t border-slate-50">
                                      <td className="py-0.5 px-2" />
                                      <td className="py-0.5 px-2 text-slate-300 select-none">└</td>
                                      <td className="py-0.5 px-2" />
                                      <td className="py-0.5 px-2">
                                        <span className={`font-bold ${item.refunded ? "line-through opacity-40 text-slate-400" : "text-slate-500"}`}>
                                          {item.product?.name || item.name || "Produk"}
                                        </span>
                                        {item.sn ? (
                                          <span className={`ml-1 font-bold ${item.refunded ? "text-slate-300" : "text-blue-400"}`}>
                                            · {item.sn}
                                          </span>
                                        ) : null}
                                        {item.refunded && (
                                          <span className="ml-1 text-[5px] bg-red-400 text-white px-1 py-0.5 rounded-sm font-black align-middle">R</span>
                                        )}
                                      </td>
                                      <td className="py-0.5 px-2 text-right whitespace-nowrap">
                                        <span className={`font-bold ${item.refunded ? "line-through opacity-40 text-slate-400" : "text-slate-500"}`}>
                                          x{item.qty} · Rp {(item.price * item.qty).toLocaleString("id-ID")}
                                        </span>
                                      </td>
                                      <td className="py-0.5 px-2" />
                                      <td className="py-0.5 px-2" />
                                    </tr>
                                  ))}
                                </tbody>
                              ))}
                            {/* Empty state */}
                            {sales.filter(
                              (s) =>
                                s.branchId === profile.branchId &&
                                (shiftOpen && shiftStartTime
                                  ? new Date(s.createdAt || s.timestamp || 0).getTime() >= new Date(shiftStartTime).getTime()
                                  : (s.shiftDate || getLogicalShiftDate(new Date(s.createdAt || s.timestamp || 0))) === (shiftLogicalDate || getLogicalShiftDate())),
                            ).length === 0 && (
                              <tbody>
                                <tr>
                                  <td colSpan={7} className="py-12 text-center opacity-30 font-black uppercase tracking-[0.2em]">
                                    Belum ada transaksi
                                  </td>
                                </tr>
                              </tbody>
                            )}
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* --- TAMPILAN MAINTENANCE (STOK OPNAME) --- */}
                  {posSubView === "maintenance" && (
                    <div className="flex-1 overflow-y-auto bg-slate-50 p-2 space-y-2 text-left">
                      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm w-full max-w-xl mx-auto text-left shadow-lg">
                        <div className="flex items-center gap-2.5 mb-4 text-left">
                          <div className="w-8 h-8 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-100 text-left shrink-0">
                            <AlertTriangle className="w-4 h-4 text-left" />
                          </div>
                          <div className="text-left">
                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight leading-none mb-1 text-left">
                              Stok Opname
                            </h4>
                            <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest leading-none text-left">
                              Koreksi Stok Fisik
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3 text-left">
                          <div className="text-left">
                            <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block text-left">
                              Produk:
                            </label>
                            <CustomSelect
                              hiddenId="dispose-product"
                              defaultValue=""
                              placeholder="-- PILIH --"
                              options={[
                                { value: "", label: "-- PILIH --" },
                                ...products.map((p) => ({
                                  value: p.id,
                                  label: `${p.name} (${getBranchStock(profile.branchId, p.id)})`,
                                })),
                              ]}
                              className="w-full"
                              buttonClassName="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-tight focus:ring-2 focus:ring-blue-500 transition-all outline-none text-left"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-left">
                            <div className="text-left">
                              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block text-left">
                                Jumlah:
                              </label>
                              <input
                                type="number"
                                id="dispose-qty"
                                placeholder="0"
                                className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-[10px] font-black transition-all outline-none text-left"
                              />
                            </div>
                            <div className="text-left">
                              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block text-left">
                                Alasan:
                              </label>
                              <CustomSelect
                                hiddenId="dispose-reason"
                                defaultValue="EXPIRED"
                                options={[
                                  { value: "EXPIRED", label: "KADALUARSA" },
                                  { value: "DAMAGED", label: "RUSAK" },
                                  { value: "LOST", label: "HILANG" },
                                ]}
                                className="w-full"
                                buttonClassName="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-tight outline-none text-left shadow-sm"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const pId = (
                                document.getElementById(
                                  "dispose-product",
                                ) as HTMLSelectElement
                              ).value;
                              const q = parseInt(
                                (
                                  document.getElementById(
                                    "dispose-qty",
                                  ) as HTMLInputElement
                                ).value,
                              );
                              const r = (
                                document.getElementById(
                                  "dispose-reason",
                                ) as HTMLSelectElement
                              ).value;
                              if (!pId || isNaN(q) || q <= 0)
                                return alert("Lengkapi data!");
                              handleStockAdjustment(pId, q, r);
                              (
                                document.getElementById(
                                  "dispose-qty",
                                ) as HTMLInputElement
                              ).value = "";
                            }}
                            className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 mt-2"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />{" "}
                            Simpan Perubahan Stok
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {posSubView === "transfer" && (
                    <div data-pos-stock-transfer className="flex-1 overflow-y-auto bg-slate-50 p-2 space-y-2 text-left">
                      <div data-pos-transfer-card className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm w-full max-w-xl mx-auto text-left shadow-lg">
                        <div className="flex items-center gap-2.5 mb-4 text-left">
                          <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-100 text-left shrink-0">
                            <ArrowRightLeft className="w-4 h-4 text-left" />
                          </div>
                          <div className="text-left">
                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight leading-none mb-1 text-left">
                              Transfer Stok
                            </h4>
                            <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest leading-none text-left">
                              Kirim ke Cabang Lain
                            </p>
                          </div>
                        </div>

                        <div className="space-y-4 text-left">
                          <div className="text-left">
                            <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block text-left">
                              Cabang Tujuan:
                            </label>
                            <CustomSelect
                              hiddenId="transfer-target-branch"
                              defaultValue=""
                              placeholder="-- PILIH --"
                              options={[
                                { value: "", label: "-- PILIH --" },
                                ...(profile?.role === "CASHIER"
                                  ? transferTargetBranches
                                  : branches)
                                  .filter((b) => b.id !== profile.branchId)
                                  .map((b) => ({
                                    value: b.id,
                                    label: b.name,
                                  })),
                              ]}
                              className="w-full"
                              buttonClassName="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-tight focus:ring-2 focus:ring-blue-500 outline-none text-left"
                            />
                            {profile?.role === "CASHIER" &&
                              (transferTargetsLoading ||
                                transferTargetsError ||
                                transferTargetBranches.length === 0) && (
                                <p className="mt-2 text-[9px] font-bold text-slate-500">
                                  {transferTargetsLoading
                                    ? "Memuat cabang tujuan..."
                                    : transferTargetsError
                                      ? `Cabang tujuan gagal dimuat: ${transferTargetsError}`
                                      : "Belum ada cabang lain yang dapat dipilih."}
                                </p>
                              )}
                          </div>

                          <div className="text-left border-t border-slate-100 pt-4">
                            <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-3 block text-left">
                              Produk Transfer:
                            </label>

                            {selectedTransferProduct ? (
                              /* ── PRODUK SUDAH DIPILIH ── */
                              <div className="space-y-2">
                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
                                  <div className="w-9 h-9 bg-blue-600 text-white rounded-lg flex items-center justify-center shrink-0">
                                    {selectedTransferProduct.category === "Voucher"
                                      ? <Wifi className="w-4 h-4" />
                                      : <Smartphone className="w-4 h-4" />}
                                  </div>
                                  <div className="flex-1 text-left min-w-0">
                                    <p className="text-[8px] font-black text-blue-500 uppercase tracking-tight leading-none mb-0.5">
                                      {selectedTransferProduct.brand || "NO BRAND"}
                                    </p>
                                    <p className="text-[10px] font-black text-slate-900 uppercase tracking-tighter leading-snug line-clamp-2">
                                      {selectedTransferProduct.name}
                                    </p>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">
                                      Stok di cabang ini:{" "}
                                      <span className="text-blue-600 font-black">
                                        {getBranchStock(profile.branchId, selectedTransferProduct.id)} pcs
                                      </span>
                                    </p>
                                  </div>
                                </div>
                                {/* Tombol ganti produk — jelas dan mudah ditemukan */}
                                <button
                                  onClick={() => {
                                    setSelectedTransferProduct(null);
                                    setTransferSearch("");
                                    setTransferDrillPath([]);
                                  }}
                                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-blue-600 hover:border-blue-300 text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  Ganti Produk
                                </button>
                              </div>
                            ) : (
                              /* ── PILIH PRODUK (search + drilldown) ── */
                              <div className="space-y-2">

                                {/* Search input dengan tombol hapus */}
                                <div className="relative">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                  <input
                                    type="text"
                                    placeholder="Ketik nama produk untuk cari..."
                                    value={transferSearch}
                                    onChange={(e) => setTransferSearch(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 py-2.5 pl-9 pr-9 rounded-xl text-[10px] font-black uppercase tracking-tight focus:ring-2 focus:ring-blue-400/50 outline-none placeholder:text-slate-300 placeholder:normal-case placeholder:tracking-normal transition-all"
                                  />
                                  {transferSearch && (
                                    <button
                                      onClick={() => setTransferSearch("")}
                                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>

                                {/* Breadcrumb + tombol kembali saat drilldown */}
                                {transferDrillPath.length > 0 && !transferSearch && (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => setTransferDrillPath(transferDrillPath.slice(0, -1))}
                                      className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all active:scale-95"
                                    >
                                      <ChevronLeft className="w-3 h-3" />
                                      Kembali
                                    </button>
                                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                                      {transferDrillPath.map((seg, idx) => (
                                        <span key={idx} className="flex items-center gap-1 shrink-0">
                                          {idx > 0 && <ChevronRight className="w-2.5 h-2.5 text-slate-300" />}
                                          <span className={`text-[8px] font-black uppercase tracking-wide ${idx === transferDrillPath.length - 1 ? "text-slate-800" : "text-slate-400"}`}>
                                            {seg}
                                          </span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Grid produk / kategori / brand */}
                                <div className="grid grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto pr-0.5 custom-scrollbar">
                                  {(() => {
                                    const filtered = products.filter(
                                      (p) =>
                                        !transferSearch ||
                                        p.name.toLowerCase().includes(transferSearch.toLowerCase()) ||
                                        (p.brand || "").toLowerCase().includes(transferSearch.toLowerCase()),
                                    );

                                    if (transferSearch || transferDrillPath.length >= 2) {
                                      const final = !transferSearch
                                        ? filtered.filter((p) => {
                                            if (transferDrillPath.length === 1)
                                              return (p.category || "UMUM") === transferDrillPath[0];
                                            if (transferDrillPath.length === 2)
                                              return (
                                                (p.category || "UMUM") === transferDrillPath[0] &&
                                                (p.brand || "UMUM") === transferDrillPath[1]
                                              );
                                            return true;
                                          })
                                        : filtered;

                                      if (final.length === 0) return (
                                        <div className="col-span-2 py-8 text-center text-slate-400">
                                          <p className="text-[9px] font-black uppercase tracking-widest">Produk tidak ditemukan</p>
                                        </div>
                                      );

                                      return final.map((p) => (
                                        <button
                                          key={p.id}
                                          onClick={() => setSelectedTransferProduct(p)}
                                          className="p-2.5 bg-white border border-slate-100 rounded-xl text-left hover:border-blue-300 hover:bg-blue-50 transition-all"
                                        >
                                          <div className="text-[9px] font-black text-slate-800 line-clamp-2 uppercase tracking-tight leading-snug mb-1.5">
                                            {p.name}
                                          </div>
                                          <div className={`text-[7.5px] font-black uppercase tracking-wide ${getBranchStock(profile.branchId, p.id) <= 0 ? "text-rose-500" : "text-emerald-600"}`}>
                                            Stok: {getBranchStock(profile.branchId, p.id)}
                                          </div>
                                        </button>
                                      ));
                                    }

                                    // DRILLDOWN — kelompok kategori / brand
                                    let groups: any = {};
                                    if (transferDrillPath.length === 0) {
                                      groups = filtered.reduce((acc: any, p) => {
                                        const val = p.category || "UMUM";
                                        if (!acc[val]) acc[val] = [];
                                        acc[val].push(p);
                                        return acc;
                                      }, {});
                                    } else if (transferDrillPath.length === 1) {
                                      groups = filtered
                                        .filter((p) => (p.category || "UMUM") === transferDrillPath[0])
                                        .reduce((acc: any, p) => {
                                          const val = p.brand || "UMUM";
                                          if (!acc[val]) acc[val] = [];
                                          acc[val].push(p);
                                          return acc;
                                        }, {});
                                    }

                                    return Object.entries(groups).map(([name, items]: [any, any]) => (
                                      <button
                                        key={name}
                                        onClick={() => setTransferDrillPath([...transferDrillPath, name])}
                                        className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-center hover:bg-white hover:border-blue-200 transition-all"
                                      >
                                        <div className="text-[9px] font-black text-slate-800 truncate uppercase leading-none mb-1">
                                          {name}
                                        </div>
                                        <div className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">
                                          {items.length} item
                                        </div>
                                      </button>
                                    ));
                                  })()}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="text-left pt-1">
                            <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block text-left">
                              Jumlah Transfer:
                            </label>
                            <input
                              type="number"
                              id="transfer-qty"
                              placeholder="0"
                              className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-[10px] font-black outline-none text-left focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                            />
                          </div>

                          <button
                            onClick={async () => {
                              const bId = (
                                document.getElementById(
                                  "transfer-target-branch",
                                ) as HTMLSelectElement
                              ).value;
                              const pId = selectedTransferProduct?.id;
                              const q = parseInt(
                                (
                                  document.getElementById(
                                    "transfer-qty",
                                  ) as HTMLInputElement
                                ).value,
                              );
                              if (
                                !bId ||
                                !pId ||
                                isNaN(q) ||
                                q <= 0 ||
                                isProcessingTransfer
                              )
                                return alert(
                                  "Pilih Cabang Tujuan, Produk, dan Jumlah Transfer!",
                                );
                              if (
                                !(await triggerConfirm(
                                  `Kirim ${q} pcs ${selectedTransferProduct.name} ke cabang tujuan?`,
                                ))
                              )
                                return;
                              handleStockTransfer(pId, q, bId);
                              (
                                document.getElementById(
                                  "transfer-qty",
                                ) as HTMLInputElement
                              ).value = "";
                              setSelectedTransferProduct(null);
                              setTransferSearch("");
                              setTransferDrillPath([]);
                            }}
                            disabled={
                              !selectedTransferProduct || isProcessingTransfer
                            }
                            data-pos-transfer-submit
                            className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-30 disabled:grayscale transition-all flex items-center justify-center gap-2 mt-2 active:scale-95"
                          >
                            <div className="flex items-center justify-center gap-2">
                              {isProcessingTransfer ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {isProcessingTransfer
                                  ? "MEMPROSES..."
                                  : "Konfirmasi Transfer"}
                              </span>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --- 6. BONUS & INCENTIVE --- */}
            {activeMenu === "incentive" && (
              <div data-ui-screen="incentive" className="ui-screen-incentive flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
                <div className="p-4 md:p-8 shrink-0">
                  <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Bonus & Insentif</h2>
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Kelola Komisi Penjualan Karyawan</p>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 md:px-8 pb-8">
                  {profile?.role === "ADMIN" ? (
                    <div data-bonus-layout="admin" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div data-bonus-column="branches" className="lg:col-span-2 space-y-6">
                        <div data-bonus-panel="branch-summary" className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                          <div className="p-3 md:p-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-black text-slate-800 text-[10px] md:text-sm uppercase tracking-tight">Ringkasan Saldo Per Cabang</h3>
                            <Store className="w-4 h-4 md:w-5 md:h-5 text-blue-500" />
                          </div>
                          <div data-bonus-table-scroll>
                            <table data-bonus-table="branch-summary" aria-label="Ringkasan saldo bonus per cabang">
                              <thead>
                                <tr>
                                  <th scope="col" data-column="branch">Cabang</th>
                                  <th scope="col" data-column="balance" className="text-right">Saldo (Rp)</th>
                                  <th scope="col" data-column="action" className="text-center">Aksi</th>
                                </tr>
                              </thead>
                              <tbody>
                                {branches.map(b => {
                                  const summary = branchSummaries[b.id] || { totalEarned: 0 };
                                  const balance = summary.totalEarned || 0;

                                  return (
                                    <tr key={b.id} data-bonus-row="branch">
                                      <td data-column="branch">
                                        <p className="font-black text-slate-800 uppercase tracking-tight break-words">{b.name}</p>
                                        <button
                                          data-testid={`button-sync-bonus-${b.id}`}
                                          onClick={() => syncCommissionsSummary(b.id)}
                                          className="mt-1 inline-flex min-h-[36px] items-center gap-1 rounded-md px-1 text-[10px] font-bold text-slate-600 uppercase tracking-wide hover:bg-slate-100 hover:text-slate-900"
                                        >
                                          <RefreshCw className="w-3 h-3" /> Sinkronkan Data
                                        </button>
                                      </td>
                                      <td data-column="balance" className="text-right font-black text-emerald-700 whitespace-nowrap">
                                        Rp {(balance || 0).toLocaleString("id-ID")}
                                      </td>
                                      <td data-column="action" className="text-center">
                                        <button
                                          data-testid={`button-withdraw-bonus-${b.id}`}
                                          disabled={balance <= 0 || isProcessingWithdraw}
                                          onClick={() => handleWithdrawCommission(b.id)}
                                          className={`min-h-[40px] rounded-lg px-2.5 font-black text-[9px] uppercase tracking-wide transition-colors ${balance > 0 ? "bg-slate-800 text-white hover:bg-slate-900" : "bg-slate-100 text-slate-300 cursor-not-allowed"}`}
                                        >
                                          {isProcessingWithdraw ? "Proses..." : "Cairkan"}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                      <div data-bonus-column="summary" className="space-y-6">
                        <div data-bonus-panel="unclaimed-total" className="bg-emerald-50 rounded-2xl p-6 border border-emerald-200 mb-6">
                          <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Total Komisi Seluruh Cabang</p>
                          <p className="text-2xl md:text-3xl font-black text-emerald-900 mt-1 break-words">
                            Rp {Object.values(branchSummaries).reduce((s, b) => s + (b.totalEarned || 0), 0).toLocaleString("id-ID")}
                          </p>
                          <p className="text-[9px] text-emerald-600 font-bold uppercase mt-2 italic">* Total saldo yang belum dicairkan</p>
                        </div>
                        <div data-bonus-panel="recent-activity" className="bg-white rounded-2xl overflow-hidden border border-slate-200">
                          <div className="p-3 md:p-4 border-b border-slate-200">
                            <h3 className="font-black text-slate-800 text-[10px] md:text-sm uppercase tracking-tight">Aktivitas Bonus Terbaru</h3>
                          </div>
                          <div data-bonus-table-scroll>
                            <table data-bonus-table="recent-activity" aria-label="Aktivitas bonus terbaru">
                              <thead>
                                <tr>
                                  <th scope="col" data-column="time">Waktu</th>
                                  <th scope="col" data-column="product">Produk</th>
                                  <th scope="col" data-column="cashier">Kasir</th>
                                  <th scope="col" data-column="status">Status</th>
                                  <th scope="col" data-column="bonus" className="text-right">Bonus</th>
                                </tr>
                              </thead>
                              <tbody>
                                {commissions.slice(0, 10).map((c, idx) => (
                                  <tr key={idx} data-bonus-row="activity">
                                    <td data-column="time" className="whitespace-nowrap">
                                      {c.createdAt ? new Date(c.createdAt).toLocaleDateString("id-ID") : "-"}
                                    </td>
                                    <td data-column="product" className="font-bold text-slate-800">
                                      {getProductName(c.product, c.productName)}
                                    </td>
                                    <td data-column="cashier">{getCommissionCashierName(c)}</td>
                                    <td data-column="status">
                                      <span data-bonus-status={c.status}>{c.status}</span>
                                    </td>
                                    <td data-column="bonus" className="text-right font-black whitespace-nowrap">
                                      <span data-bonus-status={c.status}>
                                        {c.status === "refunded" ? "(Refund)" : c.status === "withdrawn" ? "(Cair)" : `+Rp ${(c.amount || 0).toLocaleString("id-ID")}`}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div data-bonus-layout="cashier" className="max-w-2xl mx-auto space-y-4 md:space-y-6">
                      <div data-bonus-panel="cashier-summary" className="relative overflow-hidden bg-blue-600 rounded-2xl md:rounded-[32px] p-5 md:p-6 text-white shadow-lg md:shadow-xl shadow-blue-200">
                        <div className="absolute top-0 right-0 w-32 h-32 md:w-48 md:h-48 bg-white/10 rounded-full -mr-10 -mt-10 md:-mr-16 md:-mt-16"></div>
                        <Sparkles className="w-6 h-6 md:w-8 md:h-8 mb-3 md:mb-4 opacity-80" />
                        <h3 className="text-xs md:text-sm font-black uppercase tracking-widest opacity-80 mb-1">
                          Saldo Bonus Saya
                        </h3>
                        <div className="flex items-baseline gap-1.5 mb-5 md:mb-6">
                          <span className="text-sm md:text-xl font-bold opacity-60">
                            Rp
                          </span>
                          <span className="text-2xl md:text-5xl font-black tracking-tighter">
                            {(commissionsSummary?.totalEarned || 0).toLocaleString(
                              "id-ID",
                            )}
                          </span>
                        </div>
                        <button 
                          onClick={() => syncCommissionsSummary()}
                          className="mb-6 flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-full text-[9px] font-bold uppercase tracking-widest transition-colors border border-white/10"
                        >
                          <RefreshCw className="w-3 h-3" /> Sinkronkan Data Bonus
                        </button>
                        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:gap-4 bg-white/10 rounded-xl md:rounded-2xl p-4 md:p-4 border border-white/10">
                          <div className="flex-1 border-b sm:border-b-0 sm:border-r border-white/20 pb-2 sm:pb-0">
                            <p className="text-[9px] font-bold uppercase tracking-widest opacity-60 mb-0.5">Sudah Dicairkan</p>
                            <p className="text-[11px] md:text-xs font-black tracking-tight">
                            Rp {getMyCommissionTotal("withdrawn").toLocaleString("id-ID")}
                            </p>
                          </div>
                          <div className="flex-1 sm:pl-2">
                            <p className="text-[9px] font-bold uppercase tracking-widest opacity-60 mb-0.5">Bonus Hangus (Refund)</p>
                            <p className="text-[11px] md:text-xs font-black tracking-tight text-rose-200">
                            Rp {getMyCommissionTotal("refunded").toLocaleString("id-ID")}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div data-bonus-panel="cashier-history" className="bg-white rounded-2xl overflow-hidden border border-slate-200">
                        <div className="p-3 md:p-4 border-b border-slate-200">
                          <h3 className="font-black text-slate-800 text-[10px] md:text-xs uppercase tracking-widest">Riwayat Bonus Penjualan</h3>
                        </div>
                        <div data-bonus-table-scroll>
                          <table data-bonus-table="cashier-history" aria-label="Riwayat bonus penjualan">
                            <thead>
                              <tr>
                                <th scope="col" data-column="time">Waktu</th>
                                <th scope="col" data-column="product">Produk</th>
                                <th scope="col" data-column="bonus" className="text-right">Bonus (Rp)</th>
                                <th scope="col" data-column="status">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {getMyCommissions()
                                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                .slice(0, 50)
                                .map((c, idx) => (
                                  <tr key={idx} data-bonus-row="cashier-history">
                                    <td data-column="time" className="whitespace-nowrap">
                                      {new Date(c.createdAt).toLocaleTimeString("id-ID")} • {new Date(c.createdAt).toLocaleDateString("id-ID")}
                                    </td>
                                    <td data-column="product" className="font-bold text-slate-800">
                                      {getProductName(c.product, c.productName)}
                                    </td>
                                    <td data-column="bonus" className={`text-right font-black whitespace-nowrap ${c.status === "refunded" ? "text-rose-500 line-through" : c.status === "withdrawn" ? "text-blue-600" : "text-emerald-700"}`}>
                                      {c.status === "refunded" ? "-" : "+"}Rp {c.amount.toLocaleString("id-ID")}
                                    </td>
                                    <td data-column="status">
                                      <span data-bonus-status={c.status}>{c.status}</span>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeMenu === "shift" && profile?.role === "CASHIER" && (
                <div data-ui-screen="shift" className="ui-screen-shift flex-1 p-4 md:p-6 overflow-y-auto w-full flex flex-col xl:flex-row items-center xl:items-start justify-center gap-6 relative">
                <div data-shift-control-card className="max-w-md w-full bg-white rounded-2xl md:rounded-3xl overflow-hidden relative shrink-0">
                  <div data-shift-control-header className="p-4 md:p-8 border-b border-slate-200 bg-white text-slate-900 text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-16 -mt-16"></div>
                    <Clock className="w-14 h-14 text-blue-600 mx-auto mb-4 relative z-10" />
                    <h2 className="text-xl md:text-lg md:text-2xl font-black uppercase tracking-tight relative z-10">
                      Manajemen Shift
                    </h2>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-2 relative z-10">
                      {branches.find((b) => b.id === profile.branchId)?.name ||
                        "Belum Ada Cabang"}
                    </p>
                  </div>
                  <div data-shift-control-body className="p-4 md:p-6 md:p-8 space-y-6">
                    {shiftOpen ? (
                      <div className="text-center">
                        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-5 py-2.5 rounded-full font-black text-[11px] uppercase tracking-widest mb-6 animate-pulse">
                          <CheckCircle2 className="w-4 h-4" /> Shift {shiftType}{" "}
                          Aktif
                        </div>

                        <div className="space-y-3 mb-6">
                          <div data-shift-info-card className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                              Penjaga pada shift ini:
                            </p>
                            <div className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-black uppercase text-slate-800">
                              {cashierName.trim() || "Nama belum tersedia"}
                            </div>
                            <p className="text-[8px] text-blue-600 font-bold mt-2 leading-relaxed">
                              Untuk serah terima, tutup shift ini terlebih dahulu. Penjaga berikutnya memilih namanya saat membuka shift baru.
                            </p>
                          </div>
                          <div data-shift-info-card className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                              Mulai Shift:
                            </p>
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-black text-slate-800 uppercase">
                                {shiftStartTime
                                  ? new Date(shiftStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  : "-"}
                              </p>
                              <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase ${shiftType === "Pagi" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>
                                {shiftType}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <button
                            data-shift-close
                            onClick={handleCloseShift}
                            className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-2xl uppercase tracking-[0.2em] text-[11px] shadow-xl shadow-red-100 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                          >
                            <LogOut className="w-5 h-5" /> Tutup Shift Sekarang
                          </button>
                          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-start gap-2.5 text-left">
                            <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                            <p className="text-[8px] font-bold text-blue-800 uppercase leading-relaxed">
                              Sistem mencatat transaksi berdasarkan "Personil Aktif" di atas. Ganti nama jika ada operan / rolling shift.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="text-center">
                          <div className="inline-flex items-center gap-2 bg-slate-50 text-slate-500 border border-slate-200 px-5 py-2.5 rounded-full font-black text-[11px] uppercase tracking-widest">
                            <ShieldCheck className="w-4 h-4" /> Laci Kasir
                            Terkunci
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="text-left">
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                              1. Tipe Shift (Otomatis):
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                              <div
                                className={`flex items-center justify-center gap-2 py-3 md:py-4 rounded-2xl border-2 transition-all font-black text-[11px] uppercase tracking-widest ${shiftType === "Pagi" ? "border-blue-600 bg-blue-50 text-blue-600 shadow-lg" : "border-slate-100 bg-slate-50 text-slate-300 opacity-50"}`}
                              >
                                Pagi (07-19)
                              </div>
                              <div
                                className={`flex items-center justify-center gap-2 py-3 md:py-4 rounded-2xl border-2 transition-all font-black text-[11px] uppercase tracking-widest ${shiftType === "Malam" ? "border-indigo-600 bg-indigo-50 text-indigo-600 shadow-lg" : "border-slate-100 bg-slate-50 text-slate-300 opacity-50"}`}
                              >
                                Malam (19-07)
                              </div>
                            </div>
                            <p className="text-[8px] text-slate-400 font-bold uppercase mt-2 text-center">
                              * Waktu terdeteksi berdasarkan jam sistem saat
                              ini.
                            </p>
                          </div>

                          <div className="text-left">
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                              2. Pilih Nama Penjaga Kasir:
                            </label>
                            <CustomSelect
                              value={cashierName}
                              onChange={(v) => setCashierName(v)}
                              placeholder="-- PILIH NAMA ANDA --"
                              options={[
                                { value: "", label: "-- PILIH NAMA ANDA --" },
                                ...users
                                  .filter(
                                    (u) => u && u.branchId === profile?.branchId,
                                  )
                                    .flatMap((u) =>
                                      getConfiguredKeeperNames(u).map((name) => ({
                                      value: name,
                                      label: name,
                                      })),
                                    ),
                              ]}
                              className="w-full"
                              buttonClassName="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 md:py-4 text-sm font-black uppercase tracking-tight focus:ring-4 focus:ring-blue-100 outline-none transition-all cursor-pointer shadow-sm"
                            />
                            <p className="text-[8px] text-blue-600 font-bold uppercase mt-2 text-center">
                              * Pilih nama Anda dari daftar karyawan di cabang
                              ini.
                            </p>
                          </div>
                        </div>

                        <button
                          data-shift-open
                          onClick={handleOpenShift}
                          disabled={!cashierName.trim() || !shiftType}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 md:py-5 rounded-2xl uppercase tracking-[0.2em] text-[11px] shadow-2xl shadow-blue-200 transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-30 disabled:grayscale"
                        >
                          <Plus className="w-5 h-5" /> Buka Shift Sekarang
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* REAL-TIME CURRENT SHIFT TRANSACTIONS LIST */}
                {shiftOpen && (
                  <div data-shift-transactions className="flex-1 max-w-2xl w-full bg-white rounded-2xl md:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden relative flex flex-col min-h-[400px] animate-in fade-in slide-in-from-right-4 duration-500">
                    <div data-shift-transactions-header className="p-5 md:p-6 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                      <div className="text-left">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight leading-none mb-1">
                          Riwayat Transaksi Shift Ini
                        </h3>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">
                          Daftar penjualan terdaftar selama sesi shift aktif berjalan
                        </p>
                      </div>
                      <div data-shift-transactions-total className={`px-3 py-1.5 rounded-xl border font-bold font-mono text-xs flex items-center gap-1.5 justify-center self-start sm:self-auto ${
                        salesReadFailed
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-emerald-50 text-emerald-800 border-emerald-100"
                      }`}>
                        {salesReadLoading || salesReadFailed ? (
                          <span>{salesReadFailed ? "Data belum sinkron" : "Memuat transaksi..."}</span>
                        ) : (
                          <>
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                            Rp {currentShiftTotalSales.toLocaleString("id-ID")}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="p-5 md:p-6 overflow-y-auto max-h-[500px] flex-1">
                      {salesReadLoading ? (
                        <div role="status" className="py-16 text-center text-slate-500 space-y-3">
                          <Loader2 className="w-8 h-8 text-blue-500 mx-auto animate-spin" />
                          <p className="text-[9px] font-black uppercase tracking-[0.15em]">Memuat transaksi shift dari server</p>
                        </div>
                      ) : salesReadFailed ? (
                        <div role="alert" className="py-12 text-center text-rose-700 space-y-3">
                          <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
                          <p className="text-[9px] font-black uppercase tracking-[0.15em]">Transaksi shift belum berhasil dimuat</p>
                          <button
                            type="button"
                            onClick={() => salesRefreshRef.current()}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase tracking-wider"
                          >
                            Coba Lagi
                          </button>
                        </div>
                      ) : currentShiftSales.length === 0 ? (
                        <div className="py-20 text-center text-slate-400 space-y-3">
                          <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto animate-bounce" />
                          <p className="text-[9px] font-black uppercase tracking-[0.2em]">Belum Ada Transaksi</p>
                          <p className="text-[8px] text-slate-400 uppercase leading-none font-bold">Lakukan penjualan di menu kasir untuk merekam data di sini</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {currentShiftSales.map((sale) => (
                            <div data-shift-sale-row key={sale.id} className="p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">
                                    {sale.customerName || "Pelanggan Biasa"}
                                  </span>
                                  <span className="text-[8px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded leading-none">
                                    {new Date(sale.createdAt || sale.timestamp || 0).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <div className="text-[8px] text-slate-400 font-bold uppercase tracking-tight flex flex-wrap gap-1 leading-none">
                                  <span>Kasir: {getSaleCashierName(sale)}</span>
                                  <span>• {sale.items?.length || 0} Item</span>
                                </div>
                                <div className="text-[9px] text-slate-600 font-medium">
                                  {sale.items?.map((it: any) => `${it.product?.name || 'Produk'} (x${it.qty})`).join(", ")}
                                </div>
                              </div>
                              <div className="text-right sm:text-right flex sm:flex-col justify-between sm:justify-center items-center sm:items-end gap-1 border-t sm:border-0 pt-2 sm:pt-0 border-slate-50">
                                <span className="text-[8px] sm:hidden font-black text-slate-400 uppercase tracking-widest">Total:</span>
                                <span className="text-xs font-black text-slate-900 font-mono">
                                  Rp {(sale.total || 0).toLocaleString("id-ID")}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* SHIFT SUMMARY MODAL overlay inside view */}
                {showShiftSummary !== null && (
                  <div data-shift-close-overlay className="fixed inset-0 z-[110] bg-slate-900/90 flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div data-shift-close-dialog className="max-w-md w-full bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[95vh]">
                      <div data-shift-close-header className="p-5 md:p-6 bg-emerald-600 text-white text-center relative overflow-hidden shrink-0">
                        <div className="absolute inset-0 bg-emerald-500/10"></div>
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 relative z-10">
                          <Banknote className="w-6 h-6 text-white" />
                        </div>
                        <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter mb-1 relative z-10">
                          Tutup Shift
                        </h2>
                        <p className="text-[10px] text-emerald-100 font-bold uppercase tracking-[0.2em] relative z-10">
                          Ringkasan Tutup Shift
                        </p>
                      </div>
                      <div className="p-5 md:p-8 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                        <div data-shift-close-total className="space-y-1 text-center bg-slate-50 py-4 rounded-2xl border border-slate-100">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
                            Total Pendapatan Sistem:
                          </p>
                          <p className="text-2xl font-black text-slate-900 tracking-tighter leading-none">
                            Rp {showShiftSummary.toLocaleString("id-ID")}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-left">
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">
                              Kasir:
                            </p>
                            <p className="text-[10px] font-black text-slate-800 uppercase leading-none truncate">
                              {cashierName}
                            </p>
                          </div>
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">
                              Shift:
                            </p>
                            <p className="text-[10px] font-black text-slate-800 uppercase leading-none">
                              {shiftType}
                            </p>
                          </div>
                        </div>

                        <div className="text-left bg-blue-50 p-3 rounded-xl border border-blue-100">
                          <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest mb-1 leading-none">Total Pendapatan Sistem (dari transaksi sukses):</p>
                          <p className="text-sm font-black text-blue-900 font-mono leading-none">Rp {showShiftSummary.toLocaleString("id-ID")}</p>
                          <p className="text-[8px] text-blue-600 mt-2">Nilai akhir dihitung ulang oleh server saat shift ditutup.</p>
                        </div>

                        <div data-shift-income-entry className="space-y-3 text-left bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Masukkan total pendapatan menurut catatan kasir:</p>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">Rp</span>
                              <input 
                                type="number"
                                min="0"
                                step="1"
                                data-shift-income-input
                                value={reportedIncomeInput}
                                onChange={(e) => setReportedIncomeInput(e.target.value)}
                                placeholder="0"
                                className="w-full bg-white border-2 border-slate-200 rounded-xl py-2 pl-9 pr-4 text-sm font-black text-slate-900 focus:border-blue-500 outline-none transition-all"
                              />
                            </div>
                          </div>

                          {reportedIncomeInput !== "" && (
                            <div className={`p-3 rounded-xl border flex justify-between items-center ${
                              Number(reportedIncomeInput) - showShiftSummary === 0
                                ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                                : "bg-rose-50 border-rose-100 text-rose-700"
                            }`}>
                              <p className="text-[9px] font-black uppercase tracking-widest leading-none">Selisih:</p>
                              <p className="text-xs font-black font-mono leading-none">
                                Rp {(Number(reportedIncomeInput) - showShiftSummary).toLocaleString("id-ID")}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-amber-700 flex gap-2 items-start text-left">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <p className="text-[8px] font-bold leading-tight uppercase">
                            COCOKKAN TOTAL PENDAPATAN DENGAN CATATAN TRANSAKSI SEBELUM MENUTUP SHIFT.
                          </p>
                        </div>

                        <div className="space-y-2 shrink-0">
                          <button
                            data-shift-confirm-close
                            disabled={reportedIncomeInput === "" || isClosingShift}
                            onClick={() => finalizeCloseShift(reportedIncomeInput)}
                            className="w-full bg-slate-900 text-white font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black active:scale-95 flex items-center justify-center gap-3"
                          >
                            {isClosingShift ? (
                              <>
                                <Loader2 className="w-5 h-5 animate-spin" /> Sedang Memproses...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-5 h-5" /> Patenkan & Tutup Shift
                              </>
                            )}
                          </button>
                          <button
                            data-shift-cancel-close
                            onClick={() => {
                              setShowShiftSummary(null);
                              setReportedIncomeInput("");
                            }}
                            className="w-full bg-slate-100 text-slate-400 font-black py-2.5 rounded-2xl text-[10px] uppercase tracking-widest hover:text-slate-600 transition-all font-mono"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* --- 7. ADMIN: DASHBOARD (Overview Live Sales) --- */}
            {activeMenu === "dashboard" && profile?.role === "ADMIN" && (
              <div data-ui-screen="dashboard" className="ui-screen-dashboard flex-1 flex flex-col overflow-hidden bg-slate-50">
                {/* HEADER DASHBOARD COMPACT */}
                <div data-dashboard-filters className="bg-white py-2 md:py-4 border-b border-slate-200 shrink-0">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-3">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      {/* Period Filter */}
                      <div data-dashboard-periods className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-sm">
                        {[
                          { id: "today", label: "Harian" },
                          { id: "week", label: "Mingguan" },
                          { id: "month", label: "Bulanan" },
                          { id: "all", label: "Semua" },
                        ].map((p) => (
                          <button
                            key={p.id}
                            data-dashboard-period-option
                            data-active={dashboardDateRange === p.id ? "true" : undefined}
                            onClick={() => setDashboardDateRange(p.id as any)}
                            className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all ${
                              dashboardDateRange === p.id
                                ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200"
                                : "text-slate-500 hover:text-slate-700"
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>

                      {/* Branch Filter in Dashboard */}
                      <div data-dashboard-branch-filter>
                        <CustomSelect
                          value={adminSalesBranchFilter}
                          onChange={(v) => setAdminSalesBranchFilter(v)}
                          options={[
                            { value: "", label: "Semua Cabang" },
                            ...branches.map((b) => ({
                              value: b.id,
                              label: b.name,
                            })),
                          ]}
                          buttonClassName="bg-white border border-slate-200 rounded-2xl px-4 py-2 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-blue-100 outline-none shadow-sm"
                        />
                      </div>
                      
                      <div data-dashboard-view-tabs className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-sm">
                      {[
                        { id: "overview", label: "Ringkasan", icon: LayoutDashboard },
                        { id: "sales", label: "Penjualan", icon: Activity },
                        { id: "inventory", label: "Stok & Audit", icon: Boxes },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          data-dashboard-view-option
                          data-active={dashboardTab === tab.id ? "true" : undefined}
                          onClick={() => setDashboardTab(tab.id as any)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            dashboardTab === tab.id
                              ? "bg-white text-blue-600 shadow-sm ring-1 ring-slate-200"
                              : "text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          <tab.icon className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

                <div data-dashboard-content className="flex-1 overflow-y-auto w-full content-fade">
                  {dashboardTab !== "inventory" && <div className="mb-4 text-xs" role="status" aria-live="polite">
                    {ownerDashboard.error ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">
                        {ownerDashboard.hasSummary ? "Menampilkan data terakhir yang berhasil dimuat — " : ""}
                        {ownerDashboard.error}
                        <button className="ml-3 font-bold underline" onClick={() => void ownerDashboard.refresh()}>Coba lagi</button>
                      </div>
                    ) : ownerDashboard.loading ? (
                      <span className="text-slate-500">Memperbarui ringkasan pendapatan…</span>
                    ) : ownerDashboard.updatedAt ? (
                      <span className="text-slate-500">Diperbarui {new Date(ownerDashboard.updatedAt).toLocaleTimeString("id-ID")}</span>
                    ) : null}
                    {(ownerDashboard.detailsError || ownerDashboard.stockError) && (
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                        {ownerDashboard.detailsError || ownerDashboard.stockError}
                        <button className="ml-3 font-bold underline" onClick={() => void ownerDashboard.refresh()}>Coba lagi</button>
                      </div>
                    )}
                  </div>}
                  {dashboardTab === "overview" && (
                   <div data-dashboard-metrics className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-6">
                       {[
                        { label: "Total Omset", val: ownerDashboard.hasSummary ? `Rp ${dashboardStats.revenue.toLocaleString("id-ID")}` : "—", sub: "Periode terpilih", icon: TrendingUp, tile: "bg-blue-600 shadow-blue-200" },
                        { label: "Total Transaksi", val: ownerDashboard.hasSummary ? dashboardStats.count.toLocaleString("id-ID") : "—", sub: "transaksi", icon: ShoppingBag, tile: "bg-emerald-500 shadow-emerald-200" },
                        { label: "Laba Bersih", val: ownerDashboard.hasSummary ? `Rp ${dashboardStats.profit.toLocaleString("id-ID")}` : "—", sub: "estimasi profit", icon: Sparkles, tile: "bg-violet-500 shadow-violet-200" },
                        { label: "Stok Menipis", val: `${shopListAlertCount}`, sub: "produk perlu restock", icon: AlertTriangle, tile: "bg-amber-500 shadow-amber-200" },
                      ].map((card) => (
                        <div
                          key={card.label}
                          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-3"
                        >
                          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-lg ${card.tile}`}>
                            <card.icon className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{card.label}</p>
                            <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight break-words leading-tight">{card.val}</h3>
                            <p className="text-[9px] font-bold text-slate-400 mt-0.5">{card.sub}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {dashboardTab === "overview" && (
                    <div className="space-y-6">
                      {/* TREND + MARGIN GAUGE */}
                      <div data-dashboard-trend-grid className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div data-dashboard-trend-card className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                          <div className="mb-5">
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                              <Activity className="w-4 h-4 text-blue-500" /> Tren Transaksi
                            </h4>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">7 Hari Terakhir</p>
                          </div>
                          {(() => {
                            const days: { label: string; count: number }[] = [];
                            for (let i = 6; i >= 0; i--) {
                              const d = new Date();
                              d.setDate(d.getDate() - i);
                              const ds = getLogicalShiftDate(d).replace(/\//g, "-");
                              const label = d.toLocaleDateString("id-ID", { weekday: "short" });
                              let count = 0;
                              dashboardSummaries.forEach((s) => {
                                if (adminSalesBranchFilter && s.branchId !== adminSalesBranchFilter) return;
                                if ((s.date || "").replace(/\//g, "-") === ds) count += s.count || 0;
                              });
                              days.push({ label, count });
                            }
                            const hasData = days.some((d) => d.count > 0);
                            if (!hasData) {
                              return (
                                <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-slate-300">
                                  <Activity className="w-8 h-8" />
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Belum ada transaksi 7 hari terakhir</p>
                                </div>
                              );
                            }
                            const max = Math.max(1, ...days.map((d) => d.count));
                            const W = 560, H = 200, pad = 10;
                            const stepX = (W - pad * 2) / (days.length - 1);
                            const pts = days.map((d, i) => {
                              const x = pad + i * stepX;
                              const y = H - pad - (d.count / max) * (H - pad * 2);
                              return { x, y };
                            });
                            const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
                            const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${H - pad} L${pts[0].x.toFixed(1)},${H - pad} Z`;
                            return (
                              <div>
                                <div className="h-[200px] w-full">
                                  <svg className="w-full h-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                                    <defs>
                                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#1d52da" stopOpacity="0.22" />
                                        <stop offset="100%" stopColor="#1d52da" stopOpacity="0" />
                                      </linearGradient>
                                    </defs>
                                    <path d={area} fill="url(#trendFill)" />
                                    <path d={line} fill="none" stroke="#1d52da" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                                  </svg>
                                </div>
                                <div className="flex justify-between mt-3 px-1">
                                  {days.map((d, i) => (
                                    <span key={i} className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{d.label}</span>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        <div data-dashboard-margin-card className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                            <Percent className="w-4 h-4 text-emerald-500" /> Margin Laba
                          </h4>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Periode Terpilih</p>
                          {(() => {
                            const pct = dashboardStats.revenue > 0 ? (dashboardStats.profit / dashboardStats.revenue) * 100 : 0;
                            const clamped = Math.max(0, Math.min(100, pct));
                            const r = 52;
                            const circ = 2 * Math.PI * r;
                            const off = circ - (clamped / 100) * circ;
                            return (
                              <div className="flex-1 flex flex-col items-center justify-center py-4">
                                <div className="relative w-[150px] h-[150px]">
                                  <svg className="w-full h-full -rotate-90" viewBox="0 0 130 130">
                                    <circle cx="65" cy="65" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
                                    <circle cx="65" cy="65" r={r} fill="none" stroke="#1d52da" strokeWidth="12" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} />
                                  </svg>
                                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-3xl font-black text-slate-900">{pct.toFixed(1)}%</span>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">margin</span>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 w-full mt-4">
                                  <div className="bg-slate-50 rounded-2xl p-3 text-center">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Laba</p>
                                    <p className="text-[11px] font-black text-emerald-600 break-words">Rp {dashboardStats.profit.toLocaleString("id-ID")}</p>
                                  </div>
                                  <div className="bg-slate-50 rounded-2xl p-3 text-center">
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Omset</p>
                                    <p className="text-[11px] font-black text-slate-700 break-words">Rp {dashboardStats.revenue.toLocaleString("id-ID")}</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* RECENT TRANSACTIONS FEED */}
                      <div data-dashboard-recent-card className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-500 animate-pulse" /> Transaksi Terakhir
                          </h4>
                          <button onClick={() => setDashboardTab("sales")} className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-700">Lihat Semua</button>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {dashboardRecentSales.slice(0, 5).map((s) => (
                            <div key={s.id} className="flex items-center gap-3 py-3">
                              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                <Zap className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-bold text-slate-800 truncate">{s.items?.map((i: any) => `${i.product?.name || i.name || "Produk"} (x${i.qty})`).join(", ") || "Transaksi"}</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{branches.find((b) => b.id === s.branchId)?.name || "Pusat"} · {getSaleCashierName(s)}</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[11px] font-black text-slate-900">Rp {(s.total || 0).toLocaleString("id-ID")}</p>
                                <p className="text-[9px] font-bold text-slate-400">{new Date(s.createdAt || s.timestamp || 0).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</p>
                              </div>
                            </div>
                          ))}
                          {dashboardRecentSales.length === 0 && (
                            <div className="py-8 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">{ownerDashboard.hasDetails ? "Belum ada transaksi" : "Memuat transaksi terbaru…"}</div>
                          )}
                        </div>
                      </div>

                      {/* CHART + TOP PRODUCTS */}
                      <div data-dashboard-performance-grid className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* PERFORMANCE CHART SIMULATION */}
                      <div data-dashboard-branch-performance className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                         <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-6">
                            <Activity className="w-4 h-4 text-blue-500" /> Performa Cabang Periode Ini
                          </h4>
                          {(() => {
                            const chartData = branches
                              .map((b) => ({
                                name: b.name,
                                revenue: dashboardStats.branchBreakdown[b.id] || 0,
                              }))
                              .sort((a, b) => b.revenue - a.revenue);
                            const hasData = chartData.some((d) => d.revenue > 0);
                            const palette = ["#2563eb", "#3b82f6", "#0ea5e9", "#6366f1", "#1d4ed8", "#8b5cf6"];
                            const fmtShort = (v: number) =>
                              v >= 1_000_000
                                ? `${(v / 1_000_000).toFixed(1)}jt`
                                : v >= 1_000
                                ? `${Math.round(v / 1_000)}rb`
                                : `${v}`;
                            if (!hasData) {
                              return (
                                <div className="h-[260px] flex flex-col items-center justify-center text-center gap-2 text-slate-300">
                                  <Activity className="w-8 h-8" />
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Belum ada data penjualan periode ini
                                  </p>
                                </div>
                              );
                            }
                            return (
                              <div className="h-[260px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                    <XAxis
                                      dataKey="name"
                                      tickFormatter={(value: string) =>
                                        value.length > 12
                                          ? `${value.slice(0, 11)}…`
                                          : value
                                      }
                                      tick={{ fontSize: 10, fontWeight: 700, fill: "#64748b" }}
                                      tickLine={false}
                                      axisLine={{ stroke: "#e2e8f0" }}
                                      interval="preserveStartEnd"
                                      minTickGap={12}
                                    />
                                    <YAxis
                                      tickFormatter={fmtShort}
                                      tick={{ fontSize: 10, fontWeight: 700, fill: "#94a3b8" }}
                                      tickLine={false}
                                      axisLine={false}
                                      width={44}
                                    />
                                    <RechartsTooltip
                                      cursor={{ fill: "rgba(37,99,235,0.06)" }}
                                      formatter={(value: any) => [`Rp ${Number(value).toLocaleString("id-ID")}`, "Omset"]}
                                      contentStyle={{
                                        borderRadius: 14,
                                        border: "1px solid #e2e8f0",
                                        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
                                        fontSize: 11,
                                        fontWeight: 700,
                                        maxWidth: "min(80vw, 320px)",
                                        overflowWrap: "anywhere",
                                      }}
                                      labelStyle={{
                                        fontWeight: 800,
                                        color: "#0f172a",
                                        overflowWrap: "anywhere",
                                      }}
                                    />
                                    <Bar dataKey="revenue" radius={[8, 8, 0, 0]} maxBarSize={56}>
                                      {chartData.map((_, i) => (
                                        <Cell key={i} fill={palette[i % palette.length]} />
                                      ))}
                                    </Bar>
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            );
                          })()}
                      </div>

                      {/* TOP PRODUCTS */}
                      <div data-dashboard-top-products className="lg:col-span-1 bg-white rounded-3xl p-6 text-slate-900 border border-slate-200/60 shadow-sm overflow-hidden relative">
                         <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-16 -mt-16" />
                         <h4 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-6 text-blue-600 relative z-10">
                            <TrendingUp className="w-4 h-4" /> Produk Terlaris
                          </h4>
                          <div className="space-y-4 relative z-10">
                            {(() => {
                              return ownerDashboard.topProducts
                                .map((p, i) => (
                                  <div key={i} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                                    <span className="text-[10px] font-medium uppercase flex-1 pr-4 break-words py-0.5 text-slate-600">{p.name}</span>
                                    <span className="text-[10px] font-black text-blue-600">{p.qty}x</span>
                                  </div>
                                ));
                            })()}
                          </div>
                      </div>
                    </div>
                    </div>
                  )}

                  {dashboardTab === "sales" && (
                    <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col min-h-[420px]">
                      {/* LIVE TRANSACTIONS COMPACT */}
                      <div className="p-2.5 sm:p-3 md:p-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 text-left">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
                            <Activity className="w-4 h-4" />
                          </div>
                          <div className="text-left min-w-0">
                            <h4 className="text-[11px] sm:text-xs font-black text-slate-900 uppercase tracking-widest leading-tight">
                               10 Transaksi Terakhir
                            </h4>
                          </div>
                        </div>

                        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
                          <CustomSelect
                            value={adminSalesDateFilter}
                            onChange={(v) => setAdminSalesDateFilter(v)}
                            options={[
                              { value: "today", label: "Hari Ini" },
                              { value: "3days", label: "3 Hari" },
                              { value: "all", label: "Semua" },
                            ]}
                            buttonClassName="w-full bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-wide rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-blue-100"
                          />
                          <CustomSelect
                            value={adminSalesBranchFilter}
                            onChange={(v) => setAdminSalesBranchFilter(v)}
                            options={[
                              { value: "", label: "Semua Cabang" },
                              ...branches.map((b) => ({
                                value: b.id,
                                label: b.name,
                              })),
                            ]}
                            buttonClassName="w-full bg-slate-50 border border-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-wide rounded-lg px-2 py-2 outline-none focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                      </div>

                      <div data-dashboard-sales-table className="admin-excel-scroll flex-1 overflow-x-auto md:overflow-auto md:max-h-[420px]">
                        <table aria-label="10 transaksi terakhir" className="admin-excel-table w-full min-w-[720px] md:min-w-0">
                          <thead>
                            <tr>
                              <th scope="col" data-column="product">Produk</th>
                              <th scope="col" data-column="branch">Cabang</th>
                              <th scope="col" data-column="cashier">Kasir</th>
                              <th scope="col" data-column="time">Waktu</th>
                              <th scope="col" data-column="total" className="text-right">Total (Rp)</th>
                              <th scope="col" data-column="profit" className="text-right">Laba (Rp)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dashboardRecentSales
                              .slice(0, 10) // Force UI limit for dashboard consistency
                              .map((s) => {
                                const capital = (s.items || []).reduce((sum: number, it: any) => {
                                  let pPrice = it.purchasePrice;
                                  if (pPrice === undefined || pPrice === null) {
                                    const m = products.find(p => p.id === (it.productId || it.id)) as any;
                                    pPrice = m?.buyingPrice || 0;
                                  }
                                  return sum + (Number(pPrice || 0) * Number(it.qty || 0));
                                }, 0);
                                const profit = (s.total || 0) - capital;
                                  const productSummary = s.items?.map((i: any) => `${i.product?.name || i.name || "Produk"} (x${i.qty})`).join(", ") || "Transaksi";
                                
                                return (
                                <tr key={s.id} className="text-[11px]">
                                  <td data-column="product" title={productSummary} className="font-bold text-slate-800">
                                    <div className="min-w-0 break-words leading-snug line-clamp-2">
                                      {productSummary}
                                    </div>
                                  </td>
                                  <td data-column="branch" title={branches.find((b) => b.id === s.branchId)?.name || "Pusat"} className="font-bold text-slate-700">
                                    <span className="min-w-0 break-words">{branches.find((b) => b.id === s.branchId)?.name || "Pusat"}</span>
                                  </td>
                                  <td data-column="cashier" title={getSaleCashierName(s)} className="font-semibold text-blue-700">
                                    <span className="min-w-0 break-words">{getSaleCashierName(s)}</span>
                                  </td>
                                  <td data-column="time" className="font-mono font-semibold text-slate-600">
                                    {new Date(s.createdAt || s.timestamp || 0).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                                  </td>
                                  <td data-column="total" className="text-right font-black text-slate-900">
                                    {(s.total || 0).toLocaleString("id-ID")}
                                  </td>
                                  <td data-column="profit" className="text-right font-black text-emerald-700">
                                    {profit.toLocaleString("id-ID")}
                                  </td>
                                </tr>
                              );})
                            }
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {dashboardTab === "inventory" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* MODAL PER CABANG COMPACT */}
                      <div data-dashboard-branch-modal className="bg-white rounded-3xl border border-slate-200/60 shadow-xl overflow-hidden flex flex-col h-fit">
                        <div className="p-3 md:p-4 border-b border-slate-100 flex items-center justify-between bg-white text-left">
                          <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Store className="w-3.5 h-3.5 text-blue-500" />
                            Modal per Cabang
                          </h4>
                        </div>
                        <div className="admin-excel-scroll overflow-auto">
                          <table aria-label="Modal stok per cabang" className="admin-excel-table admin-excel-branch-modal w-full min-w-[360px]">
                            <thead>
                              <tr>
                                <th scope="col" data-column="branch">Cabang</th>
                                <th scope="col" data-column="capital" className="text-right">Modal (Rp)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {branchModalData.map((b) => (
                                <tr key={b.id}>
                                  <td data-column="branch">
                                    <p className="font-extrabold text-slate-800">{b.name}</p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{b.totalItems} Pcs Stok</p>
                                  </td>
                                  <td data-column="capital" className="text-right font-black text-blue-600 whitespace-nowrap">
                                    Rp {b.totalModal.toLocaleString("id-ID")}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr data-summary-row>
                                <td data-column="branch" className="font-black text-[9px] uppercase tracking-widest">Total Konsolidasi HPP</td>
                                <td data-column="capital" className="text-right font-black text-slate-900 whitespace-nowrap">
                                  Rp {branchModalData.reduce((s, x) => s + x.totalModal, 0).toLocaleString("id-ID")}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>

                      {/* MINIMAL AUDIT TRAIL */}
                      <div data-dashboard-stock-audit className="bg-white rounded-3xl border border-slate-200/60 shadow-xl overflow-hidden flex flex-col h-[500px]">
                        <div data-audit-titlebar className="p-3 md:p-4 border-b border-slate-100 bg-white flex items-center gap-3 text-left">
                          <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                            <RefreshCw className="w-5 h-5 animate-spin-slow" />
                          </div>
                          <div className="text-left">
                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest leading-none mb-1">
                              Jejak Audit Stok
                            </h4>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">
                              Riwayat Mutasi Barang
                            </p>
                          </div>
                        </div>

                        <div className="admin-excel-scroll admin-excel-audit-scroll flex-1 overflow-y-auto overflow-x-hidden">
                          <table aria-label="Jejak audit stok" className="admin-excel-table admin-excel-audit-table w-full min-w-0">
                            <thead>
                              <tr>
                                <th scope="col" data-column="time">Waktu</th>
                                <th scope="col" data-column="product">Produk</th>
                                <th scope="col" data-column="branch">Cabang</th>
                                <th scope="col" data-column="movement" className="text-right">Perubahan Stok</th>
                              </tr>
                            </thead>
                            <tbody>
                              {adjustments
                                .slice()
                                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                .slice(0, 30)
                                .map((log) => (
                                  <tr key={log.id} className="text-[10px]">
                                    <td data-column="time" className="font-mono font-bold text-slate-500 whitespace-nowrap">
                                      {new Date(log.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                                    </td>
                                    <td data-column="product">
                                      <p title={products.find((p) => p.id === log.productId)?.name || "N/A"} className="font-extrabold text-slate-800 uppercase tracking-tighter break-words">
                                        {products.find((p) => p.id === log.productId)?.name || "N/A"}
                                      </p>
                                    </td>
                                    <td data-column="branch" title={branches.find((b) => b.id === log.branchId)?.name || "N/A"} className="font-bold text-slate-700 break-words">
                                      <span>
                                        {branches.find((b) => b.id === log.branchId)?.name || "N/A"}
                                      </span>
                                    </td>
                                    <td data-column="movement" className="text-right">
                                      <span className={`px-2 py-0.5 rounded font-black uppercase tracking-widest text-[8px] ${
                                        log.type?.includes("IN") ? "bg-emerald-50 text-emerald-600" : log.type?.includes("OUT") ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                                      }`}>
                                        {log.type} {log.qty > 0 ? `+${log.qty}` : log.qty}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>

        {/* MOBILE BOTTOM NAV */}
        <nav
          className="app-bottom-nav md:hidden fixed bottom-0 w-full bg-white shadow-[0_-6px_14px_rgba(184,194,208,0.45)] dark:shadow-[0_-6px_14px_rgba(0,0,0,0.45)] z-[50] overflow-x-auto hide-scrollbar"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="flex items-center h-16 px-2 min-w-max">
            {getMobileNav().map((item: any) => (
              <button
                key={item.id}
                data-nav-active={activeMenu === item.id ? "true" : undefined}
                onClick={() => {
                  setActiveMenu(item.id);
                  setShowMobileCart(false);
                }}
                className={`shrink-0 w-20 sm:flex-1 shrink-0 flex flex-col items-center justify-center h-full gap-1 transition-colors relative ${
                  activeMenu === item.id
                    ? "text-blue-600"
                    : "text-slate-400 hover:text-slate-600"
                } ${item.locked ? "opacity-60" : ""}`}
              >
                <div className="relative">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
                      activeMenu === item.id
                        ? "bg-blue-50 scale-105 shadow-sm"
                        : ""
                    }`}
                  >
                    <item.icon
                      className={`w-5 h-5 ${activeMenu === item.id ? "fill-current" : ""}`}
                    />
                  </div>
                  {item.locked && (
                    <div className="absolute -top-1 -right-1 bg-amber-500 text-white rounded-full p-0.5 border border-white shadow-[0_0_8px_1px_rgba(245,158,11,0.6)]">
                      <Lock className="w-2 h-2" />
                    </div>
                  )}
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </nav>
      </div>

      {/* --- GLOBAL MODALS --- */}
      {showScanner && (
        <ScannerModal
          onClose={() => setShowScanner(false)}
          onScan={(res) => scannerCallback(res)}
          posContext={activeMenu === "pos"}
        />
      )}


      {quickAuditProduct && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60">
          <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-4 md:p-8">
              <div className="flex justify-between items-start mb-6 text-left">
                <div className="text-left">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-3 py-1 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded-full text-[9px] font-black uppercase tracking-widest">
                      Scan Berhasil
                    </span>
                  </div>
                  <h3 className="text-lg md:text-2xl font-black text-slate-900 leading-tight uppercase tracking-tighter text-left">
                    {quickAuditProduct.name}
                  </h3>
                  <p className="text-xs font-mono text-slate-500 mt-1 text-left">
                    {quickAuditProduct.barcode}
                  </p>
                </div>
                <button
                  onClick={() => setQuickAuditProduct(null)}
                  className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-red-500"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <div className="bg-slate-50 p-3 md:p-5 rounded-[30px] border border-slate-100 text-left">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 text-left">
                    Stok{" "}
                    {branches.find((b) => b.id === auditSelectedBranch)?.name ||
                      "Cabang"}
                  </p>
                  <p className="text-xl md:text-3xl font-black text-slate-900 leading-none text-left">
                    {stocks.find(
                      (s) =>
                        s.branchId === auditSelectedBranch &&
                        s.productId === quickAuditProduct.id,
                    )?.qty || 0}
                  </p>
                </div>
                <div className="bg-blue-50 p-3 md:p-5 rounded-[30px] border border-blue-100 text-left">
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1 text-left">
                    Kategori
                  </p>
                  <p className="text-sm font-black text-blue-700 leading-none truncate text-left">
                    {quickAuditProduct.category}
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-left">
                <div className="bg-slate-50 p-4 md:p-6 rounded-[35px] border border-slate-200">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 text-left">
                        Tambah Kuantitas:
                      </label>
                      <input
                        id="quick-audit-qty"
                        type="number"
                        placeholder="0"
                        className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 md:px-6 py-3 md:py-5 text-lg md:text-2xl font-black text-center focus:ring-4 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all shadow-inner"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-2 text-left">
                        Keterangan / Supplier (Opsional):
                      </label>
                      <input
                        id="quick-audit-note"
                        type="text"
                        placeholder="Keterangan Audit"
                        className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 md:px-6 py-3 md:py-4 text-sm font-black focus:ring-4 focus:ring-blue-100 focus:border-blue-600 outline-none transition-all shadow-inner"
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    const qty = parseInt(
                      (
                        document.getElementById(
                          "quick-audit-qty",
                        ) as HTMLInputElement
                      ).value,
                    );
                    const note = (
                      document.getElementById(
                        "quick-audit-note",
                      ) as HTMLInputElement
                    ).value;
                    if (isNaN(qty) || qty <= 0)
                      return alert("Masukkan jumlah valid!");

                    await handleStockAddition(
                      quickAuditProduct.id,
                      qty,
                      note || "Scan Pemasokan",
                      auditSelectedBranch,
                    );
                    setQuickAuditProduct(null);
                  }}
                  className="w-full bg-slate-900 text-white py-3 md:py-6 rounded-[35px] font-black text-sm uppercase tracking-[0.3em] shadow-2xl shadow-slate-200 hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-3 mt-4"
                >
                  <PackagePlus className="w-5 h-5" /> Patenkan Stok
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    {/* USER FORM MODAL */}
    {showUserForm && (
      <div className="absolute inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
            <h3 className="font-black text-slate-800 uppercase tracking-tight">
              Tambah Akun Login Baru
            </h3>
            <button onClick={() => setShowUserForm(false)} className="text-slate-400 hover:text-red-500">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Username (Login)</label>
              <input 
                type="text" 
                className="w-full border border-slate-200 px-3 py-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                value={newUserDraft.username}
                onChange={(e) => setNewUserDraft({...newUserDraft, username: e.target.value})}
                placeholder="Contoh: kasir_pusat"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Password</label>
              <input 
                type="password" 
                className="w-full border border-slate-200 px-3 py-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                value={newUserDraft.password}
                onChange={(e) => setNewUserDraft({...newUserDraft, password: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Nama Lengkap Petugas</label>
              <input 
                type="text" 
                className="w-full border border-slate-200 px-3 py-2 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                value={newUserDraft.name}
                onChange={(e) => setNewUserDraft({...newUserDraft, name: e.target.value})}
                placeholder="Contoh: Budi Santoso"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Role / Hak Akses</label>
              <CustomSelect
                buttonClassName="w-full border border-slate-200 px-3 py-2 rounded focus:ring-2 focus:ring-blue-500 outline-none font-bold uppercase tracking-widest text-[10px]"
                className="w-full"
                value={newUserDraft.role}
                onChange={(v) => setNewUserDraft({ ...newUserDraft, role: v })}
                options={[
                  { value: "CASHIER", label: "KASIR TOKO" },
                  { value: "ADMIN", label: "ADMIN PUSAT" },
                  { value: "AUDIT", label: "TIM AUDIT" },
                ]}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Penempatan Cabang</label>
              <CustomSelect
                buttonClassName="w-full border border-slate-200 px-3 py-2 rounded focus:ring-2 focus:ring-blue-500 outline-none font-bold uppercase tracking-widest text-[10px]"
                className="w-full"
                value={newUserDraft.branchId}
                onChange={(v) => setNewUserDraft({ ...newUserDraft, branchId: v })}
                placeholder="-- PILIH CABANG --"
                options={[
                  { value: "", label: "-- PILIH CABANG --" },
                  ...branches.map((b) => ({
                    value: b.id,
                    label: b.name.toUpperCase(),
                  })),
                ]}
              />
            </div>
            
            <button 
              onClick={handleCreateUser}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded uppercase tracking-widest text-[11px] shadow-lg transition-all mt-4"
            >
              Simpan Akun Baru
            </button>
          </div>
        </div>
      </div>
    )}

    {/* --- BRAND ALERT TOAST MULTIPLE POPUPS (NO WEB ADDRESS NO DOMAIN SHOWN) --- */}
    <div
      data-notification-stack
      data-notification-screen={
        activeMenu === "pos" || profile?.role === "ADMIN"
          ? "premium"
          : "default"
      }
      className="fixed top-4 right-4 z-[99999] flex flex-col gap-3 max-w-sm w-full pointer-events-none"
    >
      {globalAlerts.map((alert) => (
        <div
          key={alert.id}
          data-alert-toast
          data-alert-type={alert.type}
          role={alert.type === "error" ? "alert" : "status"}
          aria-live={alert.type === "error" ? "assertive" : "polite"}
          aria-atomic="true"
          className={`pointer-events-auto bg-white/90 dark:bg-slate-900/90 text-slate-900 border border-slate-200/80 p-4 rounded-2xl shadow-2xl shadow-slate-900/10 flex items-start gap-3 animate-in slide-in-from-top-4 duration-300 relative border-l-4 ${
            alert.type === "success"
              ? "border-l-emerald-500"
              : alert.type === "error"
                ? "border-l-rose-500"
                : alert.type === "warning"
                  ? "border-l-amber-500"
                  : "border-l-blue-500"
          }`}
        >
          <div
            data-alert-icon
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
              alert.type === "success"
                ? "bg-emerald-500/15"
                : alert.type === "error"
                  ? "bg-rose-500/15"
                  : alert.type === "warning"
                    ? "bg-amber-500/15"
                    : "bg-blue-500/15"
            }`}
          >
            {alert.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : alert.type === "error" ? (
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            ) : alert.type === "warning" ? (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            ) : (
              <Info className="w-4 h-4 text-blue-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p
              data-alert-title
              className={`text-[11px] font-black uppercase tracking-wider ${
                alert.type === "success"
                  ? "text-emerald-500"
                  : alert.type === "error"
                    ? "text-rose-500"
                    : alert.type === "warning"
                      ? "text-amber-500"
                      : "text-blue-500"
              }`}
            >
              {alert.type === "success"
                ? "Berhasil"
                : alert.type === "error"
                  ? "Gagal"
                  : alert.type === "warning"
                    ? "Perhatian"
                    : "Informasi"}
            </p>
            <p data-alert-message className="text-sm font-bold text-slate-700 mt-1 leading-snug break-words">{alert.message}</p>
          </div>
          <button
            onClick={() => setGlobalAlerts((prev) => prev.filter((a) => a.id !== alert.id))}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>

    {/* --- PAYMENT SUCCESS OVERLAY --- */}
    {paymentSuccessOverlay && (
      <div
        data-payment-success-overlay
          data-pos-modal-context={activeMenu === "pos" ? "true" : undefined}
        className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-4 sm:p-6 bg-emerald-950/30 animate-in fade-in duration-200"
        onClick={() => setPaymentSuccessOverlay(null)}
      >
        <div className="w-full max-w-[320px] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-250 ease-out">
          {/* premium success card */}
          <div data-payment-success-card className="rounded-2xl overflow-hidden border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
            {/* inner content */}
            <div className="px-5 py-4 flex items-center gap-4">
              {/* icon */}
              <div className="w-10 h-10 rounded-xl bg-emerald-500/90 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/30">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              {/* text */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black text-emerald-700 uppercase tracking-[0.15em] leading-none mb-1">Pembayaran Berhasil</p>
                <p className="text-[22px] font-black text-slate-900 leading-none tabular-nums tracking-tight">
                  Rp {paymentSuccessOverlay.total.toLocaleString("id-ID")}
                </p>
              </div>
              {/* meta */}
              <div className="text-right shrink-0">
                <p className="text-[10px] font-bold text-slate-500 tabular-nums">{paymentSuccessOverlay.itemCount} pcs</p>
                {paymentSuccessOverlay.saleId && (
                  <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                    #{paymentSuccessOverlay.saleId.slice(-6).toUpperCase()}
                  </p>
                )}
              </div>
            </div>
            {/* progress bar */}
            <div className="h-[3px] bg-white/20 overflow-hidden">
              <div className="h-full bg-emerald-400/80 animate-[shrink_2.5s_linear_forwards]" />
            </div>
          </div>
        </div>
      </div>
    )}

    {/* --- BRAND CONFIRMATION POPUP (NO WEB ADDRESS NO DOMAIN SHOWN) --- */}
    {confirmModal && (
      <div data-confirm-overlay data-pos-modal-context={activeMenu === "pos" ? "true" : undefined} className="fixed inset-0 z-[99999] bg-slate-950/80 flex items-center justify-center p-4">
        <div data-confirm-dialog className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden border border-slate-100 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)] animate-in fade-in zoom-in-95 duration-200">
          <div data-dialog-content className="p-6 text-center">
            <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 stroke-[2.5]" />
            </div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-2">Konfirmasi Tindakan</h3>
            <p className="text-xs text-slate-500 font-bold leading-relaxed">{confirmModal.message}</p>
          </div>
          <div data-dialog-actions className="p-4 bg-slate-50 border-t border-slate-150 flex gap-2">
            <button
              data-dialog-action="cancel"
              onClick={() => {
                confirmModal.resolve(false);
                setConfirmModal(null);
              }}
              className="flex-1 bg-white border border-slate-200 hover:bg-slate-100 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 transition-all text-center cursor-pointer"
            >
              Batal
            </button>
            <button
              data-dialog-action="confirm"
              onClick={() => {
                confirmModal.resolve(true);
                setConfirmModal(null);
              }}
              className="flex-1 bg-slate-900 text-white hover:bg-black py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all text-center cursor-pointer"
            >
              Ya, Setuju
            </button>
          </div>
        </div>
      </div>
    )}

    {/* --- BRAND PROMPT POPUP (NO WEB ADDRESS / DOMAIN SHOWN) --- */}
    {promptModal && (
      <div data-prompt-overlay data-pos-modal-context={activeMenu === "pos" ? "true" : undefined} className="fixed inset-0 z-[99999] bg-slate-950/80 flex items-center justify-center p-4">
        <div data-prompt-dialog className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden border border-slate-100 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)] animate-in fade-in zoom-in-95 duration-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              promptModal.resolve(promptValue);
              setPromptModal(null);
            }}
          >
            <div data-dialog-content className="p-6 text-center">
              <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Edit className="w-6 h-6 stroke-[2.5]" />
              </div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-3">Masukkan Data</h3>
              <p className="text-xs text-slate-500 font-bold leading-relaxed mb-4 whitespace-pre-line">{promptModal.message}</p>
              <input
                autoFocus
                value={promptValue}
                onChange={(e) => setPromptValue(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 py-3 px-4 rounded-2xl text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 text-center"
              />
            </div>
            <div data-dialog-actions className="p-4 bg-slate-50 border-t border-slate-150 flex gap-2">
              <button
                data-dialog-action="cancel"
                type="button"
                onClick={() => {
                  promptModal.resolve(null);
                  setPromptModal(null);
                }}
                className="flex-1 bg-white border border-slate-200 hover:bg-slate-100 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 active:scale-95 transition-all text-center cursor-pointer"
              >
                Batal
              </button>
              <button
                data-dialog-action="confirm"
                type="submit"
                className="flex-1 bg-slate-900 text-white hover:bg-black py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all text-center cursor-pointer"
              >
                Simpan
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* MODAL DAFTAR TRANSAKSI DITAHAN */}
    {showHeldList && (
      <div data-pos-modal-context="true" data-pos-held-overlay className="fixed inset-0 z-[99998] bg-slate-950/80 flex items-center justify-center p-4" onClick={() => setShowHeldList(false)}>
        <div
          data-pos-held-dialog
          className="bg-white w-full max-w-md rounded-[32px] overflow-hidden border border-slate-100 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)] animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-amber-50">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-amber-500 text-white rounded-xl flex items-center justify-center">
                <Hand className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest leading-none">Transaksi Ditahan</h3>
                <p className="text-[8px] font-bold text-amber-700 uppercase tracking-widest mt-1">{heldTransactions.length} transaksi tersimpan</p>
              </div>
            </div>
            <button
              onClick={() => setShowHeldList(false)}
              className="w-9 h-9 bg-white text-slate-400 rounded-xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {heldTransactions.length === 0 ? (
              <div className="py-16 px-6 text-center flex flex-col items-center justify-center opacity-70">
                <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-3 shadow-inner">
                  <Hand className="w-6 h-6 text-slate-300" />
                </div>
                <h5 className="text-[9px] font-black text-slate-700 uppercase tracking-widest mb-1">Belum Ada Transaksi Ditahan</h5>
                <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider leading-relaxed">
                  Isi nota lalu tekan "Tahan Transaksi" untuk menyimpan sementara saat melayani pelanggan lain.
                </p>
              </div>
            ) : (
              heldTransactions.map((h) => (
                <div key={h.id} className="border border-slate-200 rounded-2xl p-3.5 bg-white hover:border-amber-300 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0">
                      <h6 className="text-[11px] font-black text-slate-900 truncate leading-tight">{h.label}</h6>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {h.itemsCount} item • {new Date(h.createdAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <span className="text-[11px] font-black text-slate-900 shrink-0">Rp {h.total.toLocaleString("id-ID")}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => resumeHeldTransaction(h.id)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-1.5"
                    >
                      <ArrowRight className="w-3.5 h-3.5" /> Lanjutkan
                    </button>
                    <button
                      onClick={() => deleteHeldTransaction(h.id)}
                      className="w-11 bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 text-slate-400 hover:text-red-500 rounded-xl flex items-center justify-center active:scale-95 transition-all"
                      title="Hapus transaksi ditahan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// Helpers
const MenuCategory = ({ title }: { title: string }) => (
  <div className="px-3 mt-5 mb-2">
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
      {title}
    </p>
  </div>
);

const HubButton = ({ icon: Icon, label, onClick, active }: any) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 px-3 py-2 border border-slate-400 bg-white hover:bg-slate-100 transition-all font-bold text-slate-800 text-xs sm:text-sm min-w-[140px] flex-1 sm:flex-none h-12 uppercase tracking-tighter ${
      active ? "bg-slate-200 ring-1 ring-inset ring-slate-900" : ""
    }`}
  >
    <Icon className="w-5 h-5 shrink-0" />
    <span className="truncate leading-none">{label}</span>
  </button>
);

const MenuItem = ({
  icon: Icon,
  label,
  active,
  onClick,
  locked,
  badge,
}: {
  icon: any;
  label: string;
  active: boolean;
  onClick: () => void;
  locked?: boolean;
  badge?: number;
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between px-3 py-3 rounded-xl text-xs font-bold transition-all active:shadow-[0_0_24px_4px_rgba(37,99,235,0.7)] ${active ? "bg-blue-600 text-white shadow-[0_0_18px_2px_rgba(37,99,235,0.6)]" : "text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white hover:shadow-[2px_2px_5px_#c2ccd9,-2px_-2px_5px_#ffffff] dark:hover:shadow-[2px_2px_5px_#1c1e24,-2px_-2px_5px_#34373f]"} ${locked ? "opacity-70" : ""}`}
  >
    <div className="flex items-center gap-3">
      <Icon className={`w-[18px] h-[18px] shrink-0 ${active ? "text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]" : "text-slate-400"}`} />
      <span className="uppercase tracking-widest truncate">{label}</span>
    </div>
    <div className="flex items-center gap-1.5">
      {badge != null && badge > 0 && (
        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full leading-none ${active ? "bg-white/25 text-white" : "bg-amber-500 text-white"}`}>
          {badge}
        </span>
      )}
      {locked && <Lock className="w-3 h-3 text-amber-500" />}
    </div>
  </button>
);
