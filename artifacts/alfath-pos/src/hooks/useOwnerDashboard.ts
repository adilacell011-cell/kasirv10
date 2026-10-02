import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api } from "../services/api";

type DashboardState = {
  key: string;
  summaries: any[];
  recentSales: any[];
  topProducts: { name: string; qty: number }[];
  hasSummary: boolean;
  hasDetails: boolean;
  loading: boolean;
  error: string;
  detailsError: string;
  stockError: string;
  updatedAt: string;
};

const emptyState = (key: string): DashboardState => ({
  key, summaries: [], recentSales: [], topProducts: [],
  hasSummary: false, hasDetails: false, loading: true,
  error: "", detailsError: "", stockError: "", updatedAt: "",
});

// Separate from POS synchronization: never fetch the complete sales/bonus ledger.
export function useOwnerDashboard(
  enabled: boolean,
  userId: string | undefined,
  branchId: string,
  onProductsUpdated: (products: any[]) => void,
) {
  const key = `${userId || ""}:${branchId}`;
  const [state, setState] = useState(() => emptyState(key));
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    if (!enabled || !userId) {
      setState(emptyState(key));
      refreshRef.current = () => Promise.resolve();
      return;
    }
    let disposed = false;
    let busy = false;
    let queued = false;
    let running: Promise<void> = Promise.resolve();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    setState(emptyState(key));

    const patch = (values: Partial<DashboardState>) => {
      if (!disposed) setState((previous) => ({
        ...(previous.key === key ? previous : emptyState(key)), ...values,
      }));
    };
    const load = (): Promise<void> => {
      if (disposed) return Promise.resolve();
      if (busy) {
        queued = true;
        return running;
      }
      busy = true;
      patch({ loading: true });
      // The income request commits independently: products/details cannot delay it.
      const summary = api.getOwnerDashboard(branchId, controller.signal)
        .then((data) => {
          if (!Array.isArray(data.summaries)) throw new Error("Format ringkasan tidak valid.");
          patch({
            summaries: data.summaries, hasSummary: true, error: "",
            updatedAt: data.updatedAt, loading: false,
          });
        })
        .catch((error) => {
          if (!disposed) patch({ error: error.message, loading: false });
        });
      const details = api.getOwnerDashboardDetails(branchId, controller.signal)
        .then((data) => {
          if (!Array.isArray(data.recentSales) || !Array.isArray(data.topProducts)) {
            throw new Error("Format rincian dashboard tidak valid.");
          }
          patch({
            recentSales: data.recentSales, topProducts: data.topProducts,
            hasDetails: true, detailsError: "",
          });
        })
        .catch((error) => {
          if (!disposed) patch({ detailsError: error.message });
        });
      const products = api.getProducts(controller.signal)
        .then((data) => {
          if (!disposed) {
            onProductsUpdated(data);
            patch({ stockError: "" });
          }
        })
        .catch((error) => {
          if (!disposed) patch({ stockError: `Stok belum diperbarui: ${error.message}` });
        });
      running = Promise.all([summary, details, products]).then(() => {
        busy = false;
        if (queued && !disposed) {
          queued = false;
          schedule();
        }
      });
      return running;
    };
    const schedule = () => {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; void load(); }, 500);
    };
    refreshRef.current = load;
    void load();
    const socket = io({ auth: { token: localStorage.getItem("token") } });
    for (const event of [
      "saleProcessed", "saleUpdated", "stockUpdated", "commissionsUpdated",
      "productUpdated", "productDeleted", "connect",
    ]) socket.on(event, schedule);
    const poll = setInterval(schedule, 60_000);
    const onFocus = () => { if (document.visibilityState === "visible") schedule(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      disposed = true;
      controller.abort();
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onFocus);
      socket.disconnect();
      refreshRef.current = () => Promise.resolve();
    };
  }, [enabled, userId, branchId, key, onProductsUpdated]);

  return { ...(state.key === key ? state : emptyState(key)), refresh };
}