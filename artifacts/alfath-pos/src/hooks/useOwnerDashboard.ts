import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api, createReadRefresh, isSessionError } from "../services/api";

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
  onSessionExpired?: () => void,
) {
  const key = `${userId || ""}:${branchId}`;
  const token = localStorage.getItem("token");
  const liveContext = useRef({ key, enabled, token });
  liveContext.current = { key, enabled, token };
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
    const controller = new AbortController();
    const active = () => !disposed && liveContext.current.enabled &&
      liveContext.current.key === key && liveContext.current.token === token &&
      localStorage.getItem("token") === token;
    setState(emptyState(key));

    const patch = (values: Partial<DashboardState>) => {
      if (active()) setState((previous) => ({
        ...(previous.key === key ? previous : emptyState(key)), ...values,
      }));
    };
    const failed = (error: unknown, values: Partial<DashboardState>) => {
      if (!active() || controller.signal.aborted) return;
      if (isSessionError(error)) {
        onSessionExpired?.();
        controller.abort();
        return;
      }
      patch(values);
    };
    const load = (): Promise<void> => {
      if (!active()) return Promise.resolve();
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
          failed(error, { error: error.message, loading: false });
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
          failed(error, { detailsError: error.message });
        });
      const products = api.getProducts(controller.signal)
        .then((data) => {
          if (active()) {
            onProductsUpdated(data);
            patch({ stockError: "" });
          }
        })
        .catch((error) => {
          failed(error, { stockError: `Stok belum diperbarui: ${error.message}` });
        });
      return Promise.all([summary, details, products]).then(() => {});
    };
    const refresh = createReadRefresh(load, 500);
    const schedule = refresh.schedule;
    refreshRef.current = refresh.refresh;
    schedule();
    const socket = io({ auth: { token }, autoConnect: false });
    for (const event of [
      "saleProcessed", "saleUpdated", "stockUpdated", "commissionsUpdated",
      "productUpdated", "productDeleted", "connect",
    ]) socket.on(event, schedule);
    socket.connect();
    const poll = setInterval(schedule, 60_000);
    const onFocus = () => { if (document.visibilityState === "visible") schedule(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      disposed = true;
      controller.abort();
      refresh.dispose();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onFocus);
      socket.disconnect();
      refreshRef.current = () => Promise.resolve();
    };
  }, [enabled, userId, branchId, key, token, onProductsUpdated, onSessionExpired]);

  return { ...(state.key === key ? state : emptyState(key)), refresh };
}