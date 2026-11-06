import { useMemo, useState } from 'react';
import {
  ArrowLeft, Barcode, Check, ChevronDown, Edit3, Search, SlidersHorizontal, X,
} from 'lucide-react';
import { PremiumPageFrame } from './_shared/PremiumPageFrame';
import './_shared/tokens.css';

type Product = {
  id: string;
  name: string;
  barcode: string;
  category: string;
  brand: string;
  provider?: string;
  description: string;
  purchasePrice: number;
  sellingPrice: number;
  promoPrice: number;
};

const INITIAL_PRODUCTS: Product[] = [
  { id: 'p-01', name: 'Pulsa 10.000', barcode: 'ALF-TS-01001', category: 'Pulsa', brand: 'Telkomsel', description: 'Pulsa reguler · masa aktif mengikuti kebijakan operator', purchasePrice: 10200, sellingPrice: 12000, promoPrice: 0 },
  { id: 'p-02', name: 'Pulsa 25.000', barcode: 'ALF-TS-01025', category: 'Pulsa', brand: 'Telkomsel', description: 'Pulsa reguler', purchasePrice: 25100, sellingPrice: 27000, promoPrice: 0 },
  { id: 'p-03', name: 'Pulsa 50.000', barcode: 'ALF-TS-01050', category: 'Pulsa', brand: 'Telkomsel', description: 'Pulsa reguler', purchasePrice: 49900, sellingPrice: 52000, promoPrice: 0 },
  { id: 'p-04', name: 'Paket Data Freedom Internet 12 GB — Masa Aktif 30 Hari', barcode: 'ALF-IM-12030', category: 'Paket Data', brand: 'Indosat', description: 'Kuota utama nasional · 30 hari', purchasePrice: 48500, sellingPrice: 55000, promoPrice: 52900 },
  { id: 'p-05', name: 'Paket Yellow 1 GB — Akses 24 Jam, Berlaku 7 Hari', barcode: 'ALF-IM-01007', category: 'Paket Data', brand: 'Indosat', description: 'Kuota utama · 7 hari', purchasePrice: 8000, sellingPrice: 10000, promoPrice: 0 },
  { id: 'p-06', name: 'Paket Data Combo Sakti 18 GB + Telepon 60 Menit', barcode: 'ALF-TS-18030', category: 'Paket Data', brand: 'Telkomsel', description: 'Kuota utama & telepon · 30 hari', purchasePrice: 64500, sellingPrice: 72000, promoPrice: 0 },
  { id: 'p-07', name: 'Voucher Data 1 GB — 3 Hari', barcode: 'ALF-V-TS-0103', category: 'Voucher', brand: 'Telkomsel', provider: 'Telkomsel', description: 'Kuota data · masa aktif 3 hari', purchasePrice: 9000, sellingPrice: 12000, promoPrice: 0 },
  { id: 'p-08', name: 'Voucher Data 3 GB — 7 Hari', barcode: 'ALF-V-TS-0307', category: 'Voucher', brand: 'Telkomsel', provider: 'Telkomsel', description: 'Kuota data · masa aktif 7 hari', purchasePrice: 18000, sellingPrice: 22000, promoPrice: 0 },
  { id: 'p-09', name: 'Voucher 20.000', barcode: 'ALF-V-PLN-20', category: 'Voucher', brand: 'PLN', provider: 'PLN', description: 'Token listrik prabayar', purchasePrice: 20100, sellingPrice: 22000, promoPrice: 0 },
  { id: 'p-10', name: 'Kartu Perdana Xtra Combo Flex S', barcode: 'ALF-P-XL-004', category: 'Perdana', brand: 'XL', provider: 'XL', description: 'Kuota 3 GB + bonus aplikasi', purchasePrice: 26000, sellingPrice: 30000, promoPrice: 0 },
];

const CATEGORIES = ['Pulsa', 'Paket Data', 'Voucher', 'Perdana'];
const rupiah = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;
const productGroup = (product: Product) =>
  product.category === 'Voucher' || product.category === 'Perdana'
    ? product.provider || product.brand
    : product.brand || product.category;
const visibleName = (product: Product) => {
  if (product.category === 'Voucher' && product.name.toLowerCase().startsWith('voucher')) {
    return product.name.replace(/voucher/i, product.provider || product.brand);
  }
  if (product.category === 'Perdana' && !product.name.toLowerCase().includes(product.brand.toLowerCase())) {
    return `${product.brand} ${product.name}`;
  }
  return product.name;
};

export function MasterProducts() {
  const [products, setProducts] = useState(INITIAL_PRODUCTS);
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set(['Pulsa', 'Paket Data', 'Voucher']));
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => new Set(['Pulsa::Telkomsel', 'Paket Data::Indosat', 'Voucher::Telkomsel']));
  const [activeCategory, setActiveCategory] = useState('Semua kategori');
  const [editing, setEditing] = useState<Product | null>(null);
  const [draft, setDraft] = useState({ name: '', barcode: '', purchase: '', selling: '', promo: '', description: '' });
  const [notice, setNotice] = useState('');

  const matching = useMemo(() => products.filter((product) => {
    const term = search.trim().toLowerCase();
    return (!term || [product.name, product.barcode, product.brand, product.provider || ''].some((value) => value.toLowerCase().includes(term)))
      && (activeCategory === 'Semua kategori' || product.category === activeCategory);
  }), [products, search, activeCategory]);
  const groups = useMemo(() => CATEGORIES.map((category) => {
    const items = matching.filter((product) => product.category === category);
    const providers = Array.from(new Set(items.map(productGroup)));
    return { category, items, providers: providers.map((provider) => ({
      provider,
      products: items.filter((product) => productGroup(product) === provider)
        .sort((a, b) => (a.promoPrice || a.sellingPrice) - (b.promoPrice || b.sellingPrice)),
    })) };
  }).filter((group) => group.items.length), [matching]);

  const toggle = (set: Set<string>, setter: (next: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };
  const openEdit = (product: Product) => {
    setEditing(product);
    setDraft({
      name: visibleName(product), barcode: product.barcode,
      purchase: String(product.purchasePrice), selling: String(product.sellingPrice),
      promo: product.promoPrice ? String(product.promoPrice) : '', description: product.description,
    });
  };
  const saveEdit = () => {
    if (!editing || !draft.name.trim()) return;
    setProducts((current) => current.map((item) => item.id === editing.id ? {
      ...item, name: draft.name.trim(), barcode: draft.barcode.trim(),
      purchasePrice: Number(draft.purchase) || 0, sellingPrice: Number(draft.selling) || 0,
      promoPrice: Number(draft.promo) || 0, description: draft.description,
    } : item));
    setEditing(null);
    setNotice('Perubahan tersimpan di pratinjau ini');
    window.setTimeout(() => setNotice(''), 2400);
  };

  return (
    <PremiumPageFrame
      section="Katalog Produk"
      title="Master Produk Global"
      description="Referensi produk untuk seluruh cabang, tersusun dari kategori hingga provider."
      action={<button className="pc-back" type="button" onClick={() => setNotice('Anda berada di Master Produk')}><ArrowLeft size={15} />Kembali</button>}
    >
      <div className="pc-page">
        <div className="pc-topline">
          <div className="pc-breadcrumb">MASTER DATA <span>/</span> KATALOG</div>
          <div className="pc-local"><i /> Pratinjau lokal</div>
        </div>
        <section className="pc-searchbar" aria-label="Pencarian katalog">
          <div className="pc-search">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama produk atau barcode" aria-label="Cari nama produk atau barcode" />
            {search && <button type="button" aria-label="Hapus pencarian" onClick={() => setSearch('')}><X size={15} /></button>}
            {!search && <kbd>⌘ K</kbd>}
          </div>
          <label className="pc-filter"><SlidersHorizontal size={15} /><select aria-label="Filter kategori" value={activeCategory} onChange={(event) => setActiveCategory(event.target.value)}>{['Semua kategori', ...CATEGORIES].map((category) => <option key={category}>{category}</option>)}</select><ChevronDown size={14} /></label>
        </section>
        <div className="pc-summary">
          <span><b>{matching.length.toString().padStart(2, '0')}</b> produk ditemukan</span>
          <span className="pc-summary-rule" />
          <span>Harga aktif <strong>setelah promo</strong></span>
          {notice && <span className="pc-notice"><Check size={13} />{notice}</span>}
        </div>
        <section className="pc-catalog" aria-label="Daftar master produk">
          <div className="pc-columns"><span>ITEM MASTER</span><span>KATEGORI &amp; SPEK</span><span>MODAL</span><span>HARGA JUAL</span><span /></div>
          {groups.length ? groups.map(({ category, items, providers }) => {
            const categoryOpen = search.trim() ? true : expandedCategories.has(category);
            return <div className="pc-category" key={category}>
              <button className={`pc-category-toggle ${categoryOpen ? 'open' : ''}`} type="button" aria-expanded={categoryOpen} onClick={() => toggle(expandedCategories, setExpandedCategories, category)}>
                <span className="pc-category-index">{String(CATEGORIES.indexOf(category) + 1).padStart(2, '0')}</span>
                <span className="pc-category-name">{category}</span>
                <span className="pc-count">{String(items.length).padStart(2, '0')} item</span><ChevronDown size={15} />
              </button>
              {categoryOpen && <div className="pc-provider-wrap premium-reveal">
                {providers.map(({ provider, products: providerProducts }) => {
                  const key = `${category}::${provider}`;
                  const providerOpen = search.trim() ? true : expandedProviders.has(key);
                  return <div className="pc-provider" key={key}>
                    <button className={`pc-provider-toggle ${providerOpen ? 'open' : ''}`} type="button" aria-expanded={providerOpen} onClick={() => toggle(expandedProviders, setExpandedProviders, key)}>
                      <span className="pc-provider-mark">{provider.slice(0, 1)}</span><span className="pc-provider-name">{provider}</span><span className="pc-provider-count">{providerProducts.length} produk</span><ChevronDown size={14} />
                    </button>
                    {providerOpen && <div className="pc-products premium-reveal">
                      {providerProducts.map((product) => <article className="pc-row" key={product.id}>
                        <div className="pc-item">
                          <strong>{visibleName(product)}</strong>
                          <span className="pc-barcode"><Barcode size={13} />{product.barcode}</span>
                        </div>
                        <div className="pc-spec"><span className="pc-tag">{product.brand}</span><small>{product.description}</small></div>
                        <div className="pc-price pc-purchase"><i>Modal</i>{rupiah(product.purchasePrice)}</div>
                        <div className="pc-price pc-selling"><i>Harga jual</i>{product.promoPrice ? <><b>{rupiah(product.promoPrice)}</b><del>{rupiah(product.sellingPrice)}</del></> : <b>{rupiah(product.sellingPrice)}</b>}</div>
                        <button type="button" className="pc-edit" onClick={() => openEdit(product)} aria-label={`Atur ${visibleName(product)}`}><Edit3 size={14} /><span>Atur</span></button>
                      </article>)}
                    </div>}
                  </div>;
                })}
              </div>}
            </div>;
          }) : <div className="pc-empty"><div><Search size={19} /></div><strong>Produk tidak ditemukan</strong><span>Coba kata kunci atau barcode lain.</span><button type="button" onClick={() => { setSearch(''); setActiveCategory('Semua kategori'); }}>Bersihkan pencarian</button></div>}
          <footer className="pc-footer"><span>Menampilkan <b>{matching.length}</b> dari <b>{products.length}</b> produk</span><span>ALFATH PULSA <i>•</i> MASTER DATA</span></footer>
        </section>
      </div>
      {editing && <div className="pc-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
        <section className="pc-dialog" role="dialog" aria-modal="true" aria-labelledby="pc-edit-title">
          <div className="pc-dialog-head"><div><span>MASTER PRODUK / EDIT</span><h2 id="pc-edit-title">Atur produk</h2></div><button type="button" onClick={() => setEditing(null)} aria-label="Tutup"><X size={18} /></button></div>
          <label>Nama produk<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label>Barcode<input value={draft.barcode} onChange={(event) => setDraft({ ...draft, barcode: event.target.value })} /></label>
          <div className="pc-dialog-grid">
            <label>Harga modal<input type="number" value={draft.purchase} onChange={(event) => setDraft({ ...draft, purchase: event.target.value })} /></label>
            <label>Harga jual<input type="number" value={draft.selling} onChange={(event) => setDraft({ ...draft, selling: event.target.value })} /></label>
          </div>
          <div className="pc-dialog-grid">
            <label>Harga promo · opsional<input type="number" value={draft.promo} onChange={(event) => setDraft({ ...draft, promo: event.target.value })} /></label>
            <label>Deskripsi<input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          </div>
          <div className="pc-dialog-actions"><button type="button" onClick={() => setEditing(null)}>Batal</button><button type="button" onClick={saveEdit}><Check size={15} />Simpan perubahan</button></div>
          <p className="pc-demo-caption">Perubahan hanya berlaku pada pratinjau ini.</p>
        </section>
      </div>}
      <style>{`
        .premium-page { --premium-blue:#2757a3; --premium-blue-deep:#183d76; --premium-navy:#1d304c; --premium-gold:#ad8b53; --premium-gold-soft:#f4efdf; --premium-paper:#f3f4f2; --premium-surface:#fffefa; --premium-ink:#29384d; --premium-muted:#7d8998; --premium-line:#e4e6e3; --premium-soft-shadow:0 16px 42px rgba(35,48,65,.08); font-family:"Trebuchet MS",ui-sans-serif,system-ui,sans-serif; }
        .pc-page { color:#29384d; }
        .pc-back { display:flex; align-items:center; gap:8px; padding:9px 13px; border:1px solid #e0e4e5; border-radius:7px; color:#52647c; background:#fbfcfa; font-size:12px; font-weight:700; cursor:pointer; }
        .pc-back:hover { border-color:#c6d2e1; color:#2757a3; }
        .pc-topline { display:flex; align-items:center; justify-content:space-between; margin: -8px 0 13px; color:#98a0a7; font-size:9px; font-weight:800; letter-spacing:.15em; }
        .pc-breadcrumb span { padding:0 7px; color:#b99a62; }
        .pc-local { display:flex; align-items:center; gap:7px; letter-spacing:.025em; font-size:10px; font-weight:650; }
        .pc-local i { width:6px;height:6px;border-radius:50%;background:#7da28f;box-shadow:0 0 0 3px #e7eee8; }
        .pc-searchbar { display:flex; gap:10px; }
        .pc-search { min-height:46px; flex:1; display:flex; align-items:center; gap:11px; padding:0 14px; border:1px solid #e0e4e4; border-radius:7px; background:#fffefa; color:#8491a1; box-shadow:0 3px 10px rgba(28,44,63,.025); }
        .pc-search:focus-within { border-color:#9db1cc; box-shadow:0 0 0 3px rgba(39,87,163,.08); }
        .pc-search input { width:100%; min-width:0; border:0; outline:0; background:transparent; color:#263954; font-size:13px; }
        .pc-search input::placeholder { color:#a1aab2; }
        .pc-search kbd { flex:none;padding:3px 6px;border:1px solid #eaebe8;border-radius:4px;background:#f8f8f5;color:#8d969d;font:10px ui-monospace,monospace; }
        .pc-search button { display:grid;place-items:center;border:0;background:transparent;color:#8793a1;cursor:pointer; }
        .pc-filter { min-height:46px;display:flex;align-items:center;gap:8px;padding:0 12px;border:1px solid #e0e4e4;border-radius:7px;background:#fffefa;color:#65758a; }
        .pc-filter select { appearance:none;border:0;outline:0;background:transparent;color:inherit;font-size:11px;font-weight:700;cursor:pointer; }
        .pc-summary { min-height:41px;display:flex;align-items:center;gap:12px;color:#89939f;font-size:10px; }
        .pc-summary b { color:#334e70;font:700 13px ui-monospace,monospace; }
        .pc-summary strong { margin-left:3px;color:#60728a;font-weight:700; }
        .pc-summary-rule { height:13px;width:1px;background:#d9dedf; }
        .pc-notice { margin-left:auto;display:flex;align-items:center;gap:5px;color:#668b77; }
        .pc-catalog { overflow:hidden;border:1px solid #e0e4e3;border-radius:8px;background:#fffefa;box-shadow:0 6px 20px rgba(27,43,60,.035); }
        .pc-columns,.pc-row { display:grid;grid-template-columns:minmax(255px,1.7fr) minmax(150px,1fr) minmax(110px,.72fr) minmax(128px,.82fr) 56px;align-items:center;column-gap:16px; }
        .pc-columns { min-height:38px;padding:0 17px;background:#fafaf7;border-bottom:1px solid #e8e9e5;color:#969da2;font-size:8px;font-weight:800;letter-spacing:.14em; }
        .pc-columns span:nth-child(3),.pc-columns span:nth-child(4) { text-align:right; }
        .pc-category + .pc-category { border-top:1px solid #e9ebe8; }
        .pc-category-toggle { width:100%;min-height:42px;display:flex;align-items:center;gap:10px;padding:0 17px;border:0;border-bottom:1px solid #e4e9ed;background:#edf2f7;color:#36557b;text-align:left;cursor:pointer; }
        .pc-category-toggle:hover { background:#e8eff6; }
        .pc-category-index { color:#ac8b54;font:10px ui-monospace,monospace; }
        .pc-category-name { flex:1;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase; }
        .pc-count { color:#8796a6;font:10px ui-monospace,monospace; }
        .pc-category-toggle > svg,.pc-provider-toggle > svg { color:#8695a6;transition:transform .18s ease; }
        .pc-category-toggle.open > svg,.pc-provider-toggle.open > svg { transform:rotate(180deg); }
        .pc-provider + .pc-provider { border-top:1px solid #eff1ef; }
        .pc-provider-toggle { width:100%;min-height:37px;display:flex;align-items:center;gap:9px;padding:0 17px 0 24px;border:0;background:#fbfcfa;color:#64758a;text-align:left;cursor:pointer; }
        .pc-provider-toggle:hover { background:#f5f7f6; }
        .pc-provider-mark { width:18px;height:18px;display:grid;place-items:center;border:1px solid #e4d7ba;border-radius:4px;background:#f8f4e9;color:#987743;font:700 9px Georgia,serif; }
        .pc-provider-name { flex:1;font-size:11px;font-weight:700; }
        .pc-provider-count { color:#a0a8ad;font-size:9px; }
        .pc-row { min-height:59px;padding:8px 17px 8px 25px;border-top:1px solid #f0f1ee;transition:background .15s ease; }
        .pc-row:hover { background:#fbfcfa; }
        .pc-item { min-width:0; }
        .pc-item strong { display:block;color:#2d405c;font-size:11.5px;font-weight:700;line-height:1.45; }
        .pc-barcode { display:flex;align-items:center;gap:5px;margin-top:3px;color:#9aa3a9;font:9px ui-monospace,monospace;letter-spacing:.025em; }
        .pc-spec { min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:4px; }
        .pc-tag { max-width:100%;padding:3px 7px;overflow:hidden;border:1px solid #e7e4d9;border-radius:4px;background:#f8f6ef;color:#89754f;font-size:8px;font-weight:800;white-space:nowrap;text-overflow:ellipsis; }
        .pc-spec small { max-width:100%;overflow:hidden;color:#9ba2a5;font-size:9px;white-space:nowrap;text-overflow:ellipsis; }
        .pc-price { text-align:right;color:#788696;font-size:10px;font-variant-numeric:tabular-nums;white-space:nowrap; }
        .pc-price i { display:none; }
        .pc-selling b { color:#315c96;font-size:11px;font-weight:800; }
        .pc-selling del { display:block;margin-top:2px;color:#adb3b5;font-size:9px; }
        .pc-edit { min-height:32px;display:flex;align-items:center;justify-content:center;gap:5px;padding:0 6px;border:1px solid transparent;border-radius:5px;background:transparent;color:#58749a;font-size:9px;font-weight:750;cursor:pointer; }
        .pc-edit:hover { border-color:#e5e9ed;background:#f2f6f9;color:#244e88; }
        .pc-empty { min-height:250px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#8d99a5;text-align:center; }
        .pc-empty div { width:40px;height:40px;display:grid;place-items:center;margin-bottom:12px;border:1px solid #e7e8e3;border-radius:9px;background:#f7f7f2;color:#8292a4; }
        .pc-empty strong { color:#41536b;font-size:13px; }
        .pc-empty span { margin-top:4px;font-size:11px; }
        .pc-empty button { margin-top:13px;padding:8px 12px;border:0;border-radius:5px;background:#edf2f7;color:#31598d;font-size:10px;font-weight:700;cursor:pointer; }
        .pc-footer { min-height:37px;display:flex;justify-content:space-between;align-items:center;padding:0 17px;border-top:1px solid #eceeeb;background:#fbfbf8;color:#9aa2a6;font-size:9px; }
        .pc-footer b { color:#65758a; }
        .pc-footer span:last-child { font-size:8px;font-weight:800;letter-spacing:.13em; }
        .pc-footer i { padding:0 4px;color:#ae915d;font-style:normal; }
        .pc-overlay { position:fixed;z-index:60;inset:0;display:grid;place-items:center;padding:16px;background:rgba(23,38,59,.32);backdrop-filter:blur(3px); }
        .pc-dialog { width:min(100%,530px);padding:22px;border:1px solid #e2e5e0;border-radius:10px;background:#fffefa;box-shadow:0 22px 70px rgba(20,37,61,.2);animation:pc-in .18s ease both; }
        .pc-dialog-head { display:flex;justify-content:space-between;margin-bottom:20px; }
        .pc-dialog-head span { color:#a28a5d;font-size:8px;font-weight:800;letter-spacing:.14em; }
        .pc-dialog-head h2 { margin:5px 0 0;color:#203551;font-size:20px;letter-spacing:-.04em; }
        .pc-dialog-head button { width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:6px;background:#f2f3ef;color:#788594;cursor:pointer; }
        .pc-dialog label { display:flex;flex-direction:column;gap:6px;margin-bottom:12px;color:#6d7a89;font-size:10px;font-weight:750; }
        .pc-dialog input { width:100%;min-width:0;min-height:40px;padding:0 10px;border:1px solid #e0e4e4;border-radius:5px;outline:none;background:#fbfcfa;color:#30435d;font-size:12px; }
        .pc-dialog input:focus { border-color:#9cb1cc;box-shadow:0 0 0 3px rgba(39,87,163,.08); }
        .pc-dialog-grid { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
        .pc-dialog-actions { display:flex;justify-content:flex-end;gap:8px;margin-top:19px; }
        .pc-dialog-actions button { min-height:39px;display:flex;align-items:center;gap:7px;padding:0 13px;border:1px solid #e2e5e1;border-radius:5px;background:#fffefa;color:#637287;font-size:10px;font-weight:750;cursor:pointer; }
        .pc-dialog-actions button:last-child { border-color:#244f91;background:#244f91;color:#fff; }
        .pc-demo-caption { margin:12px 0 0;color:#a0a7a8;font-size:9px;text-align:right; }
        @keyframes pc-in { from { opacity:0;transform:translateY(5px); } to { opacity:1;transform:translateY(0); } }
        @media (max-width:760px) {
          .pc-back { padding:8px 10px;font-size:11px; }
          .pc-topline { margin-top:-4px; }
          .pc-searchbar { flex-direction:column;gap:7px; }
          .pc-search { min-height:45px; }
          .pc-filter { min-height:38px;justify-content:space-between; }
          .pc-summary { min-height:38px;font-size:9px;gap:9px; }
          .pc-summary strong { display:block;margin:2px 0 0; }
          .pc-columns { display:none; }
          .pc-category-toggle { padding:0 11px; }
          .pc-provider-toggle { padding-left:15px;padding-right:11px; }
          .pc-row { grid-template-columns:minmax(0,1fr) auto 37px;column-gap:7px;row-gap:7px;padding:10px 10px 9px 15px; }
          .pc-item { grid-column:1;grid-row:1; }
          .pc-item strong { font-size:11px; }
          .pc-barcode { font-size:8px; }
          .pc-spec { grid-column:1;grid-row:2;flex-direction:row;align-items:center;gap:7px; }
          .pc-tag { flex:none;font-size:8px; }
          .pc-spec small { font-size:8px; }
          .pc-price { display:flex;flex-direction:column;align-items:flex-end;gap:2px;font-size:9px; }
          .pc-price i { display:block;color:#a0a8ac;font-size:8px;font-style:normal; }
          .pc-purchase { grid-column:2;grid-row:1;align-self:end;padding-right:1px; }
          .pc-selling { grid-column:2;grid-row:2; }
          .pc-selling b { font-size:10px; }
          .pc-selling del { font-size:8px; }
          .pc-edit { grid-column:3;grid-row:1 / span 2;align-self:center;min-width:37px;min-height:31px;margin-left:1px; }
          .pc-footer { padding:0 10px;font-size:8px; }
          .pc-footer span:last-child { font-size:7px; }
          .pc-notice { display:none; }
        }
        @media (max-width:370px) {
          .pc-summary { gap:6px; }
          .pc-spec small { max-width:112px; }
          .pc-edit span { display:none; }
          .pc-row { grid-template-columns:minmax(0,1fr) auto 29px; }
          .pc-edit { grid-column:3;min-width:29px; }
          .pc-footer span:last-child { letter-spacing:.07em; }
        }
        @media (prefers-reduced-motion:reduce) { .pc-page *, .pc-page *::before, .pc-page *::after { animation-duration:.01ms!important;transition-duration:.01ms!important; } }
      `}</style>
    </PremiumPageFrame>
  );
}
