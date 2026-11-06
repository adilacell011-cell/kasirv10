import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  Users,
  Warehouse,
} from 'lucide-react';

const KPI_CARDS = [
  {
    label: 'Total Omset',
    val: 'Rp 70.000',
    sub: 'Periode terpilih',
    icon: TrendingUp,
    tile: 'bg-blue-600 shadow-blue-200',
  },
  {
    label: 'Total Transaksi',
    val: '5',
    sub: 'transaksi',
    icon: ShoppingBag,
    tile: 'bg-emerald-500 shadow-emerald-200',
  },
  {
    label: 'Laba Bersih',
    val: 'Rp 8.860',
    sub: 'estimasi profit',
    icon: Sparkles,
    tile: 'bg-violet-500 shadow-violet-200',
  },
  {
    label: 'Stok Menipis',
    val: '0',
    sub: 'produk perlu restock',
    icon: AlertTriangle,
    tile: 'bg-amber-500 shadow-amber-200',
  },
];

const MOBILE_NAV = [
  { id: 'dashboard', label: 'Dash', icon: LayoutDashboard },
  { id: 'reports', label: 'Laporan', icon: Activity },
  { id: 'inventory', label: 'Barang', icon: Package },
  { id: 'branch-stocks', label: 'Stok', icon: Warehouse },
  { id: 'incentive', label: 'Bonus', icon: Sparkles },
  { id: 'audit', label: 'Opname', icon: ClipboardCheck },
  { id: 'stock-audit', label: 'Audit', icon: ClipboardCheck },
  { id: 'employees', label: 'Karyawan', icon: Users },
  { id: 'settings', label: 'Cabang', icon: Store },
];

export function Current() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex-1 flex flex-col min-w-0 pb-[68px] relative h-[100dvh]">
        {/* HEADER */}
        <header className="h-16 bg-white flex items-center justify-between shrink-0 z-10 shadow-[0_6px_16px_rgba(184,194,208,0.45)] relative px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <button
              aria-label="Buka menu"
              onClick={() => {}}
              className="p-2 -ml-1 rounded-xl bg-slate-50 text-blue-600 shadow-[3px_3px_7px_#b8c2d0,-3px_-3px_7px_#ffffff,0_0_12px_1px_rgba(59,130,246,0.3)] active:shadow-[inset_3px_3px_6px_#b8c2d0,inset_-3px_-3px_6px_#ffffff] transition-all"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="md:hidden shrink-0 w-9 h-9 rounded-xl bg-slate-50 items-center justify-center shadow-[3px_3px_7px_#b8c2d0,-3px_-3px_7px_#ffffff,0_0_14px_1px_rgba(59,130,246,0.4)] flex">
              <Store className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex min-w-0 flex-col justify-center">
              <h2 className="max-w-full text-sm font-extrabold uppercase tracking-tight text-slate-800 truncate leading-tight">
                Dashboard Pusat
              </h2>
            </div>
          </div>
          <div className="flex items-center shrink-0 gap-2">
            <button
              aria-label="Daftar Belanja"
              onClick={() => {}}
              className="flex items-center gap-2 rounded-xl py-1.5 px-3 font-black text-[9px] uppercase tracking-widest transition-all bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Daftar Belanja</span>
            </button>
            <button
              aria-label="Sistem online"
              onClick={() => {}}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl shrink-0 transition-all active:scale-95 cursor-pointer bg-slate-50 shadow-[3px_3px_7px_#b8c2d0,-3px_-3px_7px_#ffffff]"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-[7px] font-black uppercase tracking-widest text-slate-600">
                Online
              </span>
            </button>
            <button
              aria-label="Mode gelap"
              onClick={() => {}}
              className="flex items-center justify-center h-8.5 w-8.5 rounded-xl bg-slate-50 text-slate-600 shrink-0 cursor-pointer transition-all shadow-[3px_3px_7px_#b8c2d0,-3px_-3px_7px_#ffffff]"
            >
              <Moon className="w-4 h-4 text-indigo-500 drop-shadow-[0_0_6px_rgba(99,102,241,0.6)]" />
            </button>
            <button
              aria-label="Keluar"
              onClick={() => {}}
              className="lg:hidden w-8.5 h-8.5 rounded-xl bg-slate-50 text-red-500 flex items-center justify-center shrink-0 transition-all shadow-[3px_3px_7px_#b8c2d0,-3px_-3px_7px_#ffffff]"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden flex bg-slate-50/50 relative h-full">
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
            {/* HEADER DASHBOARD COMPACT */}
            <div className="bg-white px-4 py-4 border-b border-slate-200 shrink-0">
              <div className="flex flex-col justify-between gap-4">
                <div className="text-left">
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">
                    Dashboard Pusat
                  </h2>
                </div>

                <div className="flex flex-col items-stretch gap-2">
                  <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
                    {[
                      { id: 'today', label: 'Harian' },
                      { id: 'week', label: 'Mingguan' },
                      { id: 'month', label: 'Bulanan' },
                      { id: 'all', label: 'Semua' },
                    ].map((period) => (
                      <button
                        key={period.id}
                        onClick={() => {}}
                        className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-tighter transition-all ${
                          period.id === 'today'
                            ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {period.label}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => {}}
                    className="bg-white border border-slate-200 rounded-2xl px-4 py-2 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-blue-100 outline-none text-left flex items-center justify-between"
                  >
                    <span>Semua Cabang</span>
                    <span className="text-slate-400">⌄</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto w-full content-fade">
              <div className="mb-4 text-xs" role="status" aria-live="polite">
                <span className="text-slate-500">Diperbarui 10:42</span>
              </div>
              <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-6">
                {KPI_CARDS.map((card) => (
                  <div
                    key={card.label}
                    className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-3"
                  >
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-lg ${card.tile}`}>
                      <card.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{card.label}</p>
                      <h3 className="text-xl font-black text-slate-900 tracking-tight break-words leading-tight">{card.val}</h3>
                      <p className="text-[9px] font-bold text-slate-400 mt-0.5">{card.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>

        {/* MOBILE BOTTOM NAV */}
        <nav
          className="md:hidden fixed bottom-0 w-full bg-white shadow-[0_-6px_14px_rgba(184,194,208,0.45)] z-[50] overflow-x-auto hide-scrollbar"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="flex items-center h-[68px] px-2 min-w-max">
            {MOBILE_NAV.map((item) => {
              const active = item.id === 'dashboard';
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {}}
                  className={`shrink-0 w-20 sm:flex-1 flex flex-col items-center justify-center h-full gap-1 transition-colors relative ${
                    active ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <div className="relative">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
                        active ? 'bg-blue-50 scale-105 shadow-sm' : ''
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${active ? 'fill-current' : ''}`} />
                    </div>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
