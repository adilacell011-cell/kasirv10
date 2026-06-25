import React from "react";
import { 
  LayoutDashboard, ShoppingCart, Package, ArrowRightLeft, Users, 
  ShoppingBag, FileText, Settings, Bell, Search, MapPin, 
  TrendingUp, TrendingDown, DollarSign, Wallet, AlertCircle, 
  ChevronDown, Plus, Check, X, Smartphone, Zap
} from "lucide-react";

export function FreshFriendly() {
  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        .variant-fresh {
          --bg-base: #FBF9F6;
          --bg-card: #FFFFFF;
          --border-color: #EBE7E0;
          --accent-primary: #2D8A78;
          --accent-primary-hover: #236B5D;
          --accent-light: #E6F3F0;
          --accent-text: #1A6355;
          --text-main: #2D3A37;
          --text-muted: #7D8F8A;
          --success-bg: #E8F5E9;
          --success-text: #2E7D32;
          --warning-bg-real: #FFF8E1;
          --warning-text: #F57C00;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          letter-spacing: -0.012em;
        }

        /* Pakai font sistem iOS (San Francisco) untuk semua teks */
        .variant-fresh .font-serif,
        .variant-fresh .font-sans {
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }
        .variant-fresh h1,
        .variant-fresh h2,
        .variant-fresh h3 {
          letter-spacing: -0.022em;
        }

        .variant-fresh .shadow-soft {
          box-shadow: 0 6px 22px -8px rgba(45, 138, 120, 0.10), 0 1px 2px rgba(45, 58, 55, 0.04);
        }

        /* Polesan halus di tiap komponen: transisi lembut + efek tekan ala iOS */
        .variant-fresh .shadow-soft {
          transition: transform .3s cubic-bezier(.34,1.4,.64,1), box-shadow .3s ease;
        }
        .variant-fresh .shadow-soft:hover {
          box-shadow: 0 18px 36px -14px rgba(45, 138, 120, 0.18), 0 2px 4px rgba(45, 58, 55, 0.04);
        }
        .variant-fresh button,
        .variant-fresh a {
          transition: transform .18s cubic-bezier(.34,1.45,.64,1), box-shadow .25s ease, background-color .2s ease, filter .2s ease, color .2s ease;
        }
        .variant-fresh button:active,
        .variant-fresh a:active {
          transform: scale(.96);
        }
        .variant-fresh input,
        .variant-fresh select {
          transition: border-color .2s ease, box-shadow .2s ease, background-color .2s ease;
        }

        /* Custom scrollbar for friendly look */
        .variant-fresh ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .variant-fresh ::-webkit-scrollbar-track {
          background: transparent;
        }
        .variant-fresh ::-webkit-scrollbar-thumb {
          background: #D5DEDC;
          border-radius: 10px;
        }
        .variant-fresh ::-webkit-scrollbar-thumb:hover {
          background: #B4C2BE;
        }
      `}} />
      
      <div className="variant-fresh min-h-screen bg-[var(--bg-base)] font-sans text-[var(--text-main)] overflow-hidden flex relative selection:bg-[var(--accent-primary)] selection:text-white">
        
        {/* Sidebar */}
        <aside className="w-72 bg-[var(--bg-card)] my-4 ml-4 rounded-[32px] border border-[var(--border-color)] shadow-soft hidden lg:flex flex-col z-10 overflow-hidden relative">
          <div className="p-8 pb-6 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[var(--accent-light)] flex items-center justify-center text-[var(--accent-primary)]">
              <Smartphone className="w-6 h-6" />
            </div>
            <h1 className="font-serif text-xl font-bold text-[var(--text-main)] tracking-tight">Alfath Pulsa</h1>
          </div>

          <div className="flex-1 px-4 overflow-y-auto space-y-1 mt-2">
            <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3 ml-4">Menu Utama</div>
            
            <a href="#" className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[var(--accent-primary)] text-white font-semibold transition-transform hover:scale-[1.02]">
              <LayoutDashboard className="w-5 h-5" />
              <span>Dashboard</span>
            </a>
            
            <a href="#" className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[var(--text-muted)] font-semibold hover:bg-[var(--accent-light)] hover:text-[var(--accent-primary)] transition-colors">
              <ShoppingCart className="w-5 h-5" />
              <span>Kasir</span>
            </a>

            <a href="#" className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[var(--text-muted)] font-semibold hover:bg-[var(--accent-light)] hover:text-[var(--accent-primary)] transition-colors">
              <Package className="w-5 h-5" />
              <span>Stok Produk</span>
            </a>

            <a href="#" className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[var(--text-muted)] font-semibold hover:bg-[var(--accent-light)] hover:text-[var(--accent-primary)] transition-colors relative">
              <ArrowRightLeft className="w-5 h-5" />
              <span>Transaksi</span>
              <span className="absolute right-4 bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded-full">3</span>
            </a>

            <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-3 ml-4 mt-8">Manajemen</div>

            <a href="#" className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[var(--text-muted)] font-semibold hover:bg-[var(--accent-light)] hover:text-[var(--accent-primary)] transition-colors">
              <Users className="w-5 h-5" />
              <span>Karyawan</span>
            </a>

            <a href="#" className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[var(--text-muted)] font-semibold hover:bg-[var(--accent-light)] hover:text-[var(--accent-primary)] transition-colors">
              <ShoppingBag className="w-5 h-5" />
              <span>Belanja</span>
            </a>

            <a href="#" className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[var(--text-muted)] font-semibold hover:bg-[var(--accent-light)] hover:text-[var(--accent-primary)] transition-colors">
              <FileText className="w-5 h-5" />
              <span>Laporan</span>
            </a>

            <a href="#" className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[var(--text-muted)] font-semibold hover:bg-[var(--accent-light)] hover:text-[var(--accent-primary)] transition-colors">
              <Settings className="w-5 h-5" />
              <span>Pengaturan</span>
            </a>
          </div>

          <div className="p-4 m-4 mt-auto rounded-3xl bg-[var(--bg-base)] border border-[var(--border-color)] flex items-center gap-3 cursor-pointer hover:border-[var(--accent-primary)] transition-colors">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[var(--accent-primary)] to-emerald-400 text-white flex items-center justify-center font-bold text-lg">
              A
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm truncate">Admin</div>
              <div className="text-xs text-[var(--text-muted)] truncate">Administrator</div>
            </div>
            <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
          </div>
        </aside>

        {/* Main Area */}
        <main className="flex-1 flex flex-col h-screen overflow-y-auto overflow-x-hidden">
          {/* Topbar */}
          <header className="px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4 z-10 sticky top-0 bg-[var(--bg-base)]/80 backdrop-blur-md">
            <div>
              <h2 className="font-serif text-2xl font-bold text-[var(--text-main)]">Dashboard</h2>
              <p className="text-[var(--text-muted)] font-medium mt-1">Selamat datang kembali! Ini ringkasan hari ini.</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 bg-[var(--bg-card)] px-4 py-2.5 rounded-2xl border border-[var(--border-color)] shadow-sm">
                <MapPin className="w-4 h-4 text-[var(--accent-primary)]" />
                <span className="text-sm font-bold text-[var(--text-main)]">Cabang Utama</span>
                <ChevronDown className="w-4 h-4 text-[var(--text-muted)] ml-1" />
              </div>

              <div className="relative hidden lg:block">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-[var(--text-muted)]" />
                </div>
                <input 
                  type="text" 
                  placeholder="Cari transaksi..." 
                  className="pl-10 pr-4 py-2.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 focus:border-[var(--accent-primary)] w-64 shadow-sm placeholder:text-[var(--text-muted)]"
                />
              </div>

              <button className="w-11 h-11 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--accent-primary)] shadow-sm relative transition-colors">
                <Bell className="w-5 h-5" />
                <span className="absolute top-2 right-2.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
              </button>
            </div>
          </header>

          <div className="px-8 pb-12 space-y-8 max-w-7xl">
            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {/* Stat 1 */}
              <div className="bg-[var(--bg-card)] rounded-[28px] p-6 border border-[var(--border-color)] shadow-soft relative overflow-hidden group hover:-translate-y-1 transition-transform">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-[var(--accent-light)] rounded-full opacity-50 group-hover:scale-110 transition-transform"></div>
                <div className="flex justify-between items-start relative z-10">
                  <div>
                    <p className="text-[var(--text-muted)] font-bold text-sm mb-1">Omset Hari Ini</p>
                    <h3 className="font-serif text-xl lg:text-2xl font-bold text-[var(--text-main)] tracking-tight">Rp 4.250.000</h3>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-[var(--accent-primary)] flex items-center justify-center text-white shadow-md shadow-[var(--accent-primary)]/30">
                    <Wallet className="w-6 h-6" />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-sm font-bold relative z-10">
                  <span className="flex items-center text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
                    <TrendingUp className="w-3.5 h-3.5 mr-1" />
                    +12%
                  </span>
                  <span className="text-[var(--text-muted)] text-xs">vs kemarin</span>
                </div>
              </div>

              {/* Stat 2 */}
              <div className="bg-[var(--bg-card)] rounded-[28px] p-6 border border-[var(--border-color)] shadow-soft relative overflow-hidden group hover:-translate-y-1 transition-transform">
                <div className="flex justify-between items-start relative z-10">
                  <div>
                    <p className="text-[var(--text-muted)] font-bold text-sm mb-1">Laba Bersih</p>
                    <h3 className="font-serif text-xl lg:text-2xl font-bold text-[var(--text-main)] tracking-tight">Rp 612.000</h3>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-sky-500 flex items-center justify-center text-white shadow-md shadow-sky-500/30">
                    <DollarSign className="w-6 h-6" />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-sm font-bold relative z-10">
                  <span className="flex items-center text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
                    <TrendingUp className="w-3.5 h-3.5 mr-1" />
                    +8%
                  </span>
                  <span className="text-[var(--text-muted)] text-xs">vs kemarin</span>
                </div>
              </div>

              {/* Stat 3 */}
              <div className="bg-[var(--bg-card)] rounded-[28px] p-6 border border-[var(--border-color)] shadow-soft relative overflow-hidden group hover:-translate-y-1 transition-transform">
                <div className="flex justify-between items-start relative z-10">
                  <div>
                    <p className="text-[var(--text-muted)] font-bold text-sm mb-1">Total Transaksi</p>
                    <h3 className="font-serif text-xl lg:text-2xl font-bold text-[var(--text-main)] tracking-tight">87</h3>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/30">
                    <ArrowRightLeft className="w-6 h-6" />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-sm font-bold relative z-10">
                  <span className="flex items-center text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg">
                    <TrendingUp className="w-3.5 h-3.5 mr-1" />
                    +5
                  </span>
                  <span className="text-[var(--text-muted)] text-xs">vs kemarin</span>
                </div>
              </div>

              {/* Stat 4 */}
              <div className="bg-[var(--bg-card)] rounded-[28px] p-6 border border-[var(--border-color)] shadow-soft relative overflow-hidden group hover:-translate-y-1 transition-transform">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-amber-50 rounded-full opacity-50 group-hover:scale-110 transition-transform"></div>
                <div className="flex justify-between items-start relative z-10">
                  <div>
                    <p className="text-[var(--text-muted)] font-bold text-sm mb-1">Stok Menipis</p>
                    <h3 className="font-serif text-xl lg:text-2xl font-bold text-amber-600 tracking-tight">5 produk</h3>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center text-white shadow-md shadow-amber-500/30">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-sm font-bold relative z-10">
                  <span className="flex items-center text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg">
                    Cek sekarang
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Chart Area */}
              <div className="lg:col-span-1 bg-[var(--bg-card)] rounded-[32px] border border-[var(--border-color)] shadow-soft p-6 md:p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="font-serif text-lg font-bold text-[var(--text-main)]">Tren Penjualan</h3>
                    <p className="text-sm font-medium text-[var(--text-muted)] mt-1">7 Hari Terakhir</p>
                  </div>
                  <button className="p-2 bg-[var(--bg-base)] rounded-xl text-[var(--text-muted)] hover:text-[var(--text-main)]">
                    <TrendingUp className="w-5 h-5" />
                  </button>
                </div>
                
                {/* Custom SVG Chart */}
                <div className="relative h-48 w-full mt-4 flex items-end justify-between px-2">
                  <div className="absolute inset-0 flex flex-col justify-between pt-2 pb-6">
                    <div className="border-t border-dashed border-[var(--border-color)] w-full"></div>
                    <div className="border-t border-dashed border-[var(--border-color)] w-full"></div>
                    <div className="border-t border-dashed border-[var(--border-color)] w-full"></div>
                    <div className="border-t border-solid border-[var(--border-color)] w-full"></div>
                  </div>
                  
                  {/* Bars */}
                  {[40, 65, 45, 80, 55, 90, 75].map((h, i) => (
                    <div key={i} className="relative flex flex-col items-center group w-[10%] z-10 h-full justify-end pb-6">
                      <div className="w-full bg-[var(--accent-light)] rounded-t-xl overflow-hidden flex items-end relative transition-all group-hover:bg-[var(--accent-primary)]/20" style={{ height: `${h}%` }}>
                        <div className="w-full bg-[var(--accent-primary)] rounded-t-xl transition-all group-hover:brightness-110" style={{ height: `${h - 15}%` }}></div>
                        {/* Tooltip */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[var(--text-main)] text-white text-[10px] font-bold py-1 px-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg">
                          Rp {(h * 50).toLocaleString('id-ID')}
                        </div>
                      </div>
                      <span className="absolute bottom-0 text-[11px] font-bold text-[var(--text-muted)]">
                        {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'][i]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Table Area */}
              <div className="lg:col-span-2 bg-[var(--bg-card)] rounded-[32px] border border-[var(--border-color)] shadow-soft p-6 md:p-8 flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="font-serif text-lg font-bold text-[var(--text-main)]">Transaksi Terbaru</h3>
                    <p className="text-sm font-medium text-[var(--text-muted)] mt-1">Hari ini</p>
                  </div>
                  <button className="text-sm font-bold text-[var(--accent-primary)] bg-[var(--accent-light)] px-4 py-2 rounded-xl hover:brightness-95 transition-all">
                    Lihat Semua
                  </button>
                </div>

                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr>
                        <th className="py-3 px-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-color)]">Waktu</th>
                        <th className="py-3 px-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-color)]">Produk</th>
                        <th className="py-3 px-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-color)]">Cabang</th>
                        <th className="py-3 px-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-color)]">Kasir</th>
                        <th className="py-3 px-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-color)] text-right">Nominal</th>
                        <th className="py-3 px-4 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-color)] text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)]">
                      {[
                        { time: '14:23', prod: 'Pulsa Telkomsel 50rb', branch: 'Cabang Utama', cashier: 'Andi', amount: '51.500', status: 'Berhasil' },
                        { time: '14:15', prod: 'Token PLN 100rb', branch: 'Cabang Pasar', cashier: 'Siti', amount: '102.000', status: 'Berhasil' },
                        { time: '13:58', prod: 'Paket Data XL 25rb', branch: 'Cabang Timur', cashier: 'Budi', amount: '26.000', status: 'Pending' },
                        { time: '13:42', prod: 'Pulsa Indosat 20rb', branch: 'Cabang Utama', cashier: 'Andi', amount: '21.000', status: 'Berhasil' },
                        { time: '13:30', prod: 'Voucher Game ML 86 D', branch: 'Cabang Pasar', cashier: 'Siti', amount: '24.000', status: 'Berhasil' },
                        { time: '13:10', prod: 'BPJS Kesehatan', branch: 'Cabang Timur', cashier: 'Budi', amount: '152.500', status: 'Berhasil' },
                      ].map((row, idx) => (
                        <tr key={idx} className="hover:bg-[var(--bg-base)] transition-colors group">
                          <td className="py-4 px-4 text-sm font-semibold text-[var(--text-muted)] whitespace-nowrap">{row.time}</td>
                          <td className="py-4 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[var(--bg-base)] flex items-center justify-center text-[var(--text-main)] group-hover:bg-white group-hover:shadow-sm transition-all border border-[var(--border-color)]">
                                {row.prod.includes('PLN') ? <Zap className="w-4 h-4 text-amber-500" /> : <Smartphone className="w-4 h-4" />}
                              </div>
                              <span className="font-bold text-[var(--text-main)]">{row.prod}</span>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-sm font-semibold text-[var(--text-main)] whitespace-nowrap">{row.branch}</td>
                          <td className="py-4 px-4 text-sm font-semibold text-[var(--text-main)] whitespace-nowrap">{row.cashier}</td>
                          <td className="py-4 px-4 text-sm font-bold text-[var(--text-main)] text-right whitespace-nowrap">Rp {row.amount}</td>
                          <td className="py-4 px-4 text-center whitespace-nowrap">
                            {row.status === 'Berhasil' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--success-bg)] text-[var(--success-text)] text-[11px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--success-text)]"></span>
                                BERHASIL
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--warning-bg-real)] text-[var(--warning-text)] text-[11px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning-text)] animate-pulse"></span>
                                PENDING
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* STATIC POPUP EXAMPLE (For demonstration) */}
        <div className="absolute inset-0 bg-[var(--text-main)]/20 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card)] w-full max-w-md rounded-[32px] shadow-2xl border border-[var(--border-color)] overflow-hidden flex flex-col transform transition-transform scale-100 relative">
            <div className="px-8 pt-8 pb-6 text-center relative">
              <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[var(--bg-base)] flex items-center justify-center text-[var(--text-muted)] cursor-pointer hover:bg-gray-100 transition-colors">
                <X className="w-4 h-4" />
              </div>
              <div className="w-16 h-16 rounded-3xl bg-[var(--accent-light)] mx-auto flex items-center justify-center text-[var(--accent-primary)] mb-5 shadow-sm transform -rotate-6">
                <Package className="w-8 h-8 transform rotate-6" />
              </div>
              <h3 className="font-serif text-xl font-bold text-[var(--text-main)]">Tambah Produk Baru</h3>
              <p className="text-[var(--text-muted)] font-medium text-sm mt-2">Silakan isi detail produk untuk menambahkannya ke sistem.</p>
            </div>
            
            <div className="px-8 pb-8 space-y-4">
              <div>
                <label className="block text-sm font-bold text-[var(--text-main)] mb-1.5">Nama Produk</label>
                <input type="text" value="Pulsa Telkomsel 100rb" readOnly className="w-full px-4 py-3 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-color)] text-[var(--text-main)] font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 focus:border-[var(--accent-primary)]" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[var(--text-main)] mb-1.5">Kategori</label>
                  <select className="w-full px-4 py-3 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-color)] text-[var(--text-main)] font-semibold focus:outline-none appearance-none">
                    <option>Pulsa Reguler</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-[var(--text-main)] mb-1.5">Harga Jual</label>
                  <input type="text" value="Rp 102.000" readOnly className="w-full px-4 py-3 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-color)] text-[var(--text-main)] font-semibold focus:outline-none" />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button className="flex-1 py-3.5 rounded-2xl font-bold text-[var(--text-muted)] bg-[var(--bg-base)] hover:bg-gray-100 transition-colors">
                  Batal
                </button>
                <button className="flex-[2] py-3.5 rounded-2xl font-bold text-white bg-[var(--accent-primary)] shadow-md shadow-[var(--accent-primary)]/20 hover:bg-[var(--accent-primary-hover)] transition-colors flex items-center justify-center gap-2">
                  <Check className="w-5 h-5" />
                  Simpan Produk
                </button>
              </div>
            </div>
          </div>

          {/* Toast Notification */}
          <div className="absolute top-6 right-6 bg-white rounded-2xl shadow-xl border border-[var(--border-color)] p-4 flex items-center gap-3 w-80 transform translate-y-0 opacity-100 z-50">
            <div className="w-10 h-10 rounded-full bg-[var(--success-bg)] flex items-center justify-center text-[var(--success-text)] shrink-0">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-[var(--text-main)]">Transaksi Berhasil</p>
              <p className="text-xs font-medium text-[var(--text-muted)] mt-0.5">Data telah tersimpan di sistem.</p>
            </div>
            <button className="ml-auto text-[var(--text-muted)] hover:text-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
