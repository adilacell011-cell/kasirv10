import React from "react";

const BASE = "/__mockup/images/operators";

const operators = [
  { name: "Telkomsel", file: "telkomsel.svg", bg: "#fef2f2", border: "#fecaca", size: "25 KB" },
  { name: "Indosat",   file: "indosat.svg",   bg: "#fffbeb", border: "#fde68a", size: "12 KB" },
  { name: "XL",        file: "xl.svg",        bg: "#eff6ff", border: "#bfdbfe", size: "15 KB" },
  { name: "Axis",      file: "axis.svg",       bg: "#f8fafc", border: "#e2e8f0", size: "4 KB"  },
  { name: "Smartfren", file: "smartfren.svg",  bg: "#fdf2f8", border: "#f9a8d4", size: "10 KB" },
  { name: "Tri",       file: "tri.svg",        bg: "#eff9ff", border: "#bae6fd", size: "0.4 KB" },
];

function MiniCard({ name, file }: { name: string; file: string }) {
  return (
    <div style={{
      background: "#f8fafc", borderRadius: 12, padding: "8px 10px",
      border: "1px solid #e2e8f0", minWidth: 115, maxWidth: 130,
    }}>
      {/* Header baris — sama persis seperti di kartu POS */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        {/* OperatorBadge replica */}
        <span style={{
          display: "inline-flex", alignItems: "center",
          background: "white", border: "1px solid #e2e8f0",
          borderRadius: 6, padding: "3px 6px",
        }}>
          <img
            src={`${BASE}/${file}`}
            alt={name}
            style={{ height: 14, width: "auto", maxWidth: 52, objectFit: "contain", display: "block" }}
          />
        </span>
        <span style={{
          fontSize: 7, fontWeight: 700, background: "#f0fdf4",
          color: "#16a34a", borderRadius: 4, padding: "1px 4px",
        }}>
          STOK: 5
        </span>
      </div>
      <p style={{ fontSize: 9, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", marginBottom: 6, lineHeight: 1.3 }}>
        {name} 10K<br />
        <span style={{ fontWeight: 500, color: "#64748b" }}>4GB / 1 Hari</span>
      </p>
      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: "#0f172a" }}>Rp 10.000</span>
        <span style={{
          width: 18, height: 18, background: "#fff", border: "1px solid #e2e8f0",
          borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: "#94a3b8",
        }}>+</span>
      </div>
    </div>
  );
}

export function OperatorLogoPreview() {
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: "28px 24px", fontFamily: "system-ui, sans-serif" }}>

      {/* Judul */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 16, fontWeight: 900, color: "#0f172a", margin: 0, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          Logo Resmi Operator
        </h1>
        <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 0", fontWeight: 500 }}>
          SVG asli dari Wikimedia Commons · bundled ke app · nol request server
        </p>
      </div>

      {/* Grid kartu logo besar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
        {operators.map(({ name, file, bg, border, size }) => (
          <div key={name} style={{
            background: "white", borderRadius: 14, padding: "16px 18px",
            border: `1px solid ${border}`, display: "flex", flexDirection: "column", gap: 10,
          }}>
            {/* Logo besar */}
            <div style={{
              background: bg, borderRadius: 10, padding: "14px 16px",
              display: "flex", alignItems: "center", justifyContent: "center",
              minHeight: 56,
            }}>
              <img
                src={`${BASE}/${file}`}
                alt={name}
                style={{ height: 36, width: "auto", maxWidth: 160, objectFit: "contain" }}
              />
            </div>
            {/* Info */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>{name}</span>
              <span style={{
                fontSize: 8, fontWeight: 600, color: "#64748b",
                background: "#f1f5f9", borderRadius: 5, padding: "2px 6px",
              }}>
                {size}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Divider label */}
      <p style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#94a3b8", marginBottom: 10 }}>
        Tampilan di kartu produk POS — badge logo (tinggi 14px)
      </p>

      {/* Simulasi mini kartu POS */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {operators.map(({ name, file }) => (
          <MiniCard key={name} name={name} file={file} />
        ))}
      </div>

      {/* Catatan fallback */}
      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px" }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#92400e", margin: 0 }}>
          ℹ️  Brand lain (Aksesoris, Handphone, dll.) → tetap text badge seperti semula, tidak terpengaruh
        </p>
      </div>
    </div>
  );
}
