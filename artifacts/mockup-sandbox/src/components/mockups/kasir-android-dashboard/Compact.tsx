import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  LayoutDashboard,
  Menu,
  Package,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  Warehouse,
} from 'lucide-react';

const KPI_CARDS = [
  {
    label: 'Total Omset',
    val: 'Rp 70.000',
    sub: 'Periode terpilih',
    icon: TrendingUp,
    tone: 'revenue',
  },
  {
    label: 'Total Transaksi',
    val: '5',
    sub: 'transaksi',
    icon: ShoppingBag,
    tone: 'transactions',
  },
  {
    label: 'Laba Bersih',
    val: 'Rp 8.860',
    sub: 'estimasi profit',
    icon: Sparkles,
    tone: 'profit',
  },
  {
    label: 'Stok Menipis',
    val: '0',
    sub: 'produk perlu restock',
    icon: AlertTriangle,
    tone: 'stock',
  },
];

const PERIODS = [
  { id: 'today', label: 'Harian' },
  { id: 'week', label: 'Mingguan' },
  { id: 'month', label: 'Bulanan' },
  { id: 'all', label: 'Semua' },
];

const MOBILE_NAV = [
  { id: 'dashboard', label: 'Dash', icon: LayoutDashboard },
  { id: 'reports', label: 'Laporan', icon: Activity },
  { id: 'inventory', label: 'Barang', icon: Package },
  { id: 'branch-stocks', label: 'Stok', icon: Warehouse },
  { id: 'incentive', label: 'Bonus', icon: Sparkles },
];

const TREND_SAMPLE = [
  { day: 'Sen', count: 2, height: '40%' },
  { day: 'Sel', count: 3, height: '60%' },
  { day: 'Rab', count: 1, height: '20%' },
  { day: 'Kam', count: 4, height: '80%' },
  { day: 'Jum', count: 2, height: '40%' },
  { day: 'Sab', count: 5, height: '100%' },
  { day: 'Min', count: 3, height: '60%' },
];

export function Compact() {
  const [period, setPeriod] = useState('today');
  const [branchOpen, setBranchOpen] = useState(false);
  const [branch, setBranch] = useState('Semua Cabang');
  const [activePage, setActivePage] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="kasir-compact">
      <style>{`
        .kasir-compact {
          --kc-ink: #203144;
          --kc-muted: #718196;
          --kc-line: #e1e8ee;
          --kc-paper: #f2f6f7;
          --kc-card: #ffffff;
          --kc-teal: #147a75;
          min-height: 100dvh;
          height: 100dvh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          color: var(--kc-ink);
          background: var(--kc-paper);
          font-family: inherit;
        }
        .kasir-compact *, .kasir-compact *::before, .kasir-compact *::after { box-sizing: border-box; }
        .kc-topbar {
          min-height: 56px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 0 14px;
          background: #fff;
          border-bottom: 1px solid var(--kc-line);
          z-index: 2;
        }
        .kc-brand, .kc-actions { display: flex; align-items: center; }
        .kc-brand { gap: 9px; min-width: 0; }
        .kc-brand-mark {
          width: 31px; height: 31px; display: grid; place-items: center; flex: 0 0 auto;
          border-radius: 10px; color: var(--kc-teal); background: #e7f3f1;
        }
        .kc-brand-title { min-width: 0; font-size: 12px; font-weight: 800; letter-spacing: -.025em; white-space: nowrap; }
        .kc-brand-caption { display: block; color: var(--kc-muted); font-size: 9px; font-weight: 600; letter-spacing: .025em; margin-top: 1px; }
        .kc-actions { gap: 7px; flex: 0 0 auto; }
        .kc-icon-button {
          width: 34px; height: 34px; border: 1px solid var(--kc-line); border-radius: 11px;
          background: #fff; color: #52657a; display: grid; place-items: center; cursor: pointer;
          transition: transform 150ms ease, background-color 150ms ease;
        }
        .kc-icon-button:active { transform: scale(.96); background: #f2f7f7; }
        .kc-online { display:flex; align-items:center; gap:6px; padding: 7px 9px; border-radius: 20px; background:#eef7f3; color:#337560; font-size:9px; font-weight:800; letter-spacing:.045em; }
        .kc-online-dot { width:6px; height:6px; background:#3b9b72; border-radius:50%; }
        .kc-main { flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; padding-bottom: calc(68px + env(safe-area-inset-bottom, 0px)); }
        .kc-dashboard-head { background:#fff; padding: 15px 16px 13px; border-bottom:1px solid var(--kc-line); }
        .kc-title-row { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:13px; }
        .kc-eyebrow { margin:0 0 3px; color:var(--kc-muted); font-size:9px; font-weight:800; letter-spacing:.105em; text-transform:uppercase; }
        .kc-title { margin:0; color:var(--kc-ink); font-size:19px; font-weight:800; letter-spacing:-.045em; line-height:1.12; }
        .kc-period-wrap { display:grid; grid-template-columns:1fr; gap:8px; }
        .kc-periods { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:3px; background:#edf2f4; padding:3px; border-radius:11px; }
        .kc-period {
          min-width:0; min-height:32px; border:0; border-radius:8px; padding:0 3px;
          background:transparent; color:#718196; font-family:inherit; font-size:10px; font-weight:700; line-height:1; cursor:pointer; white-space:nowrap;
          transition: color 150ms ease, background-color 150ms ease, transform 150ms ease;
        }
        .kc-period[aria-pressed="true"] { background:#fff; color:var(--kc-teal); box-shadow:0 1px 4px #263d4a18; }
        .kc-period:active { transform:scale(.97); }
        .kc-branch-wrap { position:relative; }
        .kc-branch {
          width:100%; min-height:36px; display:flex; align-items:center; justify-content:space-between;
          padding:0 11px; border:1px solid var(--kc-line); border-radius:10px; color:#40566a; background:#fff;
          font-family:inherit; font-size:10px; font-weight:700; text-align:left; cursor:pointer;
        }
        .kc-branch-menu {
          position:absolute; top:calc(100% + 5px); left:0; right:0; z-index:4; padding:4px;
          border:1px solid var(--kc-line); border-radius:11px; background:#fff; box-shadow:0 10px 24px #263d4a20;
          animation: kc-reveal 150ms ease-out both;
        }
        .kc-branch-option { width:100%; border:0; border-radius:7px; background:transparent; padding:9px 8px; text-align:left; color:var(--kc-ink); font-size:11px; cursor:pointer; }
        .kc-branch-option:hover { background:#f0f6f5; }
        .kc-content { padding:12px 14px 14px; max-width:640px; margin:0 auto; width:100%; }
        .kc-content-top { display:flex; align-items:center; justify-content:space-between; margin:0 1px 10px; }
        .kc-updated { display:flex; align-items:center; gap:6px; color:var(--kc-muted); font-size:10px; font-weight:600; }
        .kc-refresh-mark { width:6px; height:6px; border-radius:50%; background:#69a88a; }
        .kc-demo-note { color:#93a0ad; font-size:9px; font-weight:600; }
        .kc-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:9px; }
        .kc-card {
          min-width:0; min-height:127px; display:flex; flex-direction:column; justify-content:space-between;
          padding:12px 12px 11px; border:1px solid #e3e9ed; border-radius:15px; background:var(--kc-card);
          box-shadow:0 2px 7px #1b35440a; animation:kc-reveal 300ms ease-out both;
        }
        .kc-card:nth-child(2) { animation-delay:35ms; }
        .kc-card:nth-child(3) { animation-delay:70ms; }
        .kc-card:nth-child(4) { animation-delay:105ms; }
        .kc-card-top { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .kc-card-label { margin:0; color:#68798b; font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.055em; line-height:1.2; }
        .kc-metric-icon { flex:0 0 auto; width:28px; height:28px; border-radius:9px; display:grid; place-items:center; }
        .kc-metric-icon.revenue { color:#277b91; background:#eaf5f6; }
        .kc-metric-icon.transactions { color:#36846c; background:#eaf5ee; }
        .kc-metric-icon.profit { color:#826b9a; background:#f2edf6; }
        .kc-metric-icon.stock { color:#ae8150; background:#fbf2e8; }
        .kc-card-value { margin:9px 0 2px; font-variant-numeric:tabular-nums; color:#24384a; font-size:clamp(18px, 5vw, 22px); font-weight:800; letter-spacing:-.05em; line-height:1.05; overflow-wrap:anywhere; }
        .kc-card-sub { margin:0; color:#95a1ad; font-size:9px; font-weight:600; }
        .kc-trend {
          margin-top:11px; padding:12px 13px 10px; border:1px solid #e3e9ed; border-radius:15px;
          background:#fff; box-shadow:0 2px 7px #1b35440a;
        }
        .kc-trend-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .kc-trend-title { display:flex; align-items:center; gap:7px; margin:0; color:#30465a; font-size:11px; font-weight:800; letter-spacing:-.01em; }
        .kc-trend-title svg { color:var(--kc-teal); }
        .kc-trend-period { margin:3px 0 0 22px; color:#8795a3; font-size:9px; font-weight:600; }
        .kc-sample-tag { padding:4px 6px; border-radius:6px; color:#718196; background:#f0f4f5; font-size:8px; font-weight:700; white-space:nowrap; }
        .kc-chart { height:73px; display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); align-items:end; gap:8px; margin-top:10px; }
        .kc-chart-day { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:4px; min-width:0; }
        .kc-chart-count { color:#718196; font-size:8px; font-weight:700; font-variant-numeric:tabular-nums; }
        .kc-chart-track { width:100%; height:47px; display:flex; align-items:flex-end; justify-content:center; }
        .kc-chart-bar { width:min(17px, 70%); min-width:8px; border-radius:5px 5px 2px 2px; background:#7bb7ad; }
        .kc-chart-day:nth-child(4n + 1) .kc-chart-bar, .kc-chart-day:nth-child(4n + 2) .kc-chart-bar { background:#9ac7bf; }
        .kc-chart-day:nth-child(6) .kc-chart-bar { background:#338d82; }
        .kc-chart-label { color:#8795a3; font-size:8px; font-weight:700; }
        .kc-nav {
          position:fixed; z-index:5; bottom:0; left:0; right:0;
          padding:6px 8px calc(6px + env(safe-area-inset-bottom, 0px));
          background:#fff; border-top:1px solid #e4eaee;
          box-shadow:0 -5px 18px #24394a0c;
        }
        .kc-nav-items { max-width:560px; margin:0 auto; display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); }
        .kc-nav-item { min-width:0; height:48px; border:0; background:transparent; color:#8795a3; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; cursor:pointer; transition:color 150ms ease, transform 150ms ease; }
        .kc-nav-item:active { transform:scale(.95); }
        .kc-nav-item[aria-current="page"] { color:var(--kc-teal); }
        .kc-nav-label { overflow:hidden; max-width:100%; text-overflow:ellipsis; white-space:nowrap; font-size:9px; font-weight:700; letter-spacing:.01em; }
        .kc-menu-card { position:absolute; top:48px; left:12px; z-index:3; border:1px solid var(--kc-line); border-radius:12px; background:#fff; padding:11px 13px; font-size:11px; color:var(--kc-ink); box-shadow:0 10px 24px #263d4a20; animation:kc-reveal 150ms ease-out both; }
        @keyframes kc-reveal { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
        @media (min-width:430px) {
          .kc-topbar { padding-inline:18px; }
          .kc-dashboard-head { padding-inline:20px; }
          .kc-content { padding:14px 18px; }
          .kc-grid { gap:11px; }
          .kc-card { min-height:136px; padding:14px; }
          .kc-card-value { font-size:23px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .kasir-compact *, .kasir-compact *::before, .kasir-compact *::after {
            animation-duration: .01ms !important; animation-iteration-count: 1 !important;
            scroll-behavior: auto !important; transition-duration: .01ms !important;
          }
        }
      `}</style>
      <header className="kc-topbar">
        <div className="kc-brand">
          <button className="kc-icon-button" aria-label="Buka menu" onClick={() => setMenuOpen((open) => !open)}>
            <Menu size={17} />
          </button>
          <div className="kc-brand-mark"><Store size={17} /></div>
          <div className="kc-brand-title">
            Kasir V10
            <span className="kc-brand-caption">Panel pemilik</span>
          </div>
        </div>
        <div className="kc-actions">
          <span className="kc-online"><i className="kc-online-dot" />Online</span>
          <button className="kc-icon-button" aria-label="Daftar Belanja" title="Daftar Belanja">
            <ShoppingCart size={16} />
          </button>
        </div>
      </header>
      {menuOpen && <div className="kc-menu-card">Dashboard Pusat <span style={{ color: '#718196' }}>· Ringkasan usaha</span></div>}

      <main className="kc-main">
        <section className="kc-dashboard-head" aria-label="Kontrol dashboard">
          <div className="kc-title-row">
            <div>
              <p className="kc-eyebrow">Ringkasan usaha</p>
              <h1 className="kc-title">Dashboard Pusat</h1>
            </div>
          </div>
          <div className="kc-period-wrap">
            <div className="kc-periods" role="group" aria-label="Pilih periode">
              {PERIODS.map((item) => (
                <button
                  key={item.id}
                  className="kc-period"
                  aria-pressed={period === item.id}
                  onClick={() => setPeriod(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="kc-branch-wrap">
              <button className="kc-branch" aria-expanded={branchOpen} onClick={() => setBranchOpen((open) => !open)}>
                <span>{branch}</span><ChevronDown size={14} />
              </button>
              {branchOpen && (
                <div className="kc-branch-menu" role="listbox" aria-label="Pilih cabang">
                  {['Semua Cabang', 'Cabang Utama', 'Cabang Selatan'].map((name) => (
                    <button
                      className="kc-branch-option"
                      key={name}
                      role="option"
                      aria-selected={branch === name}
                      onClick={() => { setBranch(name); setBranchOpen(false); }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="kc-content" aria-label="Metrik performa cabang">
          <div className="kc-content-top">
            <span className="kc-updated"><i className="kc-refresh-mark" />Diperbarui 10:42</span>
            <span className="kc-demo-note">Contoh tampilan</span>
          </div>
          <div className="kc-grid">
            {KPI_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <article className="kc-card" key={card.label}>
                  <div className="kc-card-top">
                    <p className="kc-card-label">{card.label}</p>
                    <span className={`kc-metric-icon ${card.tone}`}><Icon size={15} /></span>
                  </div>
                  <div>
                    <h2 className="kc-card-value">{card.val}</h2>
                    <p className="kc-card-sub">{card.sub}</p>
                  </div>
                </article>
              );
            })}
          </div>
          <section className="kc-trend" aria-labelledby="kc-trend-title">
            <div className="kc-trend-head">
              <div>
                <h2 className="kc-trend-title" id="kc-trend-title"><Activity size={14} />Tren Transaksi</h2>
                <p className="kc-trend-period">7 Hari Terakhir</p>
              </div>
              <span className="kc-sample-tag">Angka contoh</span>
            </div>
            <div
              className="kc-chart"
              role="img"
              aria-label="Grafik ilustratif transaksi tujuh hari: Senin 2, Selasa 3, Rabu 1, Kamis 4, Jumat 2, Sabtu 5, Minggu 3 transaksi."
            >
              {TREND_SAMPLE.map((item) => (
                <div className="kc-chart-day" key={item.day}>
                  <span className="kc-chart-count">{item.count}</span>
                  <div className="kc-chart-track">
                    <div className="kc-chart-bar" style={{ height: item.height }} />
                  </div>
                  <span className="kc-chart-label">{item.day}</span>
                </div>
              ))}
            </div>
          </section>
        </section>
      </main>

      <nav className="kc-nav" aria-label="Navigasi utama">
        <div className="kc-nav-items">
          {MOBILE_NAV.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                className="kc-nav-item"
                aria-current={active ? 'page' : undefined}
                onClick={() => setActivePage(item.id)}
              >
                <Icon size={18} strokeWidth={active ? 2.4 : 1.9} />
                <span className="kc-nav-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
