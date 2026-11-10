import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { BranchStockAudit } from "../kasirv10-fixtures/BranchStockAudit";
import "./CompactAudit.css";

export function CompactAudit() {
  const [dialogOpen, setDialogOpen] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("dialog") === "1",
  );

  useEffect(() => {
    if (!dialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialogOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen]);

  return (
    <div className="compact-audit">
      <div className="audit-demo-bar">
        <span className="audit-demo-brand">Alfath Pulsa / Audit stok</span>
        <button
          className="audit-demo-open"
          type="button"
          onClick={() => setDialogOpen(true)}
          aria-haspopup="dialog"
        >
          <AlertTriangle size={14} aria-hidden="true" />
          Contoh dialog izin
          <span aria-hidden="true">· lokal</span>
        </button>
      </div>
      <BranchStockAudit />
      {dialogOpen && (
        <div
          className="audit-sample-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDialogOpen(false);
          }}
        >
          <section
            className="audit-sample-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-sample-title"
          >
            <div className="audit-sample-head">
              <div>
                <p className="audit-sample-kicker">Contoh lokal · tanpa aksi nyata</p>
                <h2 id="audit-sample-title">Cabut izin tampil produk?</h2>
              </div>
              <button
                type="button"
                className="audit-sample-close"
                aria-label="Tutup contoh dialog"
                onClick={() => setDialogOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="audit-sample-copy">
              Kabel Data Type-C 1 m akan dikeluarkan dari cakupan hitung dan daftar belanja
              untuk cabang Cendana. Cabang lain dan rencana belanja lama tidak berubah.
            </p>
            <div className="audit-sample-branch">
              <small>Stok cabang · data demo</small>
              <strong>Cendana <span aria-hidden="true">·</span> 0 pcs</strong>
            </div>
            <div className="audit-sample-note">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>Pencabutan hanya diizinkan jika stok terbaru tepat 0.</span>
            </div>
            <div className="audit-sample-actions">
              <button className="audit-sample-cancel" type="button" onClick={() => setDialogOpen(false)}>
                Kembali
              </button>
              <button className="audit-sample-confirm" type="button" onClick={() => setDialogOpen(false)}>
                Tutup contoh
              </button>
            </div>
            <p className="audit-sample-footnote">Pratinjau dialog • tindakan dinonaktifkan</p>
          </section>
        </div>
      )}
    </div>
  );
}
