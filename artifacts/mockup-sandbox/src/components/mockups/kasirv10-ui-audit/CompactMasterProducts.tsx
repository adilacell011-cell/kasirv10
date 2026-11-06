import { useMemo, useState } from 'react';
import { ArrowLeft, Barcode, Check, ChevronDown, Edit3, Search, X } from 'lucide-react';
import './_group.css';

type Product = {
  id: string;
  name: string;
  barcode: string;
  category: string;
  brand?: string;
  provider?: string;
  description: string;
  purchasePrice: number;
  sellingPrice: number;
  discountPrice: number;
};

const CATEGORIES = ['Pulsa', 'Paket Data', 'Voucher', 'Perdana'];

const QA_PRODUCTS: Product[] = [
  { id: 'qa-pulsa-001', name: 'Pulsa 10.000', barcode: 'QA-100001', category: 'Pulsa', brand: 'Telkomsel', description: 'Pulsa reguler', purchasePrice: 10200, sellingPrice: 12000, discountPrice: 0 },
  { id: 'qa-pulsa-002', name: 'Pulsa 25.000', barcode: 'QA-100002', category: 'Pulsa', brand: 'Telkomsel', description: 'Pulsa reguler', purchasePrice: 25100, sellingPrice: 27000, discountPrice: 0 },
  { id: 'qa-data-001', name: 'Paket Data 5 GB', barcode: 'QA-200001', category: 'Paket Data', brand: 'Indosat', description: 'Masa aktif 30 hari', purchasePrice: 28000, sellingPrice: 32000, discountPrice: 30000 },
  { id: 'qa-voucher-001', name: 'Voucher 20.000', barcode: 'QA-300001', category: 'Voucher', provider: 'PLN', brand: 'PLN', description: 'Token listrik prabayar', purchasePrice: 20100, sellingPrice: 22000, discountPrice: 0 },
  { id: 'qa-perdana-001', name: 'Kartu Perdana 4 GB', barcode: 'QA-400001', category: 'Perdana', provider: 'XL', brand: 'XL', description: 'Kartu perdana data', purchasePrice: 18000, sellingPrice: 22000, discountPrice: 0 },
  { id: 'demo-data-002', name: 'Paket Data Freedom Internet 12 GB — Masa Aktif 30 Hari', barcode: 'QA-200014', category: 'Paket Data', brand: 'Indosat', description: 'Kuota utama nasional, 30 hari', purchasePrice: 48500, sellingPrice: 55000, discountPrice: 52900 },
  { id: 'demo-data-003', name: 'Paket Data Combo Sakti 18 GB + Telepon 60 Menit', barcode: 'QA-200027', category: 'Paket Data', brand: 'Telkomsel', description: 'Kuota utama dan telepon, 30 hari', purchasePrice: 64500, sellingPrice: 72000, discountPrice: 0 },
  { id: 'demo-pulsa-003', name: 'Pulsa 50.000', barcode: 'QA-100003', category: 'Pulsa', brand: 'Telkomsel', description: 'Pulsa reguler', purchasePrice: 49900, sellingPrice: 52000, discountPrice: 0 },
  { id: 'demo-pulsa-004', name: 'Pulsa 100.000', barcode: 'QA-100004', category: 'Pulsa', brand: 'Telkomsel', description: 'Pulsa reguler', purchasePrice: 99800, sellingPrice: 103000, discountPrice: 0 },
  { id: 'demo-data-004', name: 'Paket Yellow 1 GB — Akses 24 Jam, Berlaku 7 Hari', barcode: 'QA-200031', category: 'Paket Data', brand: 'Indosat', description: 'Kuota utama, 7 hari', purchasePrice: 8000, sellingPrice: 10000, discountPrice: 0 },
  { id: 'demo-voucher-tsel-001', name: 'Voucher Data 1 GB — 3 Hari', barcode: 'QA-300021', category: 'Voucher', provider: 'Telkomsel', brand: 'Telkomsel', description: 'Kuota data, masa aktif 3 hari', purchasePrice: 9000, sellingPrice: 12000, discountPrice: 0 },
  { id: 'demo-voucher-tsel-002', name: 'Voucher Data 3 GB — 7 Hari', barcode: 'QA-300022', category: 'Voucher', provider: 'Telkomsel', brand: 'Telkomsel', description: 'Kuota data, masa aktif 7 hari', purchasePrice: 18000, sellingPrice: 22000, discountPrice: 0 },
  { id: 'demo-voucher-tsel-003', name: 'Voucher Data 12 GB — 30 Hari', barcode: 'QA-300023', category: 'Voucher', provider: 'Telkomsel', brand: 'Telkomsel', description: 'Kuota data, masa aktif 30 hari', purchasePrice: 62000, sellingPrice: 69000, discountPrice: 0 },
  { id: 'demo-voucher-002', name: 'Voucher 50.000', barcode: 'QA-300002', category: 'Voucher', provider: 'PLN', brand: 'PLN', description: 'Token listrik prabayar', purchasePrice: 50100, sellingPrice: 53000, discountPrice: 0 },
  { id: 'demo-perdana-002', name: 'Kartu Perdana XL Xtra Combo Flex S', barcode: 'QA-400012', category: 'Perdana', provider: 'XL', brand: 'XL', description: 'Kuota 3 GB + bonus aplikasi', purchasePrice: 26000, sellingPrice: 30000, discountPrice: 0 },
];

const rupiah = (amount: number) => `Rp ${amount.toLocaleString('id-ID')}`;

function displayProductName(product: Product) {
  const provider = product.provider || product.brand || '';
  if (product.category === 'Voucher' || product.category.includes('Perdana')) {
    if (product.name.toLowerCase().startsWith('voucher')) {
      return product.name.replace(/voucher/i, provider || 'Voucher').trim();
    }
    if (provider && !product.name.toLowerCase().includes(provider.toLowerCase())) {
      return `${provider} ${product.name}`.trim();
    }
  }
  return product.name;
}

export function CompactMasterProducts() {
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState(QA_PRODUCTS);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set(['Voucher']));
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => new Set(['Voucher::Telkomsel']));
  const [editing, setEditing] = useState<Product | null>(null);
  const [savedMessage, setSavedMessage] = useState('');
  const [editDraft, setEditDraft] = useState({ name: '', sellingPrice: '', purchasePrice: '' });

  const matchingProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return products.filter((product) =>
      !term ||
      product.name.toLowerCase().includes(term) ||
      product.barcode.toLowerCase().includes(term) ||
      product.brand?.toLowerCase().includes(term) ||
      product.provider?.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  const grouped = useMemo(() => CATEGORIES.map((category) => {
    const categoryProducts = matchingProducts.filter((product) => product.category === category);
    const brands = Array.from(new Set(categoryProducts.map((product) =>
      category === 'Voucher' || category.includes('Perdana')
        ? product.provider || product.brand || category
        : product.brand || category
    )));
    return {
      category,
      count: categoryProducts.length,
      groups: brands.map((brand) => ({
        brand,
        products: categoryProducts
          .filter((product) => (category === 'Voucher' || category.includes('Perdana')
            ? product.provider || product.brand || category
            : product.brand || category) === brand)
          .sort((a, b) => (a.discountPrice || a.sellingPrice) - (b.discountPrice || b.sellingPrice)),
      })),
    };
  }).filter((group) => group.count > 0), [matchingProducts]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const toggleProvider = (key: string) => {
    setExpandedProviders((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setEditDraft({
      name: displayProductName(product),
      sellingPrice: String(product.sellingPrice),
      purchasePrice: String(product.purchasePrice),
    });
  };

  const saveEdit = () => {
    if (!editing || !editDraft.name.trim()) return;
    const sellingPrice = Number(editDraft.sellingPrice);
    const purchasePrice = Number(editDraft.purchasePrice);
    if (!Number.isFinite(sellingPrice) || !Number.isFinite(purchasePrice)) return;
    setProducts((current) => current.map((product) => product.id === editing.id
      ? { ...product, name: editDraft.name.trim(), sellingPrice, purchasePrice }
      : product));
    setEditing(null);
    setSavedMessage('Perubahan tersimpan di pratinjau ini');
    window.setTimeout(() => setSavedMessage(''), 2400);
  };

  return (
    <main className="compact-master min-h-[100dvh] w-full overflow-y-auto">
      <div className="compact-shell mx-auto w-full">
        <header className="compact-header">
          <button className="compact-back" type="button" onClick={() => setSavedMessage('Master Produk Global')} aria-label="Kembali">
            <ArrowLeft size={17} strokeWidth={2} />
            <span>Kembali</span>
          </button>
          <div className="compact-heading">
            <div className="compact-overline"><span className="compact-mark">A</span> ALFATH PULSA <span className="compact-divider">/</span> KATALOG</div>
            <h1>Master Produk Global</h1>
            <p>Kelola referensi produk untuk seluruh cabang.</p>
          </div>
          <div className="compact-status"><span /> Sinkron lokal</div>
        </header>

        <section className="compact-controls" aria-label="Pencarian katalog">
          <div className="compact-search">
            <Search size={17} strokeWidth={1.8} />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Cari nama produk atau barcode"
              aria-label="Cari produk atau barcode"
            />
            {searchTerm && <button type="button" className="compact-clear" onClick={() => setSearchTerm('')} aria-label="Hapus pencarian"><X size={15} /></button>}
            {!searchTerm && <kbd>⌘ K</kbd>}
          </div>
          <button type="button" className="compact-filter" onClick={() => setSearchTerm('')}>
            Semua kategori <ChevronDown size={14} />
          </button>
        </section>

        <div className="compact-summary">
          <div className="summary-total"><strong>{matchingProducts.length}</strong><span>produk ditemukan</span></div>
          <span className="summary-separator" />
          <span className="summary-caption">Harga aktif <b>Jual setelah promo</b></span>
          {savedMessage && <span className="compact-toast"><Check size={13} />{savedMessage}</span>}
        </div>

        <section className="catalog-frame" aria-label="Daftar master produk">
          <div className="catalog-columns">
            <span>ITEM MASTER</span>
            <span>KATEGORI &amp; SPEK</span>
            <span className="col-right">MODAL</span>
            <span className="col-right">HARGA JUAL</span>
            <span className="col-action">AKSI</span>
          </div>
          {grouped.length ? grouped.map(({ category, count, groups }) => {
            const categoryOpen = searchTerm.trim().length > 0 || expandedCategories.has(category);
            return (
              <div className="category-section" key={category}>
                <button
                  type="button"
                  className={`category-band category-toggle ${categoryOpen ? 'is-open' : ''}`}
                  aria-expanded={categoryOpen}
                  onClick={() => toggleCategory(category)}
                >
                  <span className="category-name">{category}</span>
                  <span className="category-count">{String(count).padStart(2, '0')} item</span>
                  <ChevronDown className="accordion-chevron" size={15} />
                </button>
                {categoryOpen && (
                  <div className="category-panel">
                    {groups.map(({ brand, products: brandProducts }) => {
                      const providerKey = `${category}::${brand}`;
                      const providerOpen = searchTerm.trim().length > 0 || expandedProviders.has(providerKey);
                      return (
                        <div className="provider-section" key={providerKey}>
                          <button
                            type="button"
                            className={`brand-band provider-toggle ${providerOpen ? 'is-open' : ''}`}
                            aria-expanded={providerOpen}
                            onClick={() => toggleProvider(providerKey)}
                          >
                            <span className="brand-pip" />
                            <span className="provider-name">{brand}</span>
                            <span className="provider-count">{brandProducts.length} produk</span>
                            <ChevronDown className="accordion-chevron" size={14} />
                          </button>
                          {providerOpen && (
                            <div className="accordion-reveal">
                              {brandProducts.map((product) => (
                                <article className="product-row" key={product.id}>
                                  <div className="product-main">
                                    <p className="product-name">{displayProductName(product)}</p>
                                    <div className="product-barcode"><Barcode size={13} strokeWidth={1.7} /><span>{product.barcode}</span></div>
                                  </div>
                                  <div className="product-spec">
                                    <span className={`spec-pill ${category === 'Voucher' || category === 'Perdana' ? 'spec-violet' : ''}`}>{product.brand || product.provider || category}</span>
                                    <span className="spec-description">{product.description}</span>
                                  </div>
                                  <div className="product-purchase"><span className="mobile-label">Modal</span>{rupiah(product.purchasePrice)}</div>
                                  <div className="product-selling">
                                    <span className="mobile-label">Harga jual</span>
                                    {product.discountPrice > 0 ? (
                                      <><span className="sale-price">{rupiah(product.discountPrice)}</span><span className="original-price">{rupiah(product.sellingPrice)}</span></>
                                    ) : <span className="sale-price">{rupiah(product.sellingPrice)}</span>}
                                  </div>
                                  <button className="product-edit" type="button" onClick={() => openEdit(product)} aria-label={`Atur ${displayProductName(product)}`}>
                                    <Edit3 size={15} strokeWidth={1.8} /><span>Atur</span>
                                  </button>
                                </article>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }) : (
            <div className="catalog-empty">
              <div className="empty-icon"><Search size={18} /></div>
              <strong>Produk tidak ditemukan</strong>
              <span>Coba kata kunci atau barcode yang berbeda.</span>
              <button type="button" onClick={() => setSearchTerm('')}>Hapus pencarian</button>
            </div>
          )}
          <footer className="catalog-footer">
            <span>Menampilkan <b>{matchingProducts.length}</b> dari <b>{products.length}</b> produk</span>
            <span>MASTER DATA <i>•</i> ALFATH PULSA</span>
          </footer>
        </section>

        {editing && (
          <div className="edit-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditing(null);
          }}>
            <section className="edit-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-title">
              <div className="edit-dialog-top">
                <div><span className="edit-kicker">MASTER PRODUK</span><h2 id="edit-title">Atur produk</h2></div>
                <button type="button" onClick={() => setEditing(null)} aria-label="Tutup"><X size={18} /></button>
              </div>
              <label>Nama produk<input value={editDraft.name} onChange={(event) => setEditDraft((draft) => ({ ...draft, name: event.target.value }))} /></label>
              <div className="edit-price-grid">
                <label>Harga modal<input type="number" min="0" value={editDraft.purchasePrice} onChange={(event) => setEditDraft((draft) => ({ ...draft, purchasePrice: event.target.value }))} /></label>
                <label>Harga jual<input type="number" min="0" value={editDraft.sellingPrice} onChange={(event) => setEditDraft((draft) => ({ ...draft, sellingPrice: event.target.value }))} /></label>
              </div>
              <div className="edit-dialog-actions">
                <button type="button" className="edit-cancel" onClick={() => setEditing(null)}>Batal</button>
                <button type="button" className="edit-save" onClick={saveEdit}><Check size={15} />Simpan perubahan</button>
              </div>
            </section>
          </div>
        )}

        <style>{`
          .compact-master {
            --ink: #243653;
            --muted: #77869b;
            --line: #e4eaf1;
            --blue: #2857a7;
            --blue-soft: #eff4fb;
            background: #f4f6f8;
            color: var(--ink);
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            padding: 26px clamp(14px, 3.25vw, 44px) 38px;
          }
          .compact-shell { max-width: 1440px; }
          .compact-header { display: grid; grid-template-columns: 1fr minmax(280px, 2fr) 1fr; align-items: center; gap: 16px; margin-bottom: 24px; }
          .compact-back { display: inline-flex; align-items: center; gap: 8px; border: 0; background: transparent; color: #60718a; font-size: 13px; font-weight: 650; min-height: 42px; padding: 0 10px; margin-left: -10px; border-radius: 9px; cursor: pointer; transition: background .18s ease, color .18s ease; width: max-content; }
          .compact-back:hover { background: #e9eef5; color: #24477c; }
          .compact-heading { text-align: center; }
          .compact-overline { display: flex; align-items: center; justify-content: center; gap: 8px; color: #75849a; letter-spacing: .14em; font-size: 9px; font-weight: 800; }
          .compact-mark { display: grid; place-items: center; background: #2857a7; color: #fff; width: 18px; height: 18px; border-radius: 5px; font-family: Georgia, serif; font-size: 12px; letter-spacing: 0; }
          .compact-divider { color: #bdc7d3; }
          .compact-heading h1 { margin: 6px 0 2px; color: #203553; font-size: clamp(20px, 2vw, 25px); letter-spacing: -.045em; line-height: 1.18; font-weight: 750; }
          .compact-heading p { margin: 0; color: #8a97a8; font-size: 12px; }
          .compact-status { justify-self: end; display: inline-flex; align-items: center; gap: 7px; color: #77879a; font-size: 11px; font-weight: 600; }
          .compact-status span { width: 6px; height: 6px; border-radius: 50%; background: #6ca58d; box-shadow: 0 0 0 3px #e4eee9; }
          .compact-controls { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
          .compact-search { min-height: 46px; display: flex; flex: 1; align-items: center; gap: 11px; padding: 0 14px; border: 1px solid #e0e6ee; border-radius: 10px; background: #fff; color: #8190a4; box-shadow: 0 2px 5px rgba(35, 55, 82, .025); transition: border-color .18s ease, box-shadow .18s ease; }
          .compact-search:focus-within { border-color: #aabedc; box-shadow: 0 0 0 3px rgba(40, 87, 167, .08); }
          .compact-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: #263b5b; font: inherit; font-size: 13px; }
          .compact-search input::placeholder { color: #a0abba; }
          .compact-search kbd { flex: 0 0 auto; border: 1px solid #e7ebf1; border-radius: 5px; padding: 3px 6px; color: #9aa6b5; background: #f7f9fb; font: 10px ui-monospace, monospace; }
          .compact-clear { display: grid; place-items: center; border: 0; background: transparent; color: #8794a6; padding: 5px; border-radius: 5px; cursor: pointer; }
          .compact-filter { min-height: 46px; display: inline-flex; align-items: center; gap: 14px; padding: 0 14px; color: #5f7088; background: #fff; border: 1px solid #e0e6ee; border-radius: 10px; font-size: 12px; font-weight: 650; cursor: pointer; white-space: nowrap; transition: background .18s ease; }
          .compact-filter:hover { background: #f9fbfd; }
          .compact-summary { min-height: 34px; display: flex; align-items: center; gap: 14px; margin-bottom: 8px; padding: 0 2px; color: #8896a8; font-size: 11px; }
          .summary-total { display: flex; align-items: baseline; gap: 6px; }
          .summary-total strong { color: #355276; font-size: 14px; font-variant-numeric: tabular-nums; }
          .summary-separator { width: 1px; height: 14px; background: #dce3eb; }
          .summary-caption b { margin-left: 3px; color: #63758d; font-weight: 650; }
          .compact-toast { margin-left: auto; display: inline-flex; gap: 5px; align-items: center; color: #47836c; font-size: 11px; }
          .catalog-frame { overflow: hidden; border: 1px solid #e0e6ed; border-radius: 11px; background: #fff; box-shadow: 0 3px 12px rgba(27, 49, 79, .035); }
          .catalog-columns, .product-row { display: grid; grid-template-columns: minmax(250px, 1.65fr) minmax(150px, 1fr) minmax(116px, .72fr) minmax(130px, .82fr) 68px; column-gap: 18px; align-items: center; }
          .catalog-columns { min-height: 39px; padding: 0 20px; color: #8693a5; background: #fafbfd; border-bottom: 1px solid #e8edf2; font-size: 9px; font-weight: 800; letter-spacing: .11em; }
          .col-right { text-align: right; }
          .col-action { text-align: center; }
          .category-section + .category-section { border-top: 1px solid #e9eef3; }
          .category-band { min-height: 42px; display: flex; width: 100%; justify-content: space-between; align-items: center; gap: 10px; padding: 0 20px; background: #f2f6fc; color: #2a4e7e; border: 0; border-bottom: 1px solid #e3ebf5; text-align: left; cursor: pointer; }
          .category-toggle:hover { background: #eaf1fa; }
          .category-toggle .category-name { flex: 1; }
          .category-panel { background: #fff; }
          .provider-section + .provider-section { border-top: 1px solid #f1f4f7; }
          .category-name { font-size: 10px; font-weight: 800; letter-spacing: .105em; text-transform: uppercase; }
          .category-count { color: #8092aa; font: 10px ui-monospace, monospace; }
          .brand-band { min-height: 38px; display: flex; width: 100%; align-items: center; gap: 9px; padding: 0 20px; color: #708199; border: 0; background: #fbfcfe; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .015em; cursor: pointer; }
          .provider-toggle:hover { background: #f7f9fc; }
          .provider-name { flex: 1; }
          .provider-count { color: #9aa7b6; font-size: 9px; font-weight: 600; }
          .accordion-chevron { flex: 0 0 auto; color: #8a9bb1; transition: transform .18s ease; }
          .category-toggle.is-open .accordion-chevron, .provider-toggle.is-open .accordion-chevron { transform: rotate(180deg); }
          .accordion-reveal { animation: accordion-enter .18s ease both; transform-origin: top; }
          .brand-pip { width: 5px; height: 5px; border-radius: 2px; background: #9fb5d3; }
          .product-row { min-height: 61px; padding: 8px 20px; border-bottom: 1px solid #f0f3f6; transition: background .16s ease; }
          .product-row:last-child { border-bottom: 0; }
          .product-row:hover { background: #f9fbfe; }
          .product-main { min-width: 0; }
          .product-name { margin: 0; max-width: 100%; color: #2d405d; font-size: 12px; font-weight: 670; line-height: 1.38; }
          .product-barcode { display: flex; align-items: center; gap: 5px; margin-top: 3px; color: #98a4b3; font: 10px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .025em; }
          .product-spec { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; }
          .spec-pill { display: inline-flex; max-width: 100%; padding: 3px 7px; overflow: hidden; border: 1px solid #dfe9f6; border-radius: 5px; background: #f4f8fd; color: #5476a5; font-size: 9px; font-weight: 750; white-space: nowrap; text-overflow: ellipsis; }
          .spec-violet { background: #f7f5fb; color: #76678f; border-color: #ebe5f3; }
          .spec-description { max-width: 100%; overflow: hidden; color: #98a3b1; font-size: 10px; white-space: nowrap; text-overflow: ellipsis; }
          .product-purchase, .product-selling { text-align: right; color: #728198; font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
          .sale-price { color: #2e568d; font-weight: 750; }
          .original-price { display: block; margin-top: 2px; color: #a6b0bd; font-size: 9px; text-decoration: line-through; }
          .product-edit { display: inline-flex; align-items: center; justify-self: center; justify-content: center; gap: 5px; min-width: 54px; min-height: 36px; padding: 0 8px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: #5273a0; font-size: 10px; font-weight: 700; cursor: pointer; transition: color .16s ease, background .16s ease, border-color .16s ease; }
          .product-edit:hover { color: #244f8d; background: #edf3fb; border-color: #e2eaf5; }
          .mobile-label { display: none; }
          .catalog-empty { min-height: 260px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #8694a7; text-align: center; }
          .empty-icon { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 11px; margin-bottom: 12px; background: #f1f5f9; color: #758aa6; }
          .catalog-empty strong { color: #415775; font-size: 13px; }
          .catalog-empty span { margin-top: 4px; font-size: 11px; }
          .catalog-empty button { margin-top: 14px; padding: 8px 12px; color: #335e9d; background: #eff4fb; border: 0; border-radius: 7px; font-size: 11px; font-weight: 700; cursor: pointer; }
          .catalog-footer { min-height: 38px; display: flex; justify-content: space-between; align-items: center; padding: 0 20px; color: #97a3b2; background: #fbfcfd; border-top: 1px solid #edf1f5; font-size: 10px; }
          .catalog-footer b { color: #6c7d93; font-weight: 700; }
          .catalog-footer span:last-child { font-size: 8px; font-weight: 800; letter-spacing: .12em; }
          .catalog-footer i { padding: 0 4px; color: #9db3cf; font-style: normal; }
          .edit-backdrop { position: fixed; z-index: 20; inset: 0; display: grid; place-items: center; padding: 18px; background: rgba(24, 39, 61, .28); backdrop-filter: blur(3px); }
          .edit-dialog { width: min(100%, 450px); padding: 22px; border: 1px solid #e0e7f0; border-radius: 13px; background: #fff; box-shadow: 0 18px 54px rgba(20, 40, 69, .18); animation: compact-appear .18s ease both; }
          .edit-dialog-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
          .edit-kicker { color: #8191a7; font-size: 9px; font-weight: 800; letter-spacing: .13em; }
          .edit-dialog h2 { margin: 4px 0 0; color: #263b5a; font-size: 20px; letter-spacing: -.035em; }
          .edit-dialog-top button { display: grid; place-items: center; width: 34px; height: 34px; color: #78889d; background: #f4f6f9; border: 0; border-radius: 8px; cursor: pointer; }
          .edit-dialog label { display: flex; flex-direction: column; gap: 7px; margin-bottom: 14px; color: #65778f; font-size: 11px; font-weight: 700; }
          .edit-dialog input { width: 100%; min-height: 42px; padding: 0 11px; outline: 0; border: 1px solid #e0e6ee; border-radius: 7px; background: #fbfcfd; color: #2e435f; font: inherit; font-size: 12px; }
          .edit-dialog input:focus { border-color: #a9bddb; box-shadow: 0 0 0 3px rgba(40, 87, 167, .08); }
          .edit-price-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          .edit-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 22px; }
          .edit-dialog-actions button { min-height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 14px; border-radius: 7px; font-size: 11px; font-weight: 700; cursor: pointer; }
          .edit-cancel { color: #63748b; background: #fff; border: 1px solid #e1e7ee; }
          .edit-save { color: #fff; background: #2857a7; border: 1px solid #2857a7; }
          @keyframes compact-appear { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes accordion-enter { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
          @media (max-width: 700px) {
            .compact-master { padding: 16px 12px calc(24px + env(safe-area-inset-bottom, 0px)); }
            .compact-header { grid-template-columns: 1fr auto; gap: 6px 8px; margin-bottom: 18px; }
            .compact-back { grid-column: 1; grid-row: 1; min-height: 38px; font-size: 12px; }
            .compact-status { grid-column: 2; grid-row: 1; font-size: 10px; }
            .compact-heading { grid-column: 1 / -1; grid-row: 2; text-align: left; padding: 3px 0 0; }
            .compact-overline { justify-content: flex-start; font-size: 8px; }
            .compact-heading h1 { margin-top: 7px; font-size: 21px; }
            .compact-heading p { font-size: 11px; }
            .compact-controls { align-items: stretch; flex-direction: column; gap: 8px; }
            .compact-search { min-height: 46px; }
            .compact-filter { min-height: 38px; justify-content: space-between; }
            .compact-summary { margin: 0 0 7px; gap: 10px; font-size: 10px; }
            .summary-caption { margin-left: auto; text-align: right; }
            .summary-caption b { display: block; margin: 2px 0 0; }
            .catalog-frame { border-radius: 9px; }
            .catalog-columns { display: none; }
            .category-band { min-height: 42px; padding: 0 12px; }
            .brand-band { min-height: 40px; padding: 0 12px; }
            .product-row { position: relative; grid-template-columns: minmax(0, 1fr) auto; column-gap: 8px; row-gap: 7px; align-items: start; padding: 11px 12px 10px; }
            .product-main { grid-column: 1; grid-row: 1; padding-right: 2px; }
            .product-name { font-size: 12px; line-height: 1.42; }
            .product-barcode { font-size: 9px; }
            .product-spec { grid-column: 1; grid-row: 2; flex-direction: row; align-items: center; gap: 7px; min-width: 0; }
            .spec-pill { flex: 0 0 auto; font-size: 8px; padding: 3px 6px; }
            .spec-description { font-size: 9px; }
            .product-purchase, .product-selling { grid-row: 3; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; text-align: left; font-size: 10px; }
            .product-purchase { grid-column: 1; padding-left: 1px; }
            .product-selling { grid-column: 2; justify-self: end; min-width: 90px; }
            .mobile-label { display: block; color: #9aa6b4; font-size: 8px; font-weight: 700; letter-spacing: .055em; text-transform: uppercase; }
            .sale-price { font-size: 11px; }
            .original-price { margin-top: -2px; }
            .product-edit { position: absolute; top: 8px; right: 8px; min-width: 38px; width: 38px; min-height: 36px; color: #6f84a0; }
            .product-edit span { display: none; }
            .product-main { padding-right: 42px; }
            .catalog-footer { min-height: 36px; padding: 0 12px; font-size: 9px; }
            .catalog-footer span:last-child { font-size: 7px; }
            .edit-dialog { padding: 18px; }
          }
          @media (min-width: 701px) and (max-width: 950px) {
            .compact-master { padding: 24px 20px 32px; }
            .compact-header { grid-template-columns: 1fr 2fr 1fr; margin-bottom: 20px; }
            .catalog-columns, .product-row { grid-template-columns: minmax(200px, 1.45fr) minmax(135px, .9fr) minmax(95px, .66fr) minmax(112px, .8fr) 55px; column-gap: 10px; }
            .catalog-columns, .product-row { padding-left: 14px; padding-right: 14px; }
            .brand-band, .category-band { padding-left: 14px; padding-right: 14px; }
            .product-name { font-size: 11px; }
            .product-purchase, .product-selling { font-size: 10px; }
            .spec-description { font-size: 9px; }
          }
          @media (prefers-reduced-motion: reduce) {
            .compact-master *, .compact-master *::before, .compact-master *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
          }
        `}</style>
      </div>
    </main>
  );
}
