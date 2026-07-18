import React from "react";

/* ── Inline SVG Logos (sama persis dengan yang di app) ── */

const TelkomselLogo = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="16" fill="#E01E20" />
    <path d="M19.5 5.5 L10.5 17.5 H15.5 L12.5 26.5 L22.5 14 H17.5 Z" fill="white" />
  </svg>
);

const IndosatLogo = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="16" fill="#F4A918" />
    <circle cx="16" cy="9" r="2.5" fill="white" />
    <rect x="13.5" y="13" width="5" height="11.5" rx="2" fill="white" />
  </svg>
);

const XLLogo = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="16" fill="#003F9A" />
    <text x="16" y="21" fontSize="13" fontWeight="900" fill="white"
      textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif">XL</text>
  </svg>
);

const AxisLogo = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="16" fill="#2C2C2C" />
    <text x="16" y="20.5" fontSize="9" fontWeight="900" fill="white"
      textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif" letterSpacing="0.5">AXIS</text>
  </svg>
);

const SmartfrenLogo = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="16" fill="#D8006A" />
    <rect x="9"    y="20"   width="3.5" height="5"    rx="1" fill="white" />
    <rect x="14.25" y="15.5" width="3.5" height="9.5"  rx="1" fill="white" />
    <rect x="19.5" y="10.5" width="3.5" height="14.5" rx="1" fill="white" />
  </svg>
);

const TriLogo = ({ size = 40 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="16" fill="#00A0D2" />
    <text x="16" y="23" fontSize="20" fontWeight="900" fill="white"
      textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif">3</text>
  </svg>
);

/* ── Data ── */
const operators = [
  { name: "Telkomsel", color: "#E01E20", Logo: TelkomselLogo,
    desc: "Voucher, Perdana Kuota & Biasa", sizes: ["10K","20K","50K","100K"] },
  { name: "Indosat",   color: "#F4A918", Logo: IndosatLogo,
    desc: "Voucher, Perdana Kuota & Biasa", sizes: ["10K","25K","50K"] },
  { name: "XL",        color: "#003F9A", Logo: XLLogo,
    desc: "Voucher, Perdana Kuota & Biasa", sizes: ["15K","30K","60K"] },
  { name: "Axis",      color: "#2C2C2C", Logo: AxisLogo,
    desc: "Voucher, Perdana Kuota & Biasa", sizes: ["15K","30K","50K"] },
  { name: "Smartfren", color: "#D8006A", Logo: SmartfrenLogo,
    desc: "Voucher, Perdana Kuota & Biasa", sizes: ["18K","36K","70K"] },
  { name: "Tri",       color: "#00A0D2", Logo: TriLogo,
    desc: "Voucher, Perdana Kuota & Biasa", sizes: ["15K","35K","65K"] },
];

/* ── Preview contoh kartu produk (mini) ── */
function MiniCard({ Logo, name, color }: { Logo: React.FC<{size?:number}>, name: string, color: string }) {
  return (
    <div style={{ background: "#f8fafc", borderRadius: 12, padding: "8px 10px", border: "1px solid #e2e8f0", minWidth: 110 }}>
      {/* header row — sama dengan kartu POS */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
            <Logo size={18} />
          </span>
          <span style={{ fontSize: 7, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b" }}>
            {name}
          </span>
        </span>
        <span style={{ fontSize: 7, fontWeight: 700, background: "#f0fdf4", color: "#16a34a", borderRadius: 4, padding: "1px 4px" }}>
          STOK: 5
        </span>
      </div>
      <p style={{ fontSize: 9, fontWeight: 800, color: "#0f172a", textTransform: "uppercase", marginBottom: 6, lineHeight: 1.3 }}>
        {name} 10K<br/>
        <span style={{ fontWeight: 500, color: "#64748b" }}>4GB / 1 Hari</span>
      </p>
      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: "#0f172a" }}>Rp 10.000</span>
        <span style={{
          width: 18, height: 18, background: "#fff", border: "1px solid #e2e8f0",
          borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: "#94a3b8", fontWeight: 300
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
          Logo Operator Seluler
        </h1>
        <p style={{ fontSize: 11, color: "#64748b", margin: "4px 0 0", fontWeight: 500 }}>
          SVG inline — nol request server • otomatis muncul berdasarkan nama brand produk
        </p>
      </div>

      {/* Grid logo besar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
        {operators.map(({ name, color, Logo, desc }) => (
          <div key={name} style={{
            background: "white", borderRadius: 14, padding: "16px 14px",
            border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 14
          }}>
            {/* logo besar */}
            <div style={{
              width: 52, height: 52, borderRadius: "50%", overflow: "hidden",
              flexShrink: 0, boxShadow: `0 2px 8px ${color}44`
            }}>
              <Logo size={52} />
            </div>
            {/* teks */}
            <div>
              <p style={{ fontSize: 13, fontWeight: 900, color: "#0f172a", margin: 0 }}>{name}</p>
              <p style={{ fontSize: 9, color: "#94a3b8", margin: "2px 0 6px", fontWeight: 500 }}>{desc}</p>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {[18, 26, 36].map(s => (
                  <span key={s} style={{
                    background: "#f8fafc", border: "1px solid #e2e8f0",
                    borderRadius: 6, padding: "2px 6px", fontSize: 8, fontWeight: 700, color: "#334155"
                  }}>
                    {s}px
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <p style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#94a3b8", marginBottom: 10 }}>
        Tampilan di kartu produk POS (18px)
      </p>

      {/* Mini cards simulasi */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {operators.map(({ name, color, Logo }) => (
          <MiniCard key={name} Logo={Logo} name={name} color={color} />
        ))}
      </div>

      {/* Keterangan fallback */}
      <div style={{ marginTop: 20, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px" }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#92400e", margin: 0 }}>
          ℹ️ Brand tidak dikenal (Aksesoris, Handphone, dll.) → tetap tampil sebagai text badge seperti semula
        </p>
      </div>
    </div>
  );
}
