import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Barcode,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  LoaderCircle,
  MapPin,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  ScanLine,
  ShieldAlert,
  X,
} from "lucide-react";

export type AuditBranch = { id: string; name: string };

export type AuditSession = {
  id: string;
  branchId: string;
  branchName: string;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  startedAt: string;
  startedByName: string;
  completedAt?: string | null;
  completedByName?: string | null;
  cancelledAt?: string | null;
  cancelledByName?: string | null;
  summary: {
    totalProducts: number;
    counted: number;
    pending: number;
    counting: number;
    recountRequired: number;
    excluded: number;
    positiveVariance: number;
    negativeVariance: number;
    netVariance: number;
  };
};

export type AuditItem = {
  id: string;
  productId: string;
  productName: string;
  barcode?: string | null;
  masterSN?: string | null;
  status: "PENDING" | "COUNTING" | "COUNTED" | "RECOUNT_REQUIRED" | "EXCLUDED";
  inScope: boolean;
  expectedQty: number;
  systemQty: number;
  countToken?: string;
  baselineQty?: number | null;
  countedQty?: number | null;
  variance?: number | null;
  finding?:
    | "NORMAL"
    | "NOT_FOUND"
    | "EXPIRED"
    | "DAMAGED"
    | "NOT_SOLD_HERE"
    | "UNLISTED_IN_BRANCH"
    | null;
  notes?: string | null;
  countedByName?: string | null;
  countedAt?: string | null;
};

export type AuditPage = { items: AuditItem[]; page: number; pageSize: number; total: number };
export type AuditCandidate = {
  id: string;
  name: string;
  barcode?: string | null;
  masterSN?: string | null;
  branchStockQty: number;
};

export type AuditPageApi = {
  getCurrent(branchId: string, signal: AbortSignal): Promise<AuditSession | null>;
  getItems(
    auditId: string,
    params: { page: number; pageSize: number; search?: string; status?: string },
    signal: AbortSignal,
  ): Promise<AuditPage>;
  searchCandidates(auditId: string, search: string, signal: AbortSignal): Promise<{ items: AuditCandidate[] }>;
  start(branchId: string): Promise<AuditSession>;
  beginCount(auditId: string, itemId: string): Promise<{ baselineQty: number; countToken: string }>;
  saveCount(
    auditId: string,
    itemId: string,
    input: { countedQty: number; finding: string; notes?: string; countToken: string },
  ): Promise<void>;
  reportException(
    auditId: string,
    input: { productId: string; finding: string; notes?: string; countedQty?: number },
  ): Promise<void>;
  revokeBranchVisibility(auditId: string, productId: string, reason: string): Promise<void>;
  finalize(auditId: string): Promise<void>;
  cancel(auditId: string): Promise<void>;
};

type Props = {
  branches: AuditBranch[];
  role: "ADMIN" | "AUDIT";
  userId: string;
  api: AuditPageApi;
};

type Finding = NonNullable<AuditItem["finding"]>;
type CameraScanStatus = "starting" | "scanning" | "searching" | "found" | "not-found" | "error";
type AuditConnectionStatus = "online" | "offline" | "server-error";
type SavedCountDraft = {
  auditId: string;
  itemId: string;
  productName: string;
  countQty: string;
  finding: Finding;
  notes: string;
  countToken: string;
  page: number;
  search: string;
  statusFilter: string;
  startedFromCamera: boolean;
};

const PAGE_SIZE = 25;
const AUDIT_BRANCH_QUERY_PARAM = "auditBranchId";
const FINDINGS: { value: Finding; label: string }[] = [
  { value: "NORMAL", label: "Normal" },
  { value: "NOT_FOUND", label: "Tidak ditemukan (fisik 0)" },
  { value: "EXPIRED", label: "Kedaluwarsa" },
  { value: "DAMAGED", label: "Rusak" },
  { value: "NOT_SOLD_HERE", label: "Tidak dijual di cabang ini" },
];
const STATUS_LABEL: Record<AuditItem["status"], string> = {
  PENDING: "Belum dihitung",
  COUNTING: "Sedang dihitung",
  COUNTED: "Sudah dihitung",
  RECOUNT_REQUIRED: "Hitung ulang",
  EXCLUDED: "Pengecualian",
};
const FINDING_LABEL: Record<string, string> = {
  NORMAL: "Normal",
  NOT_FOUND: "Tidak ditemukan",
  EXPIRED: "Kedaluwarsa",
  DAMAGED: "Rusak",
  NOT_SOLD_HERE: "Tidak dijual di cabang",
  UNLISTED_IN_BRANCH: "Produk di luar cakupan",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Terjadi kendala. Silakan coba lagi.";
}

function readBranchIdFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(AUDIT_BRANCH_QUERY_PARAM) ?? "";
}

function auditBranchStorageKey(userId: string) {
  return `kasirv10:stock-audit-branch:${userId}`;
}

function readSavedAuditBranchId(userId: string) {
  if (typeof window === "undefined" || !userId) return "";
  try {
    return window.localStorage.getItem(auditBranchStorageKey(userId)) ?? "";
  } catch {
    return "";
  }
}

function saveAuditBranchId(userId: string, branchId: string) {
  if (typeof window === "undefined" || !userId) return;
  try {
    if (branchId) window.localStorage.setItem(auditBranchStorageKey(userId), branchId);
    else window.localStorage.removeItem(auditBranchStorageKey(userId));
  } catch {
    // URL persistence still works if browser storage is unavailable.
  }
}

function readInitialBranchId(userId: string) {
  return readBranchIdFromUrl() || readSavedAuditBranchId(userId);
}

function writeBranchIdToUrl(branchId: string) {
  const url = new URL(window.location.href);
  if (branchId) url.searchParams.set(AUDIT_BRANCH_QUERY_PARAM, branchId);
  else url.searchParams.delete(AUDIT_BRANCH_QUERY_PARAM);
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function countDraftKey(userId: string, auditId: string) {
  return `kasirv10:stock-audit-count-draft:${userId}:${auditId}`;
}

function removeCountDraft(userId: string, auditId: string) {
  try {
    localStorage.removeItem(countDraftKey(userId, auditId));
  } catch {
    // A browser with disabled storage should still allow the audit to proceed.
  }
}

function readCountDraft(userId: string, auditId: string): SavedCountDraft | null {
  try {
    const raw = localStorage.getItem(countDraftKey(userId, auditId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SavedCountDraft>;
    if (
      value.auditId !== auditId ||
      typeof value.itemId !== "string" ||
      typeof value.productName !== "string" ||
      typeof value.countQty !== "string" ||
      typeof value.countToken !== "string" ||
      !Number.isInteger(value.page) ||
      !["NORMAL", "NOT_FOUND", "EXPIRED", "DAMAGED", "NOT_SOLD_HERE"].includes(String(value.finding)) ||
      typeof value.notes !== "string" ||
      typeof value.search !== "string" ||
      typeof value.statusFilter !== "string" ||
      typeof value.startedFromCamera !== "boolean"
    ) {
      localStorage.removeItem(countDraftKey(userId, auditId));
      return null;
    }
    return value as SavedCountDraft;
  } catch {
    return null;
  }
}

function cameraFailureMessage(error: unknown) {
  const name = typeof error === "object" && error !== null && "name" in error
    ? String((error as { name?: unknown }).name ?? "")
    : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Izin kamera ditolak. Izinkan akses kamera di pengaturan browser, lalu coba lagi.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Kamera tidak ditemukan pada perangkat ini.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Kamera sedang digunakan aplikasi lain. Tutup aplikasi tersebut lalu coba lagi.";
  }
  if (name === "SecurityError") {
    return "Kamera hanya dapat digunakan melalui HTTPS atau localhost.";
  }
  return "Kamera tidak dapat dibuka. Periksa izin kamera dan dukungan browser, lalu coba lagi.";
}

function barcodeMatches(storedValue: string | null | undefined, scannedValue: string) {
  const stored = storedValue?.trim();
  const scanned = scannedValue.trim();
  if (!stored || !scanned) return false;
  if (stored === scanned) return true;
  if (!/^\d+$/.test(stored) || !/^\d+$/.test(scanned)) return false;
  return (scanned.length === 12 && stored === `0${scanned}`)
    || (stored.length === 13 && stored.startsWith("0") && stored.slice(1) === scanned);
}

export default function BranchStockAuditPage({ branches, role, userId, api }: Props) {
  const [branchId, setBranchId] = useState(() => readInitialBranchId(userId));
  const [session, setSession] = useState<AuditSession | null>(null);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loadedItemsQuery, setLoadedItemsQuery] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loadingSession, setLoadingSession] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editorItem, setEditorItem] = useState<AuditItem | null>(null);
  const [baselineQty, setBaselineQty] = useState<number | null>(null);
  const [countToken, setCountToken] = useState("");
  const [countQty, setCountQty] = useState("");
  const [finding, setFinding] = useState<Finding>("NORMAL");
  const [notes, setNotes] = useState("");
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [exceptionSearch, setExceptionSearch] = useState("");
  const [exceptionCandidates, setExceptionCandidates] = useState<AuditCandidate[]>([]);
  const [selectedExceptionProduct, setSelectedExceptionProduct] = useState<AuditCandidate | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [exceptionFinding, setExceptionFinding] = useState<Finding>("UNLISTED_IN_BRANCH");
  const [exceptionQty, setExceptionQty] = useState("");
  const [exceptionNotes, setExceptionNotes] = useState("");
  const [visibilityRevokeItem, setVisibilityRevokeItem] = useState<AuditItem | null>(null);
  const [visibilityRevokeReason, setVisibilityRevokeReason] = useState("Tidak dijual di cabang ini");
  const [confirmAction, setConfirmAction] = useState<"finalize" | "cancel" | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [cameraStatus, setCameraStatus] = useState<CameraScanStatus>("starting");
  const [cameraMessage, setCameraMessage] = useState("");
  const [cameraCode, setCameraCode] = useState("");
  const [cameraResult, setCameraResult] = useState<AuditItem | null>(null);
  const [scanNextAvailable, setScanNextAvailable] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<AuditConnectionStatus>(() =>
    typeof navigator === "undefined" || navigator.onLine ? "online" : "offline",
  );
  const [recoveredDraft, setRecoveredDraft] = useState<{
    productName: string;
    countQty: string;
    item: AuditItem | null;
    countToken: string;
    stale: boolean;
    startedFromCamera: boolean;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeScannerRef = useRef<Html5Qrcode | null>(null);
  const scannerHandledRef = useRef(false);
  const cameraCountItemRef = useRef<string | null>(null);
  const loadedSessionRef = useRef<{ branchId: string; sessionId: string | null } | null>(null);
  const restoredDraftForSessionRef = useRef("");
  const reload = useCallback(() => setRefreshIndex((value) => value + 1), []);

  const selectedBranch = branches.find((branch) => branch.id === branchId);
  const branchAllowed = Boolean(selectedBranch);
  const isActive = session?.status === "IN_PROGRESS";
  const canWork = Boolean(branchId && isActive && !actionBusy);
  const pageCount = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const completion = session?.summary.totalProducts
    ? Math.min(100, Math.round((session.summary.counted / session.summary.totalProducts) * 100))
    : 0;
  const canFinalize = Boolean(
    isActive &&
      session?.summary.pending === 0 &&
      session.summary.counting === 0 &&
      session.summary.recountRequired === 0,
  );

  const loadCurrent = useCallback(async (id: string, signal: AbortSignal) => {
    setLoadingSession(true);
    setError("");
    try {
      const current = await api.getCurrent(id, signal);
      if (!signal.aborted) {
        const nextSessionId = current?.id ?? null;
        const newSession = loadedSessionRef.current?.branchId !== id ||
          loadedSessionRef.current.sessionId !== nextSessionId;
        if (newSession) {
          setPage(1);
          setItems([]);
          setTotalItems(0);
          setLoadedItemsQuery("");
          restoredDraftForSessionRef.current = "";
          if (current && userId) {
            const draft = readCountDraft(userId, current.id);
            if (draft) {
              setPage(draft.page);
              setSearch(draft.search);
              setStatusFilter(draft.statusFilter);
            }
          }
        }
        loadedSessionRef.current = { branchId: id, sessionId: nextSessionId };
        setSession(current);
        setConnectionStatus("online");
      }
    } catch (loadError) {
      if (!signal.aborted) {
        setError(errorMessage(loadError));
        setConnectionStatus(navigator.onLine ? "server-error" : "offline");
      }
    } finally {
      if (!signal.aborted) setLoadingSession(false);
    }
  }, [api, userId]);

  useEffect(() => {
    // The branch list is fetched asynchronously by App. Keep the saved choice
    // until that list arrives; otherwise a normal reload clears it on first render.
    if (branchId && branches.length > 0 && !branches.some((branch) => branch.id === branchId)) {
      setBranchId("");
      writeBranchIdToUrl("");
      saveAuditBranchId(userId, "");
      setSession(null);
      setItems([]);
      setTotalItems(0);
      setLoadedItemsQuery("");
      loadedSessionRef.current = null;
    }
  }, [branches, branchId, userId]);

  useEffect(() => {
    if (!branchId || !branches.some((branch) => branch.id === branchId)) return;
    saveAuditBranchId(userId, branchId);
    writeBranchIdToUrl(branchId);
  }, [branches, branchId, userId]);

  useEffect(() => {
    if (!branchId || !branchAllowed) {
      setSession(null);
      setItems([]);
      setTotalItems(0);
      setLoadedItemsQuery("");
      setLoadingSession(false);
      loadedSessionRef.current = null;
      return;
    }
    const controller = new AbortController();
    void loadCurrent(branchId, controller.signal);
    return () => controller.abort();
  }, [branchAllowed, branchId, loadCurrent, refreshIndex]);

  useEffect(() => {
    if (!branchId || !branchAllowed || !session?.id) return;
    const controller = new AbortController();
    setLoadingItems(true);
    setItems([]);
    setLoadedItemsQuery("");
    setError("");
    const queryKey = `${session.id}:${page}:${search.trim()}:${statusFilter}`;
    void api
      .getItems(session.id, {
        page,
        pageSize: PAGE_SIZE,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
      }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setItems(result.items);
          setTotalItems(result.total);
          setLoadedItemsQuery(queryKey);
          setConnectionStatus("online");
        }
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(loadError));
          setConnectionStatus(navigator.onLine ? "server-error" : "offline");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingItems(false);
      });
    return () => controller.abort();
  }, [api, branchAllowed, branchId, session?.id, page, search, statusFilter, refreshIndex]);

  useEffect(() => {
    const queryKey = session?.id ? `${session.id}:${page}:${search.trim()}:${statusFilter}` : "";
    if (!session?.id || !userId || loadingItems || error || loadedItemsQuery !== queryKey) return;
    const restoreKey = `${userId}:${session.id}`;
    if (restoredDraftForSessionRef.current === restoreKey) return;
    restoredDraftForSessionRef.current = restoreKey;

    const draft = readCountDraft(userId, session.id);
    if (!draft) return;
    const item = items.find((candidate) => candidate.id === draft.itemId);
    if (
      item?.status === "COUNTING" &&
      item.countToken === draft.countToken &&
      item.baselineQty != null
    ) {
      setBaselineQty(item.baselineQty);
      setCountToken(draft.countToken);
      setCountQty(draft.countQty);
      setFinding(draft.finding);
      setNotes(draft.notes);
      setEditorItem(item);
      cameraCountItemRef.current = draft.startedFromCamera ? item.id : null;
      setNotice("Draft hitungan yang belum disimpan berhasil dipulihkan.");
      return;
    }

    setRecoveredDraft({
      productName: draft.productName,
      countQty: draft.countQty,
      item: item ?? null,
      countToken: draft.countToken,
      stale: true,
      startedFromCamera: draft.startedFromCamera,
    });
  }, [error, items, loadedItemsQuery, loadingItems, page, search, session?.id, statusFilter, userId]);

  useEffect(() => {
    if (!session?.id || !editorItem || !userId || !countToken) return;
    const draft: SavedCountDraft = {
      auditId: session.id,
      itemId: editorItem.id,
      productName: editorItem.productName,
      countQty,
      finding,
      notes,
      countToken,
      page,
      search,
      statusFilter,
      startedFromCamera: cameraCountItemRef.current === editorItem.id,
    };
    try {
      localStorage.setItem(countDraftKey(userId, session.id), JSON.stringify(draft));
    } catch {
      setError("Draft hitungan tidak dapat disimpan pada perangkat ini. Jangan muat ulang sebelum hitungan disimpan.");
    }
  }, [countQty, countToken, editorItem, finding, notes, page, search, session?.id, statusFilter, userId]);

  useEffect(() => {
    if (!branchId || !branchAllowed || !session?.id || session.status !== "IN_PROGRESS") return;

    const controller = new AbortController();
    let inFlight = false;
    const syncAuditData = async () => {
      if (inFlight || controller.signal.aborted || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const current = await api.getCurrent(branchId, controller.signal);
        if (controller.signal.aborted) return;
        if (current?.id !== session.id) {
          setSession(current);
          setItems([]);
          setTotalItems(0);
          setConnectionStatus("online");
          return;
        }
        const latestItems = await api.getItems(session.id, {
          page,
          pageSize: PAGE_SIZE,
          search: search.trim() || undefined,
          status: statusFilter || undefined,
        }, controller.signal);
        if (!controller.signal.aborted) {
          setSession(current);
          setItems(latestItems.items);
          setTotalItems(latestItems.total);
          setConnectionStatus("online");
        }
      } catch {
        if (!controller.signal.aborted) {
          setConnectionStatus(navigator.onLine ? "server-error" : "offline");
        }
      } finally {
        inFlight = false;
      }
    };
    const timer = window.setInterval(() => void syncAuditData(), 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void syncAuditData();
    };
    const onOnline = () => {
      setConnectionStatus("server-error");
      void syncAuditData();
    };
    const onOffline = () => setConnectionStatus("offline");
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [api, branchAllowed, branchId, session?.id, session?.status, page, search, statusFilter]);

  useEffect(() => {
    const query = exceptionSearch.trim();
    if (!exceptionOpen || !session?.id || query.length < 2 || selectedExceptionProduct) {
      setExceptionCandidates([]);
      setLoadingCandidates(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoadingCandidates(true);
      void api.searchCandidates(session.id, query, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setExceptionCandidates(result.items);
        })
        .catch((searchError: unknown) => {
          if (!controller.signal.aborted) setError(errorMessage(searchError));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingCandidates(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [api, exceptionOpen, exceptionSearch, selectedExceptionProduct, session?.id]);

  const runAction = useCallback(async (
    label: string,
    operation: () => Promise<void>,
    refreshAfter = true,
  ) => {
    setActionBusy(label);
    setError("");
    setNotice("");
    try {
      await operation();
      setNotice(label);
      if (refreshAfter) reload();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setActionBusy("");
    }
  }, [reload]);

  const startSession = () => {
    if (!branchId) return;
    void runAction("Sesi audit dimulai.", async () => {
      const created = await api.start(branchId);
      loadedSessionRef.current = { branchId, sessionId: created.id };
      setSession(created);
      setPage(1);
    }, false);
  };

  const openCount = async (item: AuditItem) => {
    if (!session || !canWork || !item.inScope) return false;
    if (recoveredDraft && recoveredDraft.item?.id !== item.id) {
      setError("Lanjutkan atau buang draft hitungan sebelumnya sebelum membuka produk lain.");
      return false;
    }
    setError("");
    setNotice("");
    setActionBusy("Menyiapkan hitung…");
    try {
      const result = await api.beginCount(session.id, item.id);
      const countingItem = {
        ...item,
        status: "COUNTING" as const,
        countToken: result.countToken,
        baselineQty: result.baselineQty,
      };
      setBaselineQty(result.baselineQty);
      setCountToken(result.countToken);
      setItems((current) => current.map((candidate) => candidate.id === item.id ? countingItem : candidate));
      if (recoveredDraft?.item?.id === item.id) {
        removeCountDraft(userId, session.id);
        setRecoveredDraft(null);
      }
      setCountQty(String(item.countedQty ?? ""));
      setFinding((item.finding as Finding) || "NORMAL");
      setNotes(item.notes ?? "");
      setEditorItem(countingItem);
      return true;
    } catch (countError) {
      setError(errorMessage(countError));
      reload();
      return false;
    } finally {
      setActionBusy("");
    }
  };

  const handleCameraBarcode = useCallback(async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code || !session?.id) {
      setCameraMessage("Pilih cabang dan mulai sesi audit sebelum memindai.");
      setCameraStatus("error");
      return;
    }

    setCameraCode(code);
    setCameraResult(null);
    setCameraMessage("");
    setCameraStatus("searching");

    try {
      const result = await api.getItems(
        session.id,
        { page: 1, pageSize: PAGE_SIZE, search: code },
        new AbortController().signal,
      );
      const product = result.items.find((item) =>
        [item.barcode, item.masterSN].some((value) => barcodeMatches(value, code)),
      );

      if (!product || !product.inScope || product.status === "EXCLUDED") {
        setCameraMessage("Barcode tidak ditemukan dalam daftar audit cabang yang dipilih.");
        setCameraStatus("not-found");
        return;
      }

      setCameraResult(product);
      setSearch(code);
      setStatusFilter("");
      setPage(1);
      setCameraStatus("found");
    } catch (lookupError) {
      setCameraMessage(errorMessage(lookupError));
      setCameraStatus("error");
    }
  }, [api, session?.id]);

  useEffect(() => {
    if (!cameraOpen) return;

    let cancelled = false;
    let scanner: Html5Qrcode | null = null;
    let stopPromise: Promise<void> | null = null;
    let startSettled = false;
    scannerHandledRef.current = false;
    setCameraStatus("starting");
    setCameraMessage("");
    setCameraCode("");
    setCameraResult(null);

    const stopScanner = () => {
      if (!scanner) return Promise.resolve();
      if (!stopPromise) {
        stopPromise = (async () => {
          if (scanner?.isScanning) {
            try {
              await scanner.stop();
            } catch {
              // Teardown is best-effort when permission or camera startup failed.
            }
          }
          try {
            scanner?.clear();
          } catch {
            // The scanner may not have completed initialization.
          }
          if (barcodeScannerRef.current === scanner) barcodeScannerRef.current = null;
        })();
      }
      return stopPromise;
    };

    const startScanner = async () => {
      if (!window.isSecureContext) {
        setCameraMessage("Kamera hanya dapat digunakan melalui HTTPS atau localhost.");
        setCameraStatus("error");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraMessage("Browser ini tidak mendukung akses kamera. Gunakan browser Android terbaru melalui HTTPS.");
        setCameraStatus("error");
        return;
      }

      try {
        if (cancelled) return;
        const reader = document.getElementById("audit-camera-reader");
        if (!reader) throw new Error("Area kamera belum siap.");

        scanner = new Html5Qrcode("audit-camera-reader", {
          verbose: false,
          useBarCodeDetectorIfSupported: true,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.CODE_128,
          ],
        });
        barcodeScannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (cancelled || scannerHandledRef.current) return;
            scannerHandledRef.current = true;
            setCameraStatus("searching");
            void stopScanner().then(() => {
              if (!cancelled) void handleCameraBarcode(decodedText);
            });
          },
          () => {},
        );
        startSettled = true;
        if (cancelled) {
          await stopScanner();
          return;
        }
        if (!scannerHandledRef.current) setCameraStatus("scanning");
      } catch (cameraError) {
        startSettled = true;
        await stopScanner();
        if (!cancelled) {
          setCameraMessage(cameraFailureMessage(cameraError));
          setCameraStatus("error");
        }
      }
    };

    void startScanner();
    return () => {
      cancelled = true;
      scannerHandledRef.current = true;
      if (startSettled) void stopScanner();
    };
  }, [cameraOpen, cameraAttempt, handleCameraBarcode]);

  const openCameraScanner = () => {
    if (!canWork || !session) return;
    setScanNextAvailable(false);
    setCameraMessage("");
    setCameraResult(null);
    setCameraAttempt((attempt) => attempt + 1);
    setCameraOpen(true);
  };

  const retryCameraScan = () => {
    scannerHandledRef.current = false;
    setCameraMessage("");
    setCameraResult(null);
    setCameraAttempt((attempt) => attempt + 1);
  };

  const closeCountEditor = () => {
    if (editorItem && countToken) {
      setRecoveredDraft({
        productName: editorItem.productName,
        countQty,
        item: editorItem,
        countToken,
        stale: false,
        startedFromCamera: cameraCountItemRef.current === editorItem.id,
      });
    }
    cameraCountItemRef.current = null;
    setEditorItem(null);
  };

  const startCountFromCamera = async () => {
    if (!cameraResult || cameraResult.status === "COUNTED") return;
    setCameraOpen(false);
    const opened = await openCount(cameraResult);
    if (opened) {
      cameraCountItemRef.current = cameraResult.id;
      setScanNextAvailable(false);
    }
  };

  const saveItemCount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !editorItem) return;
    const quantity = Number(countQty);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError("Masukkan jumlah fisik berupa bilangan bulat nol atau lebih.");
      return;
    }
    if (finding === "NOT_FOUND" && quantity !== 0) {
      setError("Temuan Tidak ditemukan harus disimpan dengan jumlah fisik 0.");
      return;
    }
    const savedFromCamera = cameraCountItemRef.current === editorItem.id;
    await runAction("Hitungan tersimpan.", async () => {
      await api.saveCount(session.id, editorItem.id, {
        countedQty: quantity,
        finding,
        notes: notes.trim() || undefined,
        countToken,
      });
      removeCountDraft(userId, session.id);
      setRecoveredDraft(null);
      setEditorItem(null);
      if (savedFromCamera) {
        cameraCountItemRef.current = null;
        setScanNextAvailable(true);
      }
    });
  };

  const reportException = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !selectedExceptionProduct) return;
    const parsed = exceptionQty.trim() ? Number(exceptionQty) : undefined;
    if (parsed !== undefined && (!Number.isInteger(parsed) || parsed < 0)) {
      setError("Jumlah fisik harus berupa bilangan bulat nol atau lebih.");
      return;
    }
    await runAction("Pengecualian tercatat; stok tidak diubah.", async () => {
      await api.reportException(session.id, {
        productId: selectedExceptionProduct.id,
        finding: exceptionFinding,
        notes: exceptionNotes.trim() || undefined,
        countedQty: parsed,
      });
      setExceptionOpen(false);
      setExceptionSearch("");
      setExceptionCandidates([]);
      setSelectedExceptionProduct(null);
      setExceptionNotes("");
      setExceptionQty("");
    });
  };

  const revokeBranchVisibility = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !visibilityRevokeItem) return;
    const reason = visibilityRevokeReason.trim();
    if (reason.length < 3) {
      setError("Alasan pencabutan minimal 3 karakter.");
      return;
    }
    await runAction("Izin cabang dicabut; produk dikeluarkan dari cakupan hitung.", async () => {
      await api.revokeBranchVisibility(session.id, visibilityRevokeItem.productId, reason);
      removeCountDraft(userId, session.id);
      setRecoveredDraft(null);
      setVisibilityRevokeItem(null);
      setVisibilityRevokeReason("Tidak dijual di cabang ini");
    });
  };

  const performConfirmation = async () => {
    if (!session || !confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    if (action === "finalize") {
      if (!canFinalize) return;
      await runAction("Audit selesai dan rekonsiliasi diterapkan.", async () => {
        await api.finalize(session.id);
        removeCountDraft(userId, session.id);
        setRecoveredDraft(null);
      });
    } else {
      await runAction("Audit dibatalkan. Riwayat audit tetap tersimpan.", async () => {
        await api.cancel(session.id);
        removeCountDraft(userId, session.id);
        setRecoveredDraft(null);
      });
    }
  };

  const filteredSummary = session?.summary;

  return (
    <div data-testid="page-branch-stock-audit" data-ui-screen="stock_audit" className="h-full min-h-0 w-full min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-[#edf1f2] px-3 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-2 text-[#18363b] sm:px-5 sm:pb-8 sm:pt-4 md:pb-6 lg:px-8">
      <div className="mx-auto w-full min-w-0 max-w-full space-y-3 sm:max-w-[1440px] sm:space-y-4">
        <header className="relative w-full min-w-0 overflow-hidden rounded-2xl bg-[#173b3d] px-3 py-3 text-[#f4f4e9] shadow-[0_8px_22px_rgba(23,59,61,.12)] sm:rounded-[20px] sm:px-5 sm:py-4">
          <div className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full border border-[#d6b96a]/20" />
          <div className="pointer-events-none absolute -right-1 top-[-5.5rem] h-56 w-56 rounded-full border border-[#d6b96a]/20" />
          <div className="relative flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[.14em] text-[#d6b96a] sm:mb-2 sm:tracking-[.22em]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#d6b96a]" />
                Alfath Pulsa <span className="text-[#86a7a1]">/</span> Pengendalian stok
              </div>
              <h1 className="break-words text-lg font-black tracking-[-.035em] sm:text-2xl sm:tracking-[-.045em]">Audit stok cabang</h1>
              <p className="mt-1 max-w-full break-words text-[11px] leading-4 text-[#c5d5d0] sm:max-w-xl sm:text-xs sm:leading-5">
                Hitung fisik tanpa menghentikan transaksi. Saat finalisasi, selisih terkonfirmasi diterapkan pada stok terkini.
              </p>
            </div>
            <div className="flex w-full min-w-0 flex-col gap-1.5 md:w-[270px] md:shrink-0">
              <label htmlFor="audit-branch" className="text-[11px] font-bold uppercase tracking-[.14em] text-[#a9c3bd]">
                Cabang yang diaudit <span className="text-[#e3c975]">· wajib</span>
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#d6b96a]" />
                <select
                  id="audit-branch"
                  data-testid="select-audit-branch"
                  disabled={Boolean(actionBusy || loadingSession || isActive || editorItem || exceptionOpen || confirmAction || cameraOpen)}
                  value={branchId}
                  onChange={(event) => {
                    const nextBranchId = event.target.value;
                    setBranchId(nextBranchId);
                    writeBranchIdToUrl(nextBranchId);
                    saveAuditBranchId(userId, nextBranchId);
                    setSession(null);
                    setItems([]);
                    setTotalItems(0);
                    setLoadedItemsQuery("");
                    loadedSessionRef.current = null;
                    restoredDraftForSessionRef.current = "";
                    setSearch("");
                    setStatusFilter("");
                    setRecoveredDraft(null);
                    setError("");
                    setNotice("");
                  }}
                  className="min-h-11 w-full min-w-0 max-w-full appearance-none rounded-xl border border-white/15 bg-[#21494a] py-2.5 pl-10 pr-4 text-xs font-semibold text-[#f4f4e9] shadow-none outline-none transition focus:border-[#d6b96a] focus:ring-2 focus:ring-[#d6b96a]/30 disabled:cursor-not-allowed disabled:opacity-80"
                >
                  <option value="">Pilih cabang…</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="relative mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/10 pt-2.5 text-[11px] text-[#bdd0ca] sm:mt-4 sm:gap-x-4">
            <span className="inline-flex min-w-0 max-w-full items-center gap-2 break-words"><span className="h-2 w-2 shrink-0 rounded-full bg-[#d6b96a]" /> Stok operasional tetap aktif</span>
            <span className="hidden h-3 w-px bg-white/20 sm:block" />
            <span className="min-w-0 max-w-full break-words">Cabang punya sesi audit yang terpisah</span>
            <span data-testid="status-audit-connection" aria-live="polite" className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${connectionStatus === "online" ? "border-emerald-200/20 text-[#c8dfd1]" : connectionStatus === "offline" ? "border-amber-200/30 text-[#ffe1a5]" : "border-rose-200/30 text-[#ffc8b9]"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${connectionStatus === "online" ? "bg-emerald-300" : connectionStatus === "offline" ? "bg-amber-300" : "bg-rose-300"}`} />
              {connectionStatus === "online" ? "Terhubung" : connectionStatus === "offline" ? "Offline" : "Server belum tersinkron"}
            </span>
            <span className="ml-auto rounded-full border border-white/15 px-2.5 py-1 font-mono text-[11px] tracking-[.12em] text-[#d6b96a]">{role}</span>
          </div>
        </header>

        {error && (
          <div role="alert" data-testid="alert-audit-error" className="flex items-start gap-3 rounded-xl border border-[#e6b8ac] bg-[#fff4ef] px-4 py-3 text-sm text-[#803e31]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1"><p className="font-bold">Belum berhasil dimuat</p><p className="mt-0.5 break-words text-xs">{error}</p></div>
            <button type="button" data-testid="button-audit-retry" onClick={reload} className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold hover:bg-[#f9e4dc]">Coba lagi</button>
          </div>
        )}
        {notice && (
          <div role="status" data-testid="status-audit-notice" className="flex items-center gap-2 rounded-xl border border-[#b7d3c5] bg-[#eef7f1] px-4 py-3 text-sm font-semibold text-[#286044]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />{notice}
          </div>
        )}
        {connectionStatus !== "online" && branchId && (
          <div role="status" data-testid="notice-audit-connection" className="flex min-w-0 items-start gap-2 rounded-xl border border-[#ead6a2] bg-[#fff8e5] px-3 py-2.5 text-xs leading-5 text-[#735f2b] sm:px-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1 break-words">
              {connectionStatus === "offline"
                ? "Koneksi perangkat terputus. Data yang tampil mungkin belum terbaru; sesi dan hitungan tersimpan tetap berada di server."
                : "Server belum tersinkron. Sesi audit tidak dibuat ulang; coba segarkan setelah koneksi kembali."}
            </p>
            <button type="button" data-testid="button-audit-sync-retry" onClick={reload} className="shrink-0 rounded-lg px-2 py-1 font-bold hover:bg-[#f6edcf]">Coba lagi</button>
          </div>
        )}
        {recoveredDraft && session && userId && (
          <div role="status" data-testid="notice-stale-count-draft" className="flex min-w-0 flex-col gap-2 rounded-xl border border-[#e7d3a0] bg-[#fff8e5] px-3 py-3 text-xs leading-5 text-[#735f2b] sm:flex-row sm:items-start sm:px-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1 break-words">
              {recoveredDraft.stale
                ? <>Draft hitungan {recoveredDraft.productName} ({recoveredDraft.countQty || "belum diisi"}) masih tersimpan di perangkat, tetapi status atau token server sudah berubah. Nilai draft tidak diterapkan. {recoveredDraft.item?.status === "COUNTING" ? "Produk sedang dihitung pengguna lain; jangan mengambil alih hitungan aktif." : "Periksa produk sebelum memulai hitung fisik baru."}</>
                : <>Draft hitungan {recoveredDraft.productName} ({recoveredDraft.countQty || "belum diisi"}) tersimpan di perangkat dan belum dikirim ke server. Lanjutkan draft untuk menyimpan hitungan, atau hitung ulang jika stok bergerak.</>}
            </div>
            {!recoveredDraft.stale && recoveredDraft.item?.status === "COUNTING" && recoveredDraft.item.countToken === recoveredDraft.countToken && (
              <button
                type="button"
                data-testid="button-resume-count-draft"
                onClick={() => {
                  setBaselineQty(recoveredDraft.item?.baselineQty ?? 0);
                  setCountToken(recoveredDraft.countToken);
                  setCountQty(recoveredDraft.countQty);
                  setFinding((recoveredDraft.item?.finding as Finding) || "NORMAL");
                  setNotes(recoveredDraft.item?.notes ?? "");
                  setEditorItem(recoveredDraft.item);
                  cameraCountItemRef.current = recoveredDraft.startedFromCamera ? recoveredDraft.item?.id ?? null : null;
                  setRecoveredDraft(null);
                }}
                className="self-end shrink-0 rounded-lg bg-[#735f2b] px-3 py-2 font-bold text-white hover:bg-[#5d4d24] sm:self-auto"
              >
                Lanjutkan draft
              </button>
            )}
            {recoveredDraft.stale && recoveredDraft.item?.inScope && recoveredDraft.item.status !== "COUNTING" && isActive && (
              <button
                type="button"
                data-testid="button-recount-stale-draft"
                onClick={() => void openCount(recoveredDraft.item!)}
                className="self-end shrink-0 rounded-lg bg-[#735f2b] px-3 py-2 font-bold text-white hover:bg-[#5d4d24] sm:self-auto"
              >
                Hitung ulang
              </button>
            )}
            {recoveredDraft.stale && (
              <button
                type="button"
                data-testid="button-dismiss-stale-count-draft"
                onClick={() => {
                  removeCountDraft(userId, session.id);
                  setRecoveredDraft(null);
                }}
                className="self-end shrink-0 rounded-lg px-2 py-1 font-bold hover:bg-[#f6edcf] sm:self-auto"
              >
                Buang draft lama
              </button>
            )}
          </div>
        )}
        {scanNextAvailable && isActive && (
          <div role="status" data-testid="status-scan-next" className="flex flex-col gap-3 rounded-xl border border-[#b7d3c5] bg-[#eef7f1] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#286044]">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> Hitungan barcode tersimpan. Anda dapat memindai produk berikutnya.
            </p>
            <button type="button" data-testid="button-scan-next-product" onClick={openCameraScanner} disabled={!canWork} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1b5651] px-4 text-xs font-bold text-white hover:bg-[#174944] disabled:opacity-50">
              <ScanLine className="h-4 w-4" /> Scan produk berikutnya
            </button>
          </div>
        )}

        {!branchId ? (
          <section data-testid="empty-audit-branch" className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#b8c8c4] bg-[#f5f7f5] px-5 text-center sm:min-h-[260px]">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#dce9e4] text-[#285d58]"><MapPin className="h-5 w-5" /></div>
            <h2 className="text-base font-extrabold tracking-tight">Mulai dari memilih cabang</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-[#657d7a]">Sesi, daftar produk, dan progres hanya ditampilkan untuk cabang yang dipilih. Belum ada hitungan yang dimulai.</p>
            {branches.length === 0 && <p className="mt-4 text-xs font-semibold text-[#8d5d39]">Daftar cabang belum tersedia.</p>}
          </section>
        ) : loadingSession && !session ? (
          <section aria-label="Memuat sesi audit" data-testid="loading-audit-session" className="space-y-4">
            <div className="h-36 animate-pulse rounded-[22px] bg-[#dce4e2]" />
            <div className="h-16 animate-pulse rounded-xl bg-[#dce4e2]" />
            <div className="h-72 animate-pulse rounded-[22px] bg-[#dce4e2]" />
          </section>
        ) : !session ? (
          <section data-testid="empty-audit-session" className="flex min-h-[230px] flex-col items-center justify-center rounded-2xl border border-[#d5dfdc] bg-[#f7f8f4] px-5 text-center shadow-[0_5px_20px_rgba(26,64,66,.035)] sm:min-h-[270px]">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#e9e3c9] text-[#755d1d]"><ClipboardCheck className="h-5 w-5" /></div>
            <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#8e7943]">Belum ada sesi aktif</p>
            <h2 className="mt-2 text-lg font-black tracking-tight">Siap menghitung {selectedBranch?.name ?? "cabang ini"}?</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-[#687b77]">Sesi baru memuat cakupan produk cabang dari server. Pergerakan stok tetap berjalan; item yang berubah saat dihitung akan ditandai untuk hitung ulang.</p>
            <button type="button" data-testid="button-start-audit" disabled={Boolean(actionBusy)} onClick={startSession} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1b5651] px-5 text-sm font-bold text-white shadow-[0_5px_12px_rgba(27,86,81,.16)] hover:bg-[#174944] disabled:cursor-wait disabled:opacity-60">
              {actionBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Mulai sesi audit
            </button>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-[#d7e0dc] bg-[#f8f9f5] p-3 shadow-[0_4px_15px_rgba(26,64,66,.035)] sm:p-4" data-testid="panel-audit-progress">
              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span data-testid="status-audit-session" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[.1em] ${session.status === "IN_PROGRESS" ? "bg-[#e6edda] text-[#455c2c]" : session.status === "COMPLETED" ? "bg-[#dcece4] text-[#286044]" : "bg-[#eee4df] text-[#805144]"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${session.status === "IN_PROGRESS" ? "bg-[#82933d]" : session.status === "COMPLETED" ? "bg-[#39845c]" : "bg-[#9a6b58]"}`} />
                      {session.status === "IN_PROGRESS" ? "Sedang berjalan" : session.status === "COMPLETED" ? "Selesai" : "Dibatalkan"}
                    </span>
                    <span className="text-xs text-[#758783]">Sesi #{session.id.slice(-8)}</span>
                  </div>
                    <h2 className="mt-1 text-base font-extrabold tracking-tight text-[#1b3b3d]">{session.branchName}</h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#70817e]">
                    <span>Dimulai {formatDate(session.startedAt)}</span>
                    <span>oleh <strong className="font-bold text-[#405c58]">{session.startedByName}</strong></span>
                    {session.completedAt && <span>Selesai {formatDate(session.completedAt)}</span>}
                    {session.cancelledAt && <span>Dibatalkan {formatDate(session.cancelledAt)}</span>}
                  </p>
                </div>
              <div className="grid w-full min-w-0 grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap">
                  <button type="button" data-testid="button-refresh-audit" disabled={loadingSession || Boolean(actionBusy)} onClick={reload} className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#cfdbd6] bg-[#f5f7f3] px-2 text-[11px] font-bold text-[#42635e] hover:bg-[#ebf1ec] disabled:opacity-50 sm:h-9 sm:gap-2 sm:px-3 sm:text-xs">
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingSession ? "animate-spin" : ""}`} /> Segarkan
                  </button>
                  {isActive && (
                    <>
                      <button type="button" data-testid="button-report-exception" disabled={!canWork} onClick={() => { setExceptionOpen(true); setError(""); setExceptionSearch(""); setSelectedExceptionProduct(null); }} className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#d8c895] bg-[#f8f2dc] px-2 text-[11px] font-bold text-[#6c5720] hover:bg-[#f1e7bf] disabled:opacity-50 sm:h-9 sm:gap-2 sm:px-3 sm:text-xs">
                        <Plus className="h-3.5 w-3.5" /> Catat pengecualian
                      </button>
                      <button type="button" data-testid="button-cancel-audit" disabled={Boolean(actionBusy)} onClick={() => setConfirmAction("cancel")} className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e2ceca] bg-transparent px-2 text-[11px] font-bold text-[#87544a] hover:bg-[#f9efec] disabled:opacity-50 sm:h-9 sm:gap-2 sm:px-3 sm:text-xs">
                        <X className="h-3.5 w-3.5" /> Batalkan
                      </button>
                      <button type="button" data-testid="button-finalize-audit" disabled={!canFinalize} onClick={() => setConfirmAction("finalize")} title={!canFinalize ? "Selesaikan semua item dan hitung ulang konflik terlebih dahulu" : undefined} className="inline-flex h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1b5651] px-2 text-[11px] font-bold text-white hover:bg-[#174944] disabled:cursor-not-allowed disabled:bg-[#9aadaa] sm:h-9 sm:gap-2 sm:px-3.5 sm:text-xs">
                        <Check className="h-3.5 w-3.5" /> Finalisasi audit
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 xl:grid-cols-7">
                <SummaryCell label="Cakupan produk" value={filteredSummary?.totalProducts ?? 0} accent="ink" testId="metric-audit-total" />
                <SummaryCell label="Sudah dihitung" value={filteredSummary?.counted ?? 0} accent="green" testId="metric-audit-counted" />
                <SummaryCell label="Belum dihitung" value={filteredSummary?.pending ?? 0} accent="sand" testId="metric-audit-pending" />
                <SummaryCell label="Sedang dihitung" value={filteredSummary?.counting ?? 0} accent="teal" testId="metric-audit-counting" />
                <SummaryCell label="Perlu hitung ulang" value={filteredSummary?.recountRequired ?? 0} accent="rose" testId="metric-audit-recount" />
                <SummaryCell label="Selisih +" value={`+${filteredSummary?.positiveVariance ?? 0}`} accent="green" testId="metric-audit-positive" />
                <SummaryCell label="Selisih −" value={`−${filteredSummary?.negativeVariance ?? 0}`} accent="rose" testId="metric-audit-negative" />
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="shrink-0 text-[11px] font-bold uppercase tracking-[.1em] text-[#6d817c]">{completion}% selesai</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e2e9e4]" role="progressbar" aria-label="Progres audit" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion} data-testid="progress-audit">
                    <div className="h-full rounded-full bg-[#1b7166] transition-[width] duration-500" style={{ width: `${completion}%` }} />
                  </div>
                </div>
                <span data-testid="metric-audit-net" className={`shrink-0 rounded-lg px-3 py-1.5 font-mono text-xs font-bold ${Number(filteredSummary?.netVariance ?? 0) < 0 ? "bg-[#f8e8e4] text-[#9a4d3d]" : Number(filteredSummary?.netVariance ?? 0) > 0 ? "bg-[#e6f1e8] text-[#397449]" : "bg-[#e9eeea] text-[#57706a]"}`}>
                  Net {Number(filteredSummary?.netVariance ?? 0) > 0 ? "+" : ""}{filteredSummary?.netVariance ?? 0} unit
                </span>
              </div>
              {isActive && (
                <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#687e79]">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a17e2d]" />
                  Stok bergerak tetap diizinkan. Pergerakan yang terdeteksi selama jendela hitung wajib dihitung ulang sebelum finalisasi.
                </p>
              )}
            </section>

            {session.status !== "IN_PROGRESS" && (
              <div data-testid="status-audit-closed" className="flex flex-col gap-3 rounded-xl border border-[#d5dfdc] bg-[#f4f6f2] px-4 py-3 text-sm text-[#617571] sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 text-[#397449]" /> Sesi ini hanya-baca. Riwayat hitungan dan pengecualian tetap tersimpan.</span>
                <button type="button" data-testid="button-start-new-audit" disabled={Boolean(actionBusy)} onClick={startSession} className="min-h-9 shrink-0 rounded-lg bg-[#1b5651] px-3 text-xs font-bold text-white hover:bg-[#174944] disabled:opacity-50">Mulai audit baru</button>
              </div>
            )}

            <section className="overflow-hidden rounded-[22px] border border-[#d7e0dc] bg-[#f8f9f5] shadow-[0_5px_20px_rgba(26,64,66,.035)]" data-testid="panel-audit-items">
              <div className="border-b border-[#e1e7e2] px-3 py-3 sm:px-4">
                <div className="flex min-w-0 flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-extrabold tracking-tight text-[#1b3b3d]">Daftar hitung</h3>
                    <p className="mt-0.5 text-xs leading-4 text-[#74847f]">Pindai barcode untuk melihat stok terbaru; baseline diambil saat hitung dimulai.</p>
                  </div>
                  <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:gap-2 lg:flex lg:flex-wrap lg:justify-end">
                    <label className="relative col-span-2 block min-w-0 sm:col-span-1 sm:w-auto lg:w-[250px]">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#78908a]" />
                      <input
                        ref={searchInputRef}
                        aria-label="Cari nama, SKU, atau barcode"
                        data-testid="input-audit-search"
                        type="search"
                        value={search}
                        onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                        placeholder="Cari nama, SKU, barcode…"
                        className="h-11 w-full rounded-xl border border-[#d8e1dc] bg-[#f2f5f1] pl-9 pr-3 text-xs text-[#244743] shadow-none outline-none placeholder:text-[#8b9a95] focus:border-[#63988b] focus:ring-2 focus:ring-[#6f9e91]/20"
                      />
                    </label>
                    <label className="sr-only" htmlFor="audit-status-filter">Filter status</label>
                    <select id="audit-status-filter" data-testid="select-audit-status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="h-11 w-full min-w-0 rounded-xl border border-[#d8e1dc] bg-[#f2f5f1] px-3 text-xs font-semibold text-[#42615c] shadow-none outline-none focus:border-[#63988b] lg:h-10 lg:w-auto">
                      <option value="">Semua status</option>
                      <option value="PENDING">Belum dihitung</option>
                      <option value="COUNTING">Sedang dihitung</option>
                      <option value="COUNTED">Sudah dihitung</option>
                      <option value="RECOUNT_REQUIRED">Perlu hitung ulang</option>
                      <option value="EXCLUDED">Pengecualian</option>
                    </select>
                    <button type="button" data-testid="button-focus-barcode" onClick={() => searchInputRef.current?.focus()} className="inline-flex h-11 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border border-[#d8e1dc] bg-[#f2f5f1] px-2 text-[11px] font-semibold text-[#42615c] hover:bg-[#e9f0eb] lg:h-10 lg:w-auto lg:gap-2 lg:px-3 lg:text-xs">
                      <Barcode className="h-4 w-4" /> Pindai / ketik
                    </button>
                    <button
                      type="button"
                      data-testid="button-open-camera-scanner"
                      disabled={!canWork}
                      onClick={openCameraScanner}
                      className="inline-flex h-11 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl bg-[#1b5651] px-2 text-[11px] font-bold text-white hover:bg-[#174944] disabled:cursor-not-allowed disabled:opacity-45 lg:h-10 lg:w-auto lg:gap-2 lg:px-3 lg:text-xs"
                    >
                      <Camera className="h-4 w-4" /> Scan Kamera
                    </button>
                  </div>
                </div>
              </div>

              {loadingItems ? (
                <div aria-label="Memuat daftar produk" data-testid="loading-audit-items" className="space-y-3 p-4 sm:p-5">
                  {[0, 1, 2, 3].map((index) => <div key={index} className="h-[76px] animate-pulse rounded-xl bg-[#e8eeea]" />)}
                </div>
              ) : items.length === 0 ? (
                <div data-testid="empty-audit-items" className="flex min-h-[250px] flex-col items-center justify-center px-5 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8eeea] text-[#59746e]"><PackageSearch className="h-5 w-5" /></div>
                  <h4 className="font-bold text-[#31504b]">{search || statusFilter ? "Tidak ada hasil yang cocok" : "Daftar produk belum tersedia"}</h4>
                  <p className="mt-1 max-w-sm text-xs leading-5 text-[#7b8c87]">{search || statusFilter ? "Ubah kata kunci atau filter status. Pemindaian barcode juga mencari melalui daftar dari server." : "Coba segarkan sesi. Daftar cakupan produk harus dimuat dari server, bukan dari data contoh."}</p>
                  {(search || statusFilter) && <button type="button" data-testid="button-clear-audit-filter" onClick={() => { setSearch(""); setStatusFilter(""); setPage(1); }} className="mt-3 rounded-lg px-3 py-2 text-xs font-bold text-[#23665d] hover:bg-[#e7f0eb]">Hapus filter</button>}
                </div>
              ) : (
                <>
                  <div className="space-y-2 p-2 lg:hidden" data-testid="list-audit-item-cards">
                    {items.map((item) => (
                      <AuditItemCard
                        key={item.id}
                        item={item}
                        canWork={canWork}
                        busy={Boolean(actionBusy)}
                        onCount={() => void openCount(item)}
                        onRevoke={() => { setVisibilityRevokeItem(item); setVisibilityRevokeReason("Tidak dijual di cabang ini"); setError(""); }}
                      />
                    ))}
                  </div>
                  <div className="hidden max-w-full overflow-x-auto lg:block">
                  <table className="w-full min-w-[900px] border-collapse text-left">
                    <thead className="bg-[#edf2ed]">
                      <tr className="border-b border-[#dce4de] text-[11px] font-extrabold uppercase tracking-[.1em] text-[#71827d]">
                        <th scope="col" className="px-5 py-3">Produk / identitas</th>
                        <th scope="col" className="px-3 py-3 text-center">Status</th>
                        <th scope="col" className="px-3 py-3 text-center">{session.status === "IN_PROGRESS" ? "Sistem saat ini" : "Sistem saat hitung"}</th>
                        <th scope="col" className="px-3 py-3 text-center">Fisik</th>
                        <th scope="col" className="px-3 py-3 text-center">Selisih</th>
                        <th scope="col" className="px-4 py-3">Petugas / waktu</th>
                        <th scope="col" className="px-4 py-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e6ebe7]">
                      {items.map((item) => <AuditItemRow key={item.id} item={item} canWork={canWork} busy={Boolean(actionBusy)} onCount={() => void openCount(item)} onRevoke={() => { setVisibilityRevokeItem(item); setVisibilityRevokeReason("Tidak dijual di cabang ini"); setError(""); }} />)}
                    </tbody>
                  </table>
                  </div>
                </>
              )}
              <footer className="flex min-w-0 flex-col gap-2 border-t border-[#e1e7e2] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                <span data-testid="text-audit-pagination" className="text-[11px] text-[#768681]">
                  {totalItems ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, totalItems)} dari ${totalItems} produk` : "0 produk"}
                </span>
                <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-end">
                  <button type="button" data-testid="button-audit-prev-page" aria-label="Halaman sebelumnya" disabled={page <= 1 || loadingItems} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-lg border border-[#d9e1dc] px-2.5 text-[11px] font-semibold text-[#48635d] hover:bg-[#ecf1ed] disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:text-xs"><ChevronLeft className="h-4 w-4 shrink-0" /> Sebelumnya</button>
                  <span className="min-w-[75px] text-center font-mono text-[11px] text-[#71817c]" data-testid="text-audit-page">Hal. {page} / {pageCount}</span>
                  <button type="button" data-testid="button-audit-next-page" aria-label="Halaman berikutnya" disabled={page >= pageCount || loadingItems} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-lg border border-[#d9e1dc] px-2.5 text-[11px] font-semibold text-[#48635d] hover:bg-[#ecf1ed] disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:text-xs">Berikutnya <ChevronRight className="h-4 w-4 shrink-0" /></button>
                </div>
              </footer>
            </section>
          </>
        )}
      </div>

      {cameraOpen && createPortal(
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center bg-[#102d2b]/65 p-3 sm:p-4"
          data-testid="dialog-camera-scanner"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setCameraOpen(false); }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="camera-dialog-title" className="max-h-[92dvh] w-full min-w-0 max-w-full overflow-x-hidden overflow-y-auto rounded-[22px] border border-[#d7e0dc] bg-[#f8f9f5] p-3 shadow-2xl sm:max-w-xl sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[.12em] text-[#9a7b34]">Audit stok cabang</p>
                <h2 id="camera-dialog-title" className="mt-1 text-lg font-extrabold text-[#1b3b3d]">Scan barcode dengan kamera</h2>
                <p className="mt-1 text-xs leading-5 text-[#74847f]">Kamera belakang diprioritaskan. Arahkan barcode ke area garis.</p>
              </div>
              <button type="button" data-testid="button-close-camera-scanner" aria-label="Tutup pemindai kamera" onClick={() => setCameraOpen(false)} className="rounded-lg p-2 text-[#66807a] hover:bg-[#e9efea]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              className="relative mx-auto mt-4 aspect-square w-full max-w-[352px] overflow-hidden rounded-2xl bg-[#101819]"
              style={{
                display: cameraStatus === "starting" || cameraStatus === "scanning" ? "block" : "none",
              }}
            >
              <div
                id="audit-camera-reader"
                data-testid="camera-barcode-reader"
                className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-[8%] top-1/2 h-[2px] -translate-y-1/2 bg-red-500/70 shadow-[0_0_12px_rgba(239,68,68,0.8)]"
              />
            </div>

            {(cameraStatus === "starting" || cameraStatus === "scanning") && (
              <div aria-live="polite" data-testid="status-camera-scanner" className="mt-3 flex items-start gap-2 rounded-xl bg-[#e9eeea] px-3 py-2.5 text-xs leading-5 text-[#526b65]">
                {cameraStatus === "starting" ? <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin" /> : <ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-[#1b7166]" />}
                <span>{cameraStatus === "starting" ? "Meminta izin dan menyiapkan kamera…" : "Pemindai aktif. Kode EAN-13, EAN-8, UPC-A, dan Code 128 didukung."}</span>
              </div>
            )}

            {cameraStatus === "searching" && (
              <div role="status" data-testid="status-camera-product-search" className="mt-3 flex items-center gap-2 rounded-xl bg-[#e9eeea] px-3 py-3 text-xs font-semibold text-[#526b65]">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Mencari barcode pada daftar produk cabang…
              </div>
            )}

            {cameraStatus === "found" && cameraResult && (
              <div data-testid="card-camera-product-result" className="mt-3 rounded-xl border border-[#cadbd1] bg-[#eaf2ec] p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-[.12em] text-[#668078]">Produk ditemukan</p>
                <h3 data-testid="text-camera-product-name" className="mt-1 break-words text-base font-extrabold text-[#244743]">{cameraResult.productName}</h3>
                <p data-testid="text-camera-product-barcode" className="mt-1 break-all font-mono text-[11px] text-[#71827c]">{cameraCode}</p>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-2.5">
                  <span className="text-xs font-semibold text-[#526b65]">Stok sistem terbaru</span>
                  <strong data-testid="text-camera-system-stock" className="font-mono text-xl font-black text-[#244743]">{cameraResult.systemQty}</strong>
                </div>
                {cameraResult.status === "COUNTED" ? (
                  <p role="status" data-testid="status-camera-already-counted" className="mt-3 rounded-lg bg-[#f5efdb] px-3 py-2 text-xs leading-5 text-[#6f5c26]">
                    Produk ini sudah dihitung pada sesi ini. Pemindaian ulang tidak membuat catatan kedua.
                  </p>
                ) : (
                  <button type="button" data-testid="button-camera-start-count" disabled={!canWork} onClick={() => void startCountFromCamera()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1b5651] px-4 text-sm font-bold text-white hover:bg-[#174944] disabled:opacity-50">
                    <Check className="h-4 w-4" /> Masukkan jumlah fisik
                  </button>
                )}
                <button type="button" data-testid="button-camera-scan-again" onClick={retryCameraScan} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#d4dfd8] px-4 text-xs font-bold text-[#49645e] hover:bg-white">
                  <ScanLine className="h-4 w-4" /> Scan barcode lain
                </button>
              </div>
            )}

            {cameraStatus === "not-found" && (
              <div role="alert" data-testid="alert-camera-product-not-found" className="mt-3 rounded-xl border border-[#e6c5b7] bg-[#fff3ed] p-4 text-sm text-[#803e31]">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div><p className="font-bold">Produk tidak ditemukan</p><p className="mt-1 text-xs leading-5">{cameraMessage} Pastikan barcode milik produk yang tercakup dalam sesi audit ini.</p><p className="mt-2 break-all font-mono text-[11px]">Barcode: {cameraCode}</p></div>
                </div>
                <button type="button" data-testid="button-camera-retry-not-found" onClick={retryCameraScan} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#87564b] px-4 text-xs font-bold text-white hover:bg-[#73473e]">
                  <ScanLine className="h-4 w-4" /> Scan ulang
                </button>
              </div>
            )}

            {cameraStatus === "error" && (
              <div role="alert" data-testid="alert-camera-error" className="mt-3 rounded-xl border border-[#e6c5b7] bg-[#fff3ed] p-4 text-sm text-[#803e31]">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p data-testid="text-camera-error-message" className="text-xs leading-5">{cameraMessage}</p>
                </div>
                <button type="button" data-testid="button-camera-retry" onClick={retryCameraScan} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#d4c0b8] bg-white px-4 text-xs font-bold text-[#6d4a40] hover:bg-[#fff9f5]">
                  <Camera className="h-4 w-4" /> Coba buka kamera lagi
                </button>
              </div>
            )}
          </section>
        </div>,
        document.body,
      )}

      {editorItem && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-[#102d2b]/55 p-3 sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCountEditor(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="count-dialog-title" data-testid="dialog-count-item" className="max-h-[82dvh] w-full min-w-0 max-w-[420px] overflow-y-auto rounded-2xl border border-[#d7e0dc] bg-[#f8f9f5] p-3 shadow-2xl sm:p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold uppercase tracking-[.1em] text-[#9a7b34]">Lembar hitung fisik</p>
                <h2 id="count-dialog-title" className="mt-0.5 break-words text-base font-extrabold leading-5 text-[#1b3b3d]">{editorItem.productName}</h2>
                <p className="mt-1 break-all font-mono text-[11px] text-[#74847f]">{editorItem.barcode || editorItem.masterSN || "Identitas tidak tersedia"}</p>
              </div>
              <button type="button" data-testid="button-close-count" aria-label="Tutup lembar hitung" onClick={closeCountEditor} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-[#66807a] hover:bg-[#e9efea]"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-[#e9eeea] p-2">
                <p className="text-[11px] font-bold uppercase leading-4 tracking-[.06em] text-[#788883]">Stok sistem saat mulai hitung</p>
                <p data-testid="text-count-baseline" className="mt-0.5 font-mono text-xl font-black text-[#274b47]">{baselineQty ?? "—"}</p>
              </div>
              <div className="rounded-lg bg-[#e9eeea] p-2">
                <p className="text-[11px] font-bold uppercase leading-4 tracking-[.06em] text-[#788883]">Snapshot awal audit</p>
                <p data-testid="text-count-expected" className="mt-0.5 font-mono text-xl font-black text-[#274b47]">{editorItem.expectedQty}</p>
              </div>
            </div>
            <form className="mt-3 space-y-3" onSubmit={(event) => void saveItemCount(event)}>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-[#405e58]">Jumlah fisik <span className="text-[#9a4d3d]">*</span></span>
                <input data-testid="input-count-quantity" aria-label="Jumlah fisik yang ditemukan" type="number" min="0" step="1" required autoFocus value={countQty} onChange={(event) => setCountQty(event.target.value)} placeholder="Masukkan jumlah aktual" className="h-11 w-full rounded-xl border border-[#d2ddd6] bg-[#f0f4f0] px-3 font-mono text-base font-bold text-[#244743] shadow-none outline-none focus:border-[#63988b] focus:ring-2 focus:ring-[#6f9e91]/20" />
                <span className="mt-1.5 block text-[11px] leading-4 text-[#84918d]">Barcode hanya mengidentifikasi produk. Hitungan disimpan setelah jumlah fisik dikonfirmasi.</span>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-[#405e58]">Temuan kondisi</span>
                <select data-testid="select-count-finding" value={finding} onChange={(event) => { setFinding(event.target.value as Finding); if (event.target.value === "NOT_FOUND") setCountQty("0"); }} className="h-11 w-full rounded-xl border border-[#d2ddd6] bg-[#f0f4f0] px-3 text-sm text-[#31524d] shadow-none outline-none focus:border-[#63988b]">
                  {FINDINGS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <span className="mt-1 block text-[11px] leading-4 text-[#84918d]">Kondisi hanya menjadi catatan audit, tidak menghapus stok atau mengubah master produk.</span>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-[#405e58]">Catatan <span className="font-normal text-[#84918d]">· opsional</span></span>
                <textarea data-testid="input-count-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Contoh: kemasan penyok di rak belakang" className="w-full resize-y rounded-xl border border-[#d2ddd6] bg-[#f0f4f0] px-3 py-2 text-sm text-[#31524d] shadow-none outline-none placeholder:text-[#98a39f] focus:border-[#63988b]" />
              </label>
              {editorItem.status === "RECOUNT_REQUIRED" && <p className="rounded-lg border border-[#e6d7a8] bg-[#faf3dc] px-3 py-2 text-xs leading-5 text-[#745f23]">Pergerakan stok terdeteksi pada jendela hitung sebelumnya. Hitung fisik ulang dengan stok sistem terbaru sebelum disimpan.</p>}
              <div className="grid grid-cols-2 gap-2 border-t border-[#e1e7e2] pt-3">
                <button type="button" data-testid="button-dismiss-count" onClick={closeCountEditor} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d5dfd9] px-2 text-center text-xs font-bold leading-4 text-[#627671] hover:bg-[#edf2ee]">Tutup tanpa menyimpan</button>
                <button type="submit" data-testid="button-save-count" disabled={Boolean(actionBusy)} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#1b5651] px-2 text-center text-xs font-bold leading-4 text-white hover:bg-[#174944] disabled:opacity-60">
                  {actionBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Simpan hitungan
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {exceptionOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#102d2b]/55 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setExceptionOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="exception-dialog-title" data-testid="dialog-audit-exception" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-[24px] border border-[#d7e0dc] bg-[#f8f9f5] p-5 shadow-2xl sm:max-w-lg sm:rounded-[22px] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-[11px] font-extrabold uppercase tracking-[.12em] text-[#9a7b34]">Temuan di luar daftar</p><h2 id="exception-dialog-title" className="mt-1 text-lg font-extrabold text-[#1b3b3d]">Catat pengecualian</h2></div>
              <button type="button" data-testid="button-close-exception" aria-label="Tutup form pengecualian" onClick={() => setExceptionOpen(false)} className="rounded-lg p-2 text-[#66807a] hover:bg-[#e9efea]"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 rounded-xl bg-[#f2edda] px-3 py-2.5 text-xs leading-5 text-[#6d5a28]">Produk di luar cakupan hanya dicatat sebagai temuan. Catatan ini tidak menambah stok atau mengubah master produk.</p>
            <form className="mt-4 space-y-4" onSubmit={(event) => void reportException(event)}>
              <div className="space-y-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-[#405e58]">Cari produk katalog <span className="text-[#9a4d3d]">*</span></span>
                  <input
                    data-testid="input-exception-search"
                    required={!selectedExceptionProduct}
                    disabled={Boolean(selectedExceptionProduct)}
                    value={exceptionSearch}
                    onChange={(event) => { setExceptionSearch(event.target.value); setSelectedExceptionProduct(null); }}
                    placeholder="Nama, SKU, atau pindai barcode"
                    className="h-11 w-full rounded-xl border border-[#d2ddd6] bg-[#f0f4f0] px-3 text-sm text-[#31524d] shadow-none outline-none placeholder:text-[#8b9a95] focus:border-[#63988b] disabled:opacity-70"
                  />
                </label>
                {selectedExceptionProduct ? (
                  <div data-testid="selected-exception-product" className="flex items-start justify-between gap-3 rounded-xl border border-[#cadbd1] bg-[#eaf2ec] p-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-[#31524d]">{selectedExceptionProduct.name}</p>
                      <p className="mt-1 text-[11px] text-[#758781]">
                        {selectedExceptionProduct.barcode || selectedExceptionProduct.masterSN || selectedExceptionProduct.id} · stok tercatat {selectedExceptionProduct.branchStockQty}
                      </p>
                    </div>
                    <button type="button" data-testid="button-clear-exception-product" onClick={() => { setSelectedExceptionProduct(null); setExceptionSearch(""); }} className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-[#647b76] hover:bg-white">Ganti</button>
                  </div>
                ) : exceptionSearch.trim().length >= 2 ? (
                  <div data-testid="list-exception-candidates" className="max-h-44 overflow-auto rounded-xl border border-[#d7e0dc] bg-white">
                    {loadingCandidates ? <p className="px-3 py-3 text-xs text-[#71817c]">Mencari produk…</p> : exceptionCandidates.length ? exceptionCandidates.map((candidate) => (
                      <button key={candidate.id} type="button" data-testid={`button-exception-product-${candidate.id}`} onClick={() => setSelectedExceptionProduct(candidate)} className="block w-full border-b border-[#edf1ed] px-3 py-2.5 text-left last:border-b-0 hover:bg-[#f0f5f1]">
                        <span className="block truncate text-xs font-bold text-[#31524d]">{candidate.name}</span>
                        <span className="mt-1 block truncate text-[11px] text-[#798984]">{candidate.barcode || candidate.masterSN || candidate.id} · stok cabang {candidate.branchStockQty}</span>
                      </button>
                    )) : <p className="px-3 py-3 text-xs text-[#71817c]">Tidak ada produk katalog yang cocok.</p>}
                  </div>
                ) : <p className="text-[11px] text-[#84918d]">Ketik minimal 2 karakter. Temuan ini hanya dicatat dan tidak mengubah stok.</p>}
              </div>
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#405e58]">Jenis temuan</span><select data-testid="select-exception-finding" value={exceptionFinding} onChange={(event) => setExceptionFinding(event.target.value as Finding)} className="h-11 w-full rounded-xl border border-[#d2ddd6] bg-[#f0f4f0] px-3 text-sm text-[#31524d] shadow-none outline-none focus:border-[#63988b]"><option value="UNLISTED_IN_BRANCH">Produk tidak terdaftar di cabang</option><option value="EXPIRED">Kedaluwarsa</option><option value="DAMAGED">Rusak</option><option value="NOT_SOLD_HERE">Tidak dijual di cabang ini</option></select></label>
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#405e58]">Jumlah ditemukan <span className="font-normal text-[#84918d]">· opsional</span></span><input data-testid="input-exception-quantity" type="number" min="0" step="1" value={exceptionQty} onChange={(event) => setExceptionQty(event.target.value)} placeholder="Tidak mengubah stok" className="h-11 w-full rounded-xl border border-[#d2ddd6] bg-[#f0f4f0] px-3 font-mono text-sm text-[#31524d] shadow-none outline-none focus:border-[#63988b]" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#405e58]">Catatan</span><textarea data-testid="input-exception-notes" rows={2} value={exceptionNotes} onChange={(event) => setExceptionNotes(event.target.value)} placeholder="Keterangan temuan di cabang" className="w-full resize-y rounded-xl border border-[#d2ddd6] bg-[#f0f4f0] px-3 py-2.5 text-sm text-[#31524d] shadow-none outline-none placeholder:text-[#98a39f] focus:border-[#63988b]" /></label>
              <div className="flex flex-col-reverse gap-2 border-t border-[#e1e7e2] pt-4 sm:flex-row sm:justify-end">
                <button type="button" data-testid="button-dismiss-exception" onClick={() => setExceptionOpen(false)} className="h-11 rounded-xl border border-[#d5dfd9] px-4 text-sm font-bold text-[#627671] hover:bg-[#edf2ee]">Kembali</button>
                <button type="submit" data-testid="button-save-exception" disabled={Boolean(actionBusy)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#866d2c] px-5 text-sm font-bold text-white hover:bg-[#70591f] disabled:opacity-60">{actionBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Simpan temuan</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {confirmAction && session && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#102d2b]/60 p-0 sm:items-center sm:p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-audit-title" data-testid="dialog-confirm-audit-action" className="w-full rounded-t-[24px] border border-[#d7e0dc] bg-[#f8f9f5] p-5 shadow-2xl sm:max-w-md sm:rounded-[22px] sm:p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f2edda] text-[#806722]"><ShieldAlert className="h-5 w-5" /></div>
            <h2 id="confirm-audit-title" className="mt-4 text-lg font-extrabold text-[#1b3b3d]">{confirmAction === "finalize" ? "Finalisasi audit ini?" : "Batalkan sesi audit?"}</h2>
            {confirmAction === "finalize" ? (
              <div className="mt-2 space-y-2 text-xs leading-5 text-[#697c77]">
                  <p>Finalisasi menerapkan hanya selisih yang sudah dikonfirmasi pada produk dalam cakupan terhadap stok terkini secara atomik. Pergerakan yang terdeteksi saat hitung harus dihitung ulang terlebih dahulu. Tidak ada langkah persetujuan Owner.</p>
                <div className="rounded-xl border border-[#dce5df] bg-[#eef2ed] p-3">
                  <p className="mb-2 font-bold text-[#3c5b55]">Ringkasan sebelum rekonsiliasi</p>
                  <p>Produk dihitung: <strong>{session.summary.counted}</strong> / {session.summary.totalProducts}</p>
                  <p>Pengecualian: <strong>{session.summary.excluded}</strong> · Selisih net: <strong>{session.summary.netVariance > 0 ? "+" : ""}{session.summary.netVariance}</strong></p>
                  <p>Belum dihitung: <strong>{session.summary.pending}</strong> · Hitung ulang: <strong>{session.summary.recountRequired}</strong> · Sedang dihitung: <strong>{session.summary.counting}</strong></p>
                </div>
                {!canFinalize && <p className="font-semibold text-[#9a4d3d]">Finalisasi terkunci sampai semua produk selesai dihitung dan seluruh konflik dihitung ulang.</p>}
              </div>
            ) : (
              <p className="mt-2 text-sm leading-6 text-[#697c77]">Sesi akan ditandai dibatalkan dan tetap tersimpan sebagai riwayat. Stok tidak akan diubah.</p>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" data-testid="button-dismiss-audit-confirm" onClick={() => setConfirmAction(null)} className="h-11 rounded-xl border border-[#d5dfd9] px-4 text-sm font-bold text-[#627671] hover:bg-[#edf2ee]">Kembali</button>
              <button type="button" data-testid="button-confirm-audit-action" disabled={(confirmAction === "finalize" && !canFinalize) || Boolean(actionBusy)} onClick={() => void performConfirmation()} className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${confirmAction === "finalize" ? "bg-[#1b5651] hover:bg-[#174944]" : "bg-[#87564b] hover:bg-[#73473e]"}`}>
                {actionBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : confirmAction === "finalize" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                {confirmAction === "finalize" ? "Ya, finalisasi" : "Ya, batalkan sesi"}
              </button>
            </div>
          </section>
        </div>
      )}

      {visibilityRevokeItem && session && (
        createPortal(
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-[#102d2b]/65 px-3 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
          <section role="alertdialog" aria-modal="true" aria-labelledby="revoke-visibility-title" data-testid="dialog-revoke-branch-visibility" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#d7e0dc] bg-[#f8f9f5] p-4 shadow-2xl sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f2edda] text-[#806722]"><ShieldAlert className="h-4 w-4" /></div>
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold uppercase tracking-[.12em] text-[#9a7b34]">Konfirmasi perubahan cabang</p>
                <h2 id="revoke-visibility-title" className="mt-0.5 text-base font-extrabold leading-5 text-[#1b3b3d]">Cabut izin tampil di {session.branchName}?</h2>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#697c77]">
              Produk <strong className="text-[#31504b]">{visibilityRevokeItem.productName}</strong> akan keluar dari antrean hitung cabang ini dan tidak lagi masuk alert belanja cabang ini. Izin cabang lain dan rencana belanja lama tidak diubah.
            </p>
            <div className="mt-2.5 rounded-xl border border-[#e2d5aa] bg-[#faf4df] px-3 py-2 text-[11px] leading-4.5 text-[#745f23]">
              Stok sistem yang terlihat sekarang: <strong>{visibilityRevokeItem.systemQty} pcs</strong>. Server akan memeriksa ulang; pencabutan hanya berhasil jika stok terbaru tepat 0 dan tidak ada hitungan fisik positif.
            </div>
            <form className="mt-3 space-y-3" onSubmit={(event) => void revokeBranchVisibility(event)}>
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold text-[#405e58]">Alasan pencabutan</span>
                <textarea
                  data-testid="input-revoke-visibility-reason"
                  required
                  minLength={3}
                  maxLength={200}
                  rows={2}
                  value={visibilityRevokeReason}
                  onChange={(event) => setVisibilityRevokeReason(event.target.value)}
                  className="w-full resize-y rounded-xl border border-[#d2ddd6] bg-[#f0f4f0] px-3 py-2 text-xs text-[#31524d] shadow-none outline-none placeholder:text-[#98a39f] focus:border-[#63988b]"
                />
              </label>
              {error && <p role="alert" className="rounded-lg border border-[#e8cbc3] bg-[#fbefea] px-3 py-2 text-xs leading-5 text-[#8b4d3f]">{error}</p>}
              <div className="grid grid-cols-2 gap-2 border-t border-[#e1e7e2] pt-3">
                <button type="button" data-testid="button-dismiss-revoke-visibility" disabled={Boolean(actionBusy)} onClick={() => setVisibilityRevokeItem(null)} className="h-11 rounded-xl border border-[#d5dfd9] px-3 text-xs font-bold text-[#627671] hover:bg-[#edf2ee] disabled:opacity-50">Batal</button>
                <button type="submit" data-testid="button-confirm-revoke-visibility" disabled={Boolean(actionBusy) || visibilityRevokeReason.trim().length < 3} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#87564b] px-2.5 text-xs font-bold text-white hover:bg-[#73473e] disabled:cursor-not-allowed disabled:opacity-50">
                  {actionBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />} Cabut izin cabang
                </button>
              </div>
            </form>
          </section>
        </div>,
        document.body,
        )
      )}

      {actionBusy && <span className="sr-only" role="status" data-testid="status-audit-action-busy">{actionBusy}</span>}
    </div>
  );
}

function SummaryCell({ label, value, accent, testId }: { label: string; value: number | string; accent: "ink" | "green" | "sand" | "teal" | "rose"; testId: string }) {
  const tones: Record<typeof accent, string> = {
    ink: "text-[#294844]",
    green: "text-[#3e7650]",
    sand: "text-[#816c2d]",
    teal: "text-[#23685f]",
    rose: "text-[#9a5949]",
  };
  return (
    <div data-testid={testId} className="min-w-0 rounded-lg border border-[#e0e7e1] bg-[#f2f5f0] px-2 py-2 sm:px-2.5">
      <p className="min-h-6 break-words text-[11px] font-bold uppercase leading-3 tracking-[.03em] text-[#7a8984]">{label}</p>
      <p className={`mt-1 font-mono text-base font-black leading-none sm:text-lg ${tones[accent]}`}>{value}</p>
    </div>
  );
}

function AuditItemCard({ item, canWork, busy, onCount, onRevoke }: { item: AuditItem; canWork: boolean; busy: boolean; onCount: () => void; onRevoke: () => void }) {
  const variance = item.variance ?? (
    item.status === "COUNTED" && item.countedQty != null && item.baselineQty != null
      ? item.countedQty - item.baselineQty
      : null
  );
  const isConflict = item.status === "RECOUNT_REQUIRED";
  const statusTone = isConflict
    ? "bg-[#f7e7df] text-[#a04d34]"
    : item.status === "COUNTED"
      ? "bg-[#e3f0e7] text-[#39734d]"
      : item.status === "COUNTING"
        ? "bg-[#e7edf0] text-[#496c78]"
        : item.status === "EXCLUDED" || !item.inScope
          ? "bg-[#f3edd9] text-[#816c2d]"
          : "bg-[#edf0eb] text-[#71817a]";

  return (
    <article data-testid={`card-audit-item-${item.id}`} className="grid min-w-0 max-w-full gap-1.5 rounded-xl border border-[#dce5df] bg-white px-2 py-1.5 shadow-[0_2px_8px_rgba(26,64,66,.035)]">
      <div className="flex min-w-0 items-center gap-2">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.inScope ? "bg-[#e5eeea] text-[#367167]" : "bg-[#f4edd9] text-[#8a712e]"}`}>
          <PackageSearch className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p data-testid={`text-audit-product-${item.id}`} title={item.productName} className="truncate text-xs font-bold leading-4 text-[#294743]">{item.productName}</p>
          <p data-audit-item-identifier title={item.barcode ? `BC ${item.barcode}` : item.masterSN ? `SKU ${item.masterSN}` : `ID ${item.productId}`} className="truncate font-mono text-[10px] leading-3 text-[#85918d]">
            {item.barcode ? `BC ${item.barcode}` : item.masterSN ? `SKU ${item.masterSN}` : `ID ${item.productId}`}
          </p>
          {item.finding && item.finding !== "NORMAL" && (
            <p className="mt-0.5 truncate text-[10px] font-semibold leading-3 text-[#826a2b]">
              {FINDING_LABEL[item.finding] ?? item.finding}{item.notes ? ` · ${item.notes}` : ""}
            </p>
          )}
        </div>
        <span data-testid={`status-audit-item-${item.id}`} className={`inline-flex max-w-[118px] shrink-0 items-center justify-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold leading-3 ${statusTone}`}>
          {isConflict && <AlertCircle className="h-3 w-3 shrink-0" />}{STATUS_LABEL[item.status]}
        </span>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5">
        <div data-audit-item-metrics className="grid min-w-0 grid-cols-3 gap-1">
          <div className="min-w-0 rounded-md bg-[#f1f4f0] px-1.5 py-1">
            <p className="truncate text-[9px] font-semibold leading-3 text-[#75847e]">Sistem</p>
            <p data-testid={`text-audit-system-${item.id}`} className="font-mono text-xs font-bold leading-4 text-[#425d57]">{item.systemQty}</p>
          </div>
          <div className="min-w-0 rounded-md bg-[#f1f4f0] px-1.5 py-1">
            <p className="truncate text-[9px] font-semibold leading-3 text-[#75847e]">Fisik</p>
            <p data-testid={`text-audit-counted-${item.id}`} className={`font-mono text-xs font-bold leading-4 ${item.countedQty == null ? "text-[#abb5b1]" : "text-[#244743]"}`}>{item.countedQty ?? "—"}</p>
          </div>
          <div className="min-w-0 rounded-md bg-[#f1f4f0] px-1.5 py-1">
            <p className="truncate text-[9px] font-semibold leading-3 text-[#75847e]">Selisih</p>
            <p data-testid={`text-audit-variance-${item.id}`} className={`inline-flex items-center gap-0.5 font-mono text-xs font-bold leading-4 ${variance == null ? "text-[#a2ada8]" : variance > 0 ? "text-[#39754a]" : variance < 0 ? "text-[#a34f3d]" : "text-[#617770]"}`}>
            {variance == null ? "—" : variance > 0 ? <><ArrowUpRight className="h-3 w-3" />{variance}</> : variance < 0 ? <><ArrowDownRight className="h-3 w-3" />{Math.abs(variance)}</> : "0"}
            </p>
          </div>
        </div>

        {item.inScope && item.status !== "EXCLUDED" && item.status !== "COUNTING" ? (
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" data-testid={`button-count-item-${item.id}`} aria-label={isConflict ? "Hitung ulang produk" : item.status === "COUNTED" ? "Ubah hitungan produk" : "Hitung produk"} disabled={!canWork || busy} onClick={onCount} className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-40 ${isConflict ? "bg-[#f2e2d8] text-[#914a32] hover:bg-[#ebd2c4]" : "bg-[#e3eeea] text-[#29655c] hover:bg-[#d5e7df]"}`}>
              {isConflict ? <RefreshCw className="h-3 w-3" /> : item.status === "COUNTED" ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
               {isConflict ? "Ulang" : item.status === "COUNTED" ? "Ubah" : "Hitung"}
            </button>
            <button type="button" data-testid={`button-revoke-visibility-${item.id}`} aria-label="Cabut izin tampil di cabang" disabled={!canWork || busy} onClick={onRevoke} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-[#e1d5b1] px-2 text-[10px] font-bold text-[#7b6627] hover:bg-[#faf4df] disabled:cursor-not-allowed disabled:opacity-40">
              <MapPin className="h-3 w-3" /> Cabut
            </button>
          </div>
        ) : item.status === "COUNTING" ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-[#647b76]"><LoaderCircle className="h-3 w-3 animate-spin" />Dibuka</span>
        ) : <span className="shrink-0 text-[10px] text-[#899792]">—</span>}
      </div>
      {item.countedByName && <p className="truncate pl-10 text-[9px] leading-3 text-[#526d66]">{item.countedByName} · {formatDate(item.countedAt)}</p>}
    </article>
  );
}

function AuditItemRow({ item, canWork, busy, onCount, onRevoke }: { item: AuditItem; canWork: boolean; busy: boolean; onCount: () => void; onRevoke: () => void }) {
  const variance = item.variance ?? (
    item.status === "COUNTED" && item.countedQty != null && item.baselineQty != null
      ? item.countedQty - item.baselineQty
      : null
  );
  const isConflict = item.status === "RECOUNT_REQUIRED";
  return (
    <tr data-testid={`row-audit-item-${item.id}`} className="transition-colors hover:bg-[#f3f6f2]">
      <td className="px-4 py-2.5">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${item.inScope ? "bg-[#e5eeea] text-[#367167]" : "bg-[#f4edd9] text-[#8a712e]"}`}><PackageSearch className="h-3.5 w-3.5" /></div>
          <div className="min-w-0">
            <p data-testid={`text-audit-product-${item.id}`} className="max-w-[300px] truncate text-xs font-bold text-[#294743]">{item.productName}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-[#85918d]">
              {item.barcode && <span>BC {item.barcode}</span>}
              {item.masterSN && <span>SKU {item.masterSN}</span>}
              {!item.barcode && !item.masterSN && <span>ID {item.productId}</span>}
              {!item.inScope && <span className="rounded bg-[#f3ebd2] px-1.5 py-0.5 font-sans font-bold text-[#806b30]">Di luar cakupan</span>}
            </p>
            {item.finding && item.finding !== "NORMAL" && <p className="mt-1 text-[11px] font-semibold text-[#826a2b]">{FINDING_LABEL[item.finding] ?? item.finding}{item.notes ? ` · ${item.notes}` : ""}</p>}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-center">
        <span data-testid={`status-audit-item-${item.id}`} className={`inline-flex max-w-[130px] items-center justify-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold leading-4 ${isConflict ? "bg-[#f7e7df] text-[#a04d34]" : item.status === "COUNTED" ? "bg-[#e3f0e7] text-[#39734d]" : item.status === "COUNTING" ? "bg-[#e7edf0] text-[#496c78]" : item.status === "EXCLUDED" || !item.inScope ? "bg-[#f3edd9] text-[#816c2d]" : "bg-[#edf0eb] text-[#71817a]"}`}>
          {isConflict && <AlertCircle className="h-3 w-3 shrink-0" />}{STATUS_LABEL[item.status]}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center"><span data-testid={`text-audit-system-${item.id}`} className="font-mono text-sm font-bold text-[#425d57]">{item.systemQty}</span></td>
      <td className="px-3 py-2.5 text-center"><span data-testid={`text-audit-counted-${item.id}`} className={`font-mono text-sm font-bold ${item.countedQty == null ? "text-[#abb5b1]" : "text-[#244743]"}`}>{item.countedQty ?? "—"}</span></td>
      <td className="px-3 py-2.5 text-center">
        <span data-testid={`text-audit-variance-${item.id}`} className={`inline-flex min-w-10 items-center justify-center gap-0.5 rounded-md px-1.5 py-1 font-mono text-xs font-bold ${variance == null ? "text-[#a2ada8]" : variance > 0 ? "bg-[#e8f2e8] text-[#39754a]" : variance < 0 ? "bg-[#f8e9e4] text-[#a34f3d]" : "bg-[#edf1ed] text-[#617770]"}`}>
          {variance == null ? "—" : variance > 0 ? <><ArrowUpRight className="h-3 w-3" />{variance}</> : variance < 0 ? <><ArrowDownRight className="h-3 w-3" />{Math.abs(variance)}</> : "0"}
        </span>
      </td>
      <td className="px-4 py-2.5">
        {item.countedByName ? <><p className="text-[11px] font-semibold text-[#526d66]">{item.countedByName}</p><p data-testid={`text-audit-counted-at-${item.id}`} className="mt-1 flex items-center gap-1 text-[11px] text-[#8a9893]"><Clock3 className="h-3 w-3" />{formatDate(item.countedAt)}</p></> : <span className="text-[11px] text-[#a0aaa6]">Belum ada hitungan</span>}
      </td>
      <td className="px-4 py-2.5 text-right">
        {item.inScope && item.status !== "EXCLUDED" && item.status !== "COUNTING" ? (
          <div className="flex flex-wrap items-center justify-end gap-1">
            <button type="button" data-testid={`button-count-item-${item.id}`} disabled={!canWork || busy} onClick={onCount} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-40 ${isConflict ? "bg-[#f2e2d8] text-[#914a32] hover:bg-[#ebd2c4]" : "bg-[#e3eeea] text-[#29655c] hover:bg-[#d5e7df]"}`}>
              {isConflict ? <RefreshCw className="h-3 w-3" /> : item.status === "COUNTED" ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {isConflict ? "Hitung ulang" : item.status === "COUNTED" ? "Ubah hitungan" : "Hitung"}
            </button>
            <button type="button" data-testid={`button-revoke-visibility-${item.id}`} aria-label="Cabut izin tampil di cabang" disabled={!canWork || busy} onClick={onRevoke} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#e1d5b1] px-2 text-[11px] font-bold text-[#7b6627] hover:bg-[#faf4df] disabled:cursor-not-allowed disabled:opacity-40">
              <MapPin className="h-3 w-3" /> Cabut
            </button>
          </div>
        ) : item.status === "COUNTING" ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#647b76]"><LoaderCircle className="h-3 w-3 animate-spin" />Sedang dibuka</span>
        ) : <span className="text-[11px] text-[#899792]">—</span>}
      </td>
    </tr>
  );
}
