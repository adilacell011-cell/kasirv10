import type { ReactNode } from "react";
import "./_group.css";
import { AlertCircle, ArrowDownRight, ArrowUpRight, Check, MapPin, PackageSearch, Plus, RefreshCw } from "lucide-react";

type Item = {
  id: string;
  name: string;
  identifier: string;
  status: "Belum dihitung" | "Sudah dihitung" | "Hitung ulang";
  system: number;
  physical: number | null;
  variance: number | null;
  countedBy?: string;
};

const items: Item[] = [
  {
    id: "qa-c2h2",
    name: "QA-C2H2-1793632781210 Beta",
    identifier: "BC QA-C2H2-1793632781210-Beta",
    status: "Belum dihitung",
    system: 3,
    physical: null,
    variance: null,
  },
  {
    id: "refund-revenue",
    name: "QA-REFUND-REVENUE-1793713469456-c2546-produk-active-cashier",
    identifier: "ID c3901b6b-0dda-4cbf-b511-defec128b9cc",
    status: "Sudah dihitung",
    system: 0,
    physical: 2,
    variance: 2,
    countedBy: "Super Admin · 23.29",
  },
  {
    id: "multi",
    name: "QA-MULTI-C9F8BD2",
    identifier: "SKU QA-MULTI-C9F8BD2",
    status: "Hitung ulang",
    system: 8,
    physical: 5,
    variance: -3,
  },
];

function ProductRow({ item }: { item: Item }) {
  const counted = item.status === "Sudah dihitung";
  const conflict = item.status === "Hitung ulang";

  return (
    <article className="audit-product-row">
      <div className="audit-product-heading">
        <span className="audit-product-icon"><PackageSearch size={17} /></span>
        <div className="audit-product-identity">
          <strong title={item.name}>{item.name}</strong>
          <small title={item.identifier}>{item.identifier}</small>
        </div>
        <span className={`audit-status ${counted ? "is-counted" : conflict ? "is-conflict" : ""}`}>
          {conflict && <AlertCircle size={12} />}
          {item.status}
        </span>
      </div>

      <div className="audit-product-footer">
        <div className="audit-product-metrics">
          <Metric label="Sistem" value={item.system} />
          <Metric label="Fisik" value={item.physical ?? "—"} />
          <Metric
            label="Selisih"
            value={
              item.variance == null
                ? "—"
                : item.variance > 0
                  ? <><ArrowUpRight size={12} />{item.variance}</>
                  : item.variance < 0
                    ? <><ArrowDownRight size={12} />{Math.abs(item.variance)}</>
                    : "0"
            }
          />
        </div>
        <div className="audit-product-actions">
          <button className={conflict ? "audit-recount" : "audit-count"}>
            {conflict ? <RefreshCw size={13} /> : counted ? <Check size={13} /> : <Plus size={13} />}
            {conflict ? "Ulang" : counted ? "Ubah" : "Hitung"}
          </button>
          <button className="audit-revoke"><MapPin size={13} /> Cabut</button>
        </div>
      </div>
      {item.countedBy && <p className="audit-counted-by">{item.countedBy}</p>}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="audit-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function CompactRows() {
  return (
    <main className="audit-product-preview">
      <header className="audit-preview-toolbar">
        <span className="audit-preview-menu">☰</span>
        <strong>AUDIT STOK<br />CABANG</strong>
        <span className="audit-preview-spacer" />
        <span className="audit-preview-action">◉</span>
        <span className="audit-preview-action">●</span>
        <span className="audit-preview-action">↪</span>
      </header>
      <section className="audit-preview-panel">
        <div className="audit-preview-title">
          <div>
            <p>DAFTAR HITUNG</p>
            <h1>Alfath 2</h1>
            <span>Produk audit cabang · 53 produk</span>
          </div>
          <span className="audit-preview-progress">2% Selesai</span>
        </div>
        <div className="audit-preview-search">⌕ &nbsp; Cari nama, SKU, barcode…</div>
        <div className="audit-preview-filters"><span>Semua status⌄</span><span>▤ &nbsp; Scan</span></div>
        <div className="audit-product-list">
          {items.map((item) => <ProductRow key={item.id} item={item} />)}
        </div>
      </section>
      <nav className="audit-preview-nav">
        <span>DASH</span><span>LAPORAN</span><span>BARANG</span><span>STOK</span>
        <span>BONUS</span><span>OPNAME</span><strong>AUDIT</strong><span>KARYAWAN</span><span>CABANG</span>
      </nav>
    </main>
  );
}
