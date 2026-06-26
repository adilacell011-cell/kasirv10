import {
  Search,
  Plus,
  LayoutList,
  Store,
  ChevronRight,
  Menu,
  ArrowRightLeft,
} from "lucide-react";

const base = "#e0e5ec";
const textMuted = "#8794a8";
const textDark = "#3d4859";

const raised = "6px 6px 14px #b8c2d0, -6px -6px 14px #ffffff";
const raisedSm = "4px 4px 9px #b8c2d0, -4px -4px 9px #ffffff";
const inset = "inset 4px 4px 8px #b8c2d0, inset -4px -4px 8px #ffffff";

export function ProdukNeuLampu() {
  const rows = [
    { kind: "Kategori Utama", name: "AKSESORIS", count: 8, glow: "59,130,246", tile: "#3b82f6" },
    { kind: "Kategori Utama", name: "VOUCHER", count: 12, glow: "59,130,246", tile: "#3b82f6" },
  ];

  return (
    <div
      className="min-h-screen w-full font-sans"
      style={{ backgroundColor: base }}
    >
      {/* Top bar */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ backgroundColor: base }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: base, boxShadow: raisedSm, color: textDark }}
        >
          <Menu className="w-4 h-4" />
        </div>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            backgroundColor: "#2563eb",
            boxShadow: "0 0 14px 1px rgba(37,99,235,0.55)",
            color: "#fff",
          }}
        >
          <Store className="w-4 h-4" />
        </div>
        <p
          className="text-sm font-black tracking-tight"
          style={{ color: textDark }}
        >
          Master Barang
        </p>
      </div>

      {/* Toolbar */}
      <div className="px-4 pt-2 pb-4 flex flex-col gap-3">
        {/* Search */}
        <div className="relative">
          <Search
            className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2"
            style={{ color: textMuted }}
          />
          <input
            readOnly
            placeholder="Cari master barang..."
            className="w-full rounded-2xl pl-11 pr-4 py-3 text-xs font-semibold outline-none"
            style={{
              backgroundColor: base,
              boxShadow: inset,
              color: textDark,
            }}
          />
        </div>

        {/* Add button with lamp glow */}
        <button
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[11px] font-black uppercase tracking-widest text-white"
          style={{
            backgroundColor: "#2563eb",
            boxShadow:
              "0 0 22px 3px rgba(37,99,235,0.6), 6px 6px 14px #b8c2d0, -6px -6px 14px #ffffff",
          }}
        >
          <Plus className="w-4 h-4" /> Tambah Master Produk
        </button>

        {/* Category pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white"
            style={{
              backgroundColor: "#2563eb",
              boxShadow: "0 0 16px 2px rgba(37,99,235,0.55)",
            }}
          >
            <LayoutList className="w-3 h-3" />
            Semua Kategori
          </button>
          <button
            className="shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"
            style={{ backgroundColor: base, boxShadow: raisedSm, color: textMuted }}
          >
            Voucher
          </button>
          <button
            className="shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"
            style={{ backgroundColor: base, boxShadow: raisedSm, color: textMuted }}
          >
            Aksesoris
          </button>
        </div>
      </div>

      {/* Column header */}
      <div
        className="flex items-center justify-between px-6 py-3 text-[9px] font-black uppercase tracking-[0.18em]"
        style={{ color: textMuted }}
      >
        <span>Item Master</span>
        <span>Jumlah</span>
      </div>

      {/* Category rows */}
      <div className="px-4 flex flex-col gap-4 pb-8">
        {rows.map((r) => (
          <div
            key={r.name}
            className="flex items-center gap-4 rounded-2xl p-4"
            style={{ backgroundColor: base, boxShadow: raised }}
          >
            {/* Icon tile with colored lamp glow */}
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: base,
                boxShadow: `0 0 16px 1px rgba(${r.glow},0.5), ${raisedSm}`,
                color: r.tile,
              }}
            >
              <LayoutList className="w-6 h-6" />
            </div>

            <div className="flex-1 min-w-0">
              <p
                className="text-[9px] font-black uppercase tracking-[0.18em] mb-1"
                style={{ color: textMuted }}
              >
                {r.kind}
              </p>
              <p
                className="text-base font-black uppercase tracking-tight truncate"
                style={{ color: textDark }}
              >
                {r.name}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span
                className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest"
                style={{ backgroundColor: base, boxShadow: inset, color: textDark }}
              >
                {r.count} Macam
              </span>
              <div style={{ color: textMuted }}>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        ))}

        {/* Drill hint */}
        <div
          className="flex items-center justify-center gap-2 mt-1 text-[9px] font-bold uppercase tracking-widest"
          style={{ color: textMuted }}
        >
          Ketuk kategori untuk lihat detail
          <ArrowRightLeft className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
}
