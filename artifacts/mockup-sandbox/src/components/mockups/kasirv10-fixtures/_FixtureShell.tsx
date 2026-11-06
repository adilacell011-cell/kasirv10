import type { ReactNode } from "react";
import {
  Activity, Boxes, LayoutDashboard, Menu, Moon, Store, WalletCards,
} from "lucide-react";
import "./_group.css";

const nav = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Kasir", icon: WalletCards },
  { label: "Stok", icon: Boxes },
  { label: "Laporan", icon: Activity },
  { label: "Lainnya", icon: Menu },
];
const adminMobileTitles = new Set([
  "Dashboard Pusat",
  "Audit Stok Cabang",
  "Laporan Shift & Cabang",
  "Stok per Cabang",
  "Manajemen Stok Opname",
  "Bonus & Insentif",
  "Manajemen Shift",
  "Pengaturan Cabang",
  "Karyawan & Akses",
]);

export function FixtureShell({ title, children }: { title: string; children: ReactNode }) {
  const prioritizeMobileReadability = adminMobileTitles.has(title);
  const activeNav = title.includes("Dashboard") ? "Dashboard"
    : title.includes("Kasir") || title.includes("Penjualan") ? "Kasir"
    : title.includes("Laporan") || title.includes("Riwayat") ? "Laporan"
    : title.includes("Stok") || title.includes("Opname") || title.includes("Produk") ? "Stok"
    : "Lainnya";
  return (
    <div className={`kasirv10-fixture app-shell flex min-h-screen flex-col ${prioritizeMobileReadability ? "fixture-admin-mobile" : ""}`}>
      <header className="app-topbar sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between bg-white px-4 shadow-md md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button aria-label="Menu" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-blue-600 shadow-sm">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-blue-600 shadow-sm md:hidden">
            <Store className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-extrabold uppercase tracking-tight text-slate-800">{title}</h2>
            <p className="hidden text-[9px] font-bold uppercase tracking-widest text-slate-400 sm:block">Alfath Pulsa System · Demo Lokal</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-emerald-700 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Offline fixture
          </span>
          <button aria-label="Tampilan" className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-600 shadow-sm">
            <Moon className="h-4 w-4" />
          </button>
          <div className="hidden h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-xs font-black text-white sm:flex">AP</div>
        </div>
      </header>
      <main className="app-workspace min-h-0 flex-1 overflow-y-auto px-3 pb-24 pt-4 sm:px-5 md:px-8 md:pb-8">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
      <nav className="app-bottom-nav fixed inset-x-0 bottom-0 z-30 overflow-x-auto bg-white md:hidden">
        <div className="flex h-[68px] min-w-full items-center px-2">
          {nav.map(({ label, icon: Icon }) => (
            <button key={label} className={`flex h-full min-w-[64px] flex-1 flex-col items-center justify-center gap-1 ${label === activeNav ? "fixture-nav-current text-blue-600" : "text-slate-400"}`}>
              <span className={`flex h-9 w-10 items-center justify-center rounded-2xl ${label === activeNav ? "bg-blue-50 shadow-sm" : ""}`}><Icon className="h-5 w-5" /></span>
              <span className="text-[8px] font-black uppercase tracking-wider">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function FixturePageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return <div className="mb-5"><h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{title}</h1>{subtitle && <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>}</div>;
}

export function FixtureStat({ label, value, detail, tone = "blue" }: { label: string; value: string; detail?: string; tone?: "blue" | "green" | "amber" | "rose" }) {
  const colors = { blue: "text-blue-700 bg-blue-50", green: "text-emerald-700 bg-emerald-50", amber: "text-amber-700 bg-amber-50", rose: "text-rose-700 bg-rose-50" };
  return <div className="fixture-panel p-4"><p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p><p className={`mt-2 whitespace-nowrap text-lg font-black tabular-nums sm:text-xl ${colors[tone].split(" ")[0]}`}>{value}</p>{detail && <p className={`mt-2 inline-flex rounded-lg px-2 py-1 text-[9px] font-bold ${colors[tone]}`}>{detail}</p>}</div>;
}

export function FixtureTable({ headings, rows, mobileCards = false }: { headings: string[]; rows: ReactNode[][]; mobileCards?: boolean }) {
  return <div className="max-w-full overflow-x-auto overscroll-x-contain"><table className={`fixture-table w-full min-w-[620px] border-collapse text-left text-xs ${mobileCards ? "fixture-mobile-cards" : ""}`}><thead><tr className="border-b border-slate-200">{headings.map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-600">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-200">{rows.map((row, i) => <tr key={i} className="hover:bg-blue-50/50">{row.map((cell, j) => <td key={j} data-label={headings[j]} data-card-title={mobileCards && j === 0 ? "" : undefined} className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">{cell}</td>)}</tr>)}</tbody></table></div>;
}

export function FixtureButton({ children }: { children: ReactNode }) {
  return <button type="button" className="min-h-10 rounded-xl bg-blue-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-sm">{children}</button>;
}
