import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft, Barcode, Camera, Check, ChevronDown, Eye, Info, Plus, Sparkles, X,
} from 'lucide-react';
import { PremiumPageFrame } from './_shared/PremiumPageFrame';
import './_shared/tokens.css';

const CATEGORY_OPTIONS = ['Pulsa', 'Paket Data', 'Voucher', 'Perdana', 'Aksesoris', 'Handphone', 'Parfum'];
const BRAND_OPTIONS: Record<string, string[]> = {
  Pulsa: ['Telkomsel', 'Indosat', 'XL', 'Tri', 'Smartfren'],
  'Paket Data': ['Telkomsel', 'Indosat', 'XL', 'Tri', 'Smartfren'],
  Voucher: ['Telkomsel', 'Indosat', 'PLN', 'Garena'],
  Perdana: ['Telkomsel', 'Indosat', 'XL', 'Tri'],
  Aksesoris: ['Vivan', 'Robot', 'Baseus'],
  Handphone: ['Samsung', 'Xiaomi', 'OPPO', 'Infinix'],
  Parfum: ['HMNS', 'Saff & Co.', 'Mykonos'],
};
const rupiah = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;

type ChoiceProps = {
  label: string;
  value: string;
  placeholder: string;
  options: string[];
  open: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  onClose: () => void;
  help?: string;
};

function SearchChoice({ label, value, placeholder, options, open, onToggle, onChange, onClose, help }: ChoiceProps) {
  const matches = options.filter((option) => option.toLowerCase().includes(value.toLowerCase()));
  return <div className="pa-choice">
    <label className="pa-label">{label}</label>
    <div className={`pa-choice-box ${open ? 'is-open' : ''}`}>
      <input value={value} onFocus={() => { if (!open) onToggle(); }} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={label} />
      <button type="button" onClick={onToggle} aria-label={`Pilih ${label}`}><ChevronDown size={15} /></button>
      {open && <div className="pa-options">
        <div className="pa-options-caption">{matches.length ? 'PILIHAN TERSEDIA' : 'TAMBAHKAN PILIHAN BARU'}</div>
        {matches.map((option) => <button type="button" key={option} onClick={() => { onChange(option); onClose(); }}><span>{option}</span>{value === option && <Check size={14} />}</button>)}
        {value.trim() && !options.some((option) => option.toLowerCase() === value.trim().toLowerCase()) && <button type="button" className="pa-create" onClick={() => onClose()}><Plus size={14} /><span>Gunakan “{value.trim()}” sebagai pilihan baru</span></button>}
        {!value.trim() && <p>Ketik untuk mencari atau membuat pilihan baru.</p>}
      </div>}
    </div>
    {help && <small className="pa-field-help">{help}</small>}
  </div>;
}

export function AddProduct() {
  const [category, setCategory] = useState('Paket Data');
  const [brand, setBrand] = useState('Indosat');
  const [subCategory, setSubCategory] = useState('');
  const [perfumeSize, setPerfumeSize] = useState('');
  const [variant, setVariant] = useState('Freedom Internet 12 GB · 30 Hari');
  const [barcode, setBarcode] = useState('');
  const [description, setDescription] = useState('Kuota utama nasional, masa aktif 30 hari.');
  const [purchase, setPurchase] = useState('48500');
  const [selling, setSelling] = useState('55000');
  const [promo, setPromo] = useState('52900');
  const [bonus, setBonus] = useState('500');
  const [minimumStock, setMinimumStock] = useState('3');
  const [expiry, setExpiry] = useState('2026-12-31');
  const [allBranches, setAllBranches] = useState(true);
  const [branches, setBranches] = useState(['cibubur']);
  const [openChoice, setOpenChoice] = useState('');
  const [notice, setNotice] = useState('');

  const isProviderCategory = category === 'Voucher' || category.includes('Perdana');
  const hasSubcategory = ['Aksesoris', 'Handphone', 'Parfum'].includes(category);
  const profit = Math.max(0, (Number(selling) || 0) - (Number(purchase) || 0));
  const margin = Number(selling) ? (profit / Number(selling)) * 100 : 0;
  const completeName = useMemo(() => {
    const parts = [isProviderCategory ? brand : '', subCategory, variant, category === 'Parfum' ? perfumeSize : ''].filter(Boolean);
    return parts.join(' · ');
  }, [brand, category, isProviderCategory, perfumeSize, subCategory, variant]);
  const setChoice = (key: string, setter: (value: string) => void, value: string) => {
    setter(value);
    setOpenChoice(key);
  };
  const generateBarcode = () => setBarcode(`ALF-${Math.floor(100000 + Math.random() * 899999)}`);
  const chooseBranch = (id: string) => setBranches((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice('Master produk tersimpan pada pratinjau lokal.');
    window.setTimeout(() => setNotice(''), 3200);
  };

  return <PremiumPageFrame
    section="Katalog Produk"
    title="Tambah Produk"
    description="Lengkapi identitas, harga, dan cakupan produk sebelum dipublikasikan."
    action={<button className="pa-back" type="button" onClick={() => setNotice('Perubahan belum dikirim; ini hanya pratinjau.')}><ArrowLeft size={15} />Kembali</button>}
  >
    <div className="pa-page">
      <div className="pa-context"><span>MASTER DATA <i>/</i> PRODUK BARU</span><span className="pa-context-badge"><span /> Draf lokal</span></div>
      <form className="pa-form" onSubmit={submit}>
        <div className="pa-steps" aria-label="Tahapan pengisian">
          <div className="pa-step current"><b>01</b><span>Identitas</span></div><span className="pa-step-line" />
          <div className="pa-step"><b>02</b><span>Harga &amp; stok</span></div><span className="pa-step-line" />
          <div className="pa-step"><b>03</b><span>Cakupan</span></div>
        </div>
        <div className="pa-layout">
          <div className="pa-main">
            <section className="pa-section">
              <div className="pa-section-heading"><div className="pa-section-index">01</div><div><h2>Identitas produk</h2><p>Susun kategori dan varian agar mudah ditemukan kasir.</p></div></div>
              <div className="pa-fields">
                <SearchChoice label="Kategori produk" value={category} placeholder="Ketik atau pilih kategori" options={CATEGORY_OPTIONS} open={openChoice === 'category'} onToggle={() => setOpenChoice(openChoice === 'category' ? '' : 'category')} onChange={(value) => { setCategory(value); setBrand(''); setSubCategory(''); }} onClose={() => setOpenChoice('')} help="Ketik nama kategori baru bila belum tersedia." />
                <SearchChoice label={isProviderCategory ? 'Provider / operator' : 'Merek (brand)'} value={brand} placeholder={isProviderCategory ? 'Pilih atau ketik provider' : 'Ketik atau pilih merek'} options={BRAND_OPTIONS[category] || []} open={openChoice === 'brand'} onToggle={() => setOpenChoice(openChoice === 'brand' ? '' : 'brand')} onChange={(value) => setChoice('brand', setBrand, value)} onClose={() => setOpenChoice('')} help="Cari dari daftar atau gunakan nilai yang diketik." />
                {hasSubcategory && <SearchChoice label={category === 'Parfum' ? 'Jenis parfum' : category === 'Handphone' ? 'Tipe / model HP' : 'Model / sub-kategori'} value={subCategory} placeholder={category === 'Parfum' ? 'Pilih jenis, contoh EDP' : 'Ketik atau pilih model'} options={category === 'Parfum' ? ['EDP', 'EDT', 'Extrait'] : category === 'Handphone' ? ['Galaxy A15', 'Redmi Note 13', 'Hot 40'] : ['Kabel data', 'Adaptor', 'Audio']} open={openChoice === 'subcategory'} onToggle={() => setOpenChoice(openChoice === 'subcategory' ? '' : 'subcategory')} onChange={(value) => setChoice('subcategory', setSubCategory, value)} onClose={() => setOpenChoice('')} />}
                {category === 'Parfum' && <div className="pa-field"><label className="pa-label" htmlFor="pa-size">Ukuran / volume</label><input id="pa-size" value={perfumeSize} onChange={(event) => setPerfumeSize(event.target.value)} placeholder="Contoh: 30 ml" /></div>}
                <div className="pa-field pa-full">
                  <label className="pa-label" htmlFor="pa-variant">{category === 'Voucher' || category.includes('Perdana') ? 'Nominal / kuota' : category === 'Handphone' ? 'Varian (RAM / storage / warna)' : category === 'Parfum' ? 'Aroma / varian' : category === 'Aksesoris' ? 'Varian / tipe' : 'Nama produk'} <em>*</em></label>
                  <input id="pa-variant" required value={variant} onChange={(event) => setVariant(event.target.value)} placeholder={isProviderCategory ? 'Contoh: 10 GB · 30 Hari atau 25.000' : 'Masukkan nama / varian produk'} />
                  <div className="pa-preview-name"><Sparkles size={14} /><div><small>NAMA PRODUK TERSIMPAN</small><strong>{completeName || '—'}</strong></div></div>
                </div>
                <div className="pa-field pa-full">
                  <label className="pa-label" htmlFor="pa-barcode">Barcode / SN master produk <small>Opsional · kosongkan untuk otomatis</small></label>
                  <div className="pa-barcode-field"><Barcode size={16} /><input id="pa-barcode" value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Ketik atau scan barcode" /><button type="button" onClick={generateBarcode} title="Buat barcode contoh"><Sparkles size={15} /><span>Otomatis</span></button><button type="button" onClick={() => setNotice('Aksi kamera hanya demonstrasi pada pratinjau ini.')} title="Aksi kamera demonstrasi"><Camera size={16} /></button></div>
                </div>
                <div className="pa-field pa-full"><label className="pa-label" htmlFor="pa-description">Deskripsi operasional <span>(opsional)</span></label><textarea id="pa-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Catatan klaim, spesifikasi, atau informasi untuk staf" /></div>
              </div>
            </section>
            <section className="pa-section pa-pricing-section">
              <div className="pa-section-heading"><div className="pa-section-index">02</div><div><h2>Harga &amp; pengendalian</h2><p>Angka ini membantu staf membaca nilai jual dengan cepat.</p></div></div>
              <div className="pa-price-grid">
                <div className="pa-field"><label className="pa-label" htmlFor="pa-purchase">Harga modal <em>*</em></label><div className="pa-money"><span>Rp</span><input id="pa-purchase" type="number" min="0" required value={purchase} onChange={(event) => setPurchase(event.target.value)} /></div></div>
                <div className="pa-field"><label className="pa-label" htmlFor="pa-selling">Harga jual <em>*</em></label><div className="pa-money pa-money-blue"><span>Rp</span><input id="pa-selling" type="number" min="0" required value={selling} onChange={(event) => setSelling(event.target.value)} /></div></div>
                <div className="pa-field"><label className="pa-label" htmlFor="pa-promo">Harga promo <span>(opsional)</span></label><div className="pa-money pa-money-gold"><span>Rp</span><input id="pa-promo" type="number" min="0" value={promo} onChange={(event) => setPromo(event.target.value)} placeholder="—" /></div></div>
                <div className="pa-field"><label className="pa-label" htmlFor="pa-bonus">Bonus kasir / item <span>(opsional)</span></label><div className="pa-money pa-money-blue"><span>Rp</span><input id="pa-bonus" type="number" min="0" value={bonus} onChange={(event) => setBonus(event.target.value)} placeholder="0" /></div></div>
                <div className="pa-profit pa-full"><div><small>ESTIMASI LABA / ITEM</small><strong>{rupiah(profit)}</strong><span>{margin.toFixed(1)}% dari harga jual</span></div><div className="pa-profit-note"><Info size={14} /> Perhitungan sederhana dari harga modal dan harga jual.</div></div>
                <div className="pa-field"><label className="pa-label" htmlFor="pa-stock">Stok minimal aman</label><div className="pa-stock-field"><input id="pa-stock" type="number" min="0" value={minimumStock} onChange={(event) => setMinimumStock(event.target.value)} /><span>unit · peringatan stok</span></div></div>
                {isProviderCategory && <div className="pa-field"><label className="pa-label" htmlFor="pa-expiry">Masa aktif / kadaluarsa</label><input id="pa-expiry" type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} /></div>}
              </div>
            </section>
          </div>
          <aside className="pa-side">
            <section className="pa-section pa-visibility">
              <div className="pa-section-heading"><div className="pa-section-index"><Eye size={15} /></div><div><h2>Visibilitas cabang</h2><p>Tentukan cabang yang dapat melihat produk ini.</p></div></div>
              <label className={`pa-branch-option ${allBranches ? 'selected' : ''}`}><input type="checkbox" checked={allBranches} onChange={(event) => setAllBranches(event.target.checked)} /><span className="pa-check"><Check size={12} /></span><span><b>Semua cabang toko</b><small>Produk tersedia untuk seluruh tim.</small></span></label>
              {!allBranches && <div className="pa-branch-list premium-reveal">{[
                { id: 'cibubur', name: 'Alfath Cibubur', location: 'Jakarta Timur' },
                { id: 'jatiasih', name: 'Alfath Jatiasih', location: 'Bekasi' },
                { id: 'cileungsi', name: 'Alfath Cileungsi', location: 'Bogor' },
              ].map((branch) => <label key={branch.id} className={`pa-branch-option pa-branch-small ${branches.includes(branch.id) ? 'selected' : ''}`}><input type="checkbox" checked={branches.includes(branch.id)} onChange={() => chooseBranch(branch.id)} /><span className="pa-check"><Check size={12} /></span><span><b>{branch.name}</b><small>{branch.location}</small></span></label>)}</div>}
              <div className="pa-branch-note"><Info size={14} /> Cabang terpilih mengatur visibilitas saja.</div>
            </section>
            <section className="pa-side-preview">
              <div className="pa-preview-heading"><span>PRATINJAU ITEM</span><span>01</span></div>
              <div className="pa-preview-card"><div className="pa-preview-icon"><Barcode size={20} /></div><div className="pa-preview-category">{category || 'Kategori produk'}</div><strong>{completeName || 'Nama varian produk'}</strong><small>{barcode || 'Barcode dibuat otomatis saat diterbitkan'}</small><div className="pa-preview-price"><span>Harga jual</span><b>{rupiah(Number(promo) || Number(selling) || 0)}</b></div></div>
              <p>Contoh tampilan ringkas yang dibaca staf di katalog.</p>
            </section>
            <div className="pa-local-note"><span /> Semua isian tersimpan sementara di pratinjau ini.</div>
          </aside>
        </div>
        <div className="pa-submit-bar"><div className="pa-submit-note"><span className="pa-required">*</span> Wajib diisi <span className="pa-dot">·</span><span>Periksa nama dan harga sebelum lanjut.</span></div><button type="submit"><Check size={16} />Simpan &amp; publikasikan <span>→</span></button></div>
        {notice && <div className="pa-toast" role="status"><Check size={15} />{notice}<button type="button" onClick={() => setNotice('')} aria-label="Tutup pesan"><X size={14} /></button></div>}
      </form>
    </div>
    <style>{`
      .premium-page { --premium-blue:#2757a3; --premium-blue-deep:#183d76; --premium-navy:#1d304c; --premium-gold:#ad8b53; --premium-gold-soft:#f4efdf; --premium-paper:#f3f4f2; --premium-surface:#fffefa; --premium-ink:#29384d; --premium-muted:#7d8998; --premium-line:#e4e6e3; font-family:"Trebuchet MS",ui-sans-serif,system-ui,sans-serif; }
      .pa-page { color:#29384d; }
      .pa-back { display:flex;align-items:center;gap:8px;padding:9px 13px;border:1px solid #e0e4e5;border-radius:7px;color:#52647c;background:#fbfcfa;font-size:12px;font-weight:700;cursor:pointer; }
      .pa-back:hover { border-color:#c6d2e1;color:#2757a3; }
      .pa-context { display:flex;justify-content:space-between;align-items:center;margin:-8px 0 15px;color:#98a0a7;font-size:9px;font-weight:800;letter-spacing:.14em; }
      .pa-context i { padding:0 6px;color:#b49660;font-style:normal; }
      .pa-context-badge { display:flex;align-items:center;gap:7px;letter-spacing:.02em;font-size:10px;font-weight:650; }
      .pa-context-badge > span,.pa-local-note > span { width:6px;height:6px;border-radius:50%;background:#7da28f;box-shadow:0 0 0 3px #e7eee8; }
      .pa-form { position:relative;padding-bottom:58px; }
      .pa-steps { display:flex;align-items:center;gap:11px;min-height:46px;margin-bottom:12px;padding:0 4px; }
      .pa-step { display:flex;align-items:center;gap:7px;color:#a0a7aa;white-space:nowrap; }
      .pa-step b { width:23px;height:23px;display:grid;place-items:center;border:1px solid #e0e4e2;border-radius:50%;font:9px ui-monospace,monospace; }
      .pa-step span { font-size:10px;font-weight:700; }
      .pa-step.current { color:#31598e; }
      .pa-step.current b { border-color:#31598e;background:#31598e;color:#fff; }
      .pa-step-line { width:30px;height:1px;background:#dfe3e0; }
      .pa-layout { display:grid;grid-template-columns:minmax(0,1fr) 310px;align-items:start;gap:16px; }
      .pa-main { display:flex;flex-direction:column;gap:13px;min-width:0; }
      .pa-section { padding:20px;border:1px solid #e1e5e2;border-radius:8px;background:#fffefa;box-shadow:0 4px 16px rgba(28,43,60,.025); }
      .pa-section-heading { display:flex;align-items:flex-start;gap:11px;margin-bottom:18px; }
      .pa-section-index { width:27px;height:27px;flex:none;display:grid;place-items:center;border:1px solid #e5dbc4;border-radius:6px;background:#faf7ef;color:#987d4c;font:10px ui-monospace,monospace; }
      .pa-section-heading h2 { margin:0;color:#263954;font-size:14px;font-weight:750;letter-spacing:-.02em; }
      .pa-section-heading p { margin:4px 0 0;color:#919ba2;font-size:10px;line-height:1.5; }
      .pa-fields { display:grid;grid-template-columns:1fr 1fr;gap:15px 14px; }
      .pa-field,.pa-choice { min-width:0; }
      .pa-full { grid-column:1 / -1; }
      .pa-label { display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px;color:#68778a;font-size:9px;font-weight:800;letter-spacing:.055em;text-transform:uppercase; }
      .pa-label em,.pa-required { color:#aa6a56;font-style:normal; }
      .pa-label span,.pa-label small { color:#a4abad;font-size:8px;font-weight:550;letter-spacing:0;text-transform:none; }
      .pa-field > input,.pa-field textarea,.pa-choice-box,.pa-money,.pa-stock-field { width:100%;min-height:41px;border:1px solid #e1e5e4;border-radius:5px;background:#fbfcfa;color:#30425a;font-size:11px; }
      .pa-field > input,.pa-field textarea { padding:0 11px;outline:none; }
      .pa-field textarea { min-height:67px;padding:10px 11px;resize:vertical;line-height:1.5; }
      .pa-field input:focus,.pa-field textarea:focus,.pa-choice-box:focus-within { border-color:#9cb2ce;box-shadow:0 0 0 3px rgba(39,87,163,.07); }
      .pa-field input::placeholder,.pa-field textarea::placeholder,.pa-choice-box input::placeholder { color:#a9b1b4; }
      .pa-field-help { display:block;margin-top:5px;color:#a0a8aa;font-size:8px; }
      .pa-choice { position:relative; }
      .pa-choice-box { display:flex;align-items:center;gap:6px;padding:0 7px 0 10px; }
      .pa-choice-box.is-open { position:relative;z-index:10; }
      .pa-choice-box input { width:100%;min-width:0;height:38px;border:0;outline:0;background:transparent;color:#30425a;font-size:11px; }
      .pa-choice-box > button { flex:none;width:27px;height:27px;display:grid;place-items:center;border:0;border-radius:4px;background:#f1f3f1;color:#788796;cursor:pointer; }
      .pa-options { position:absolute;z-index:20;top:calc(100% + 5px);left:-1px;right:-1px;max-height:225px;overflow:auto;padding:5px;border:1px solid #dfe4e2;border-radius:6px;background:#fffefa;box-shadow:0 12px 28px rgba(28,43,60,.14);animation:pa-in .14s ease both; }
      .pa-options-caption { padding:7px 8px 6px;color:#a0a8a9;font-size:8px;font-weight:800;letter-spacing:.12em; }
      .pa-options > button { width:100%;min-height:34px;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 8px;border:0;border-radius:4px;background:transparent;color:#52647b;text-align:left;font-size:10px;cursor:pointer; }
      .pa-options > button:hover { background:#f1f5f8;color:#28548f; }
      .pa-options > button > svg { color:#517ca7; }
      .pa-options > p { margin:4px 8px 8px;color:#929da4;font-size:9px; }
      .pa-options .pa-create { justify-content:flex-start;background:#f7f4eb;color:#8a7042; }
      .pa-preview-name { display:flex;align-items:flex-start;gap:9px;margin-top:8px;padding:9px 10px;border:1px solid #e4eaf0;border-radius:5px;background:#f5f8fb;color:#426c9c; }
      .pa-preview-name > svg { flex:none;margin-top:1px; }
      .pa-preview-name div { min-width:0;display:flex;flex-direction:column;gap:4px; }
      .pa-preview-name small { color:#8195aa;font-size:7px;font-weight:800;letter-spacing:.12em; }
      .pa-preview-name strong { overflow-wrap:anywhere;color:#3b506b;font-size:10px;line-height:1.4; }
      .pa-barcode-field { min-height:41px;display:flex;align-items:center;gap:8px;padding:0 6px 0 10px;border:1px solid #d9e2e9;border-radius:5px;background:#f8fafb;color:#8191a2; }
      .pa-barcode-field input { width:100%;min-width:0;height:38px;border:0;outline:0;background:transparent;color:#344962;font:10px ui-monospace,monospace;letter-spacing:.03em; }
      .pa-barcode-field button { min-height:28px;display:flex;align-items:center;justify-content:center;gap:5px;padding:0 7px;border:1px solid #e1e6e7;border-radius:4px;background:#fffefa;color:#687b90;font-size:8px;font-weight:750;cursor:pointer; }
      .pa-barcode-field button:first-of-type { color:#315b93; }
      .pa-barcode-field button:hover { border-color:#bacadc;background:#f4f7f9; }
      .pa-pricing-section { padding-bottom:17px; }
      .pa-price-grid { display:grid;grid-template-columns:1fr 1fr;gap:14px; }
      .pa-money { display:flex;align-items:center;overflow:hidden; }
      .pa-money > span { padding:0 10px;color:#a0a8aa;font-size:9px;font-weight:750; }
      .pa-money input { width:100%;height:39px;min-width:0;padding:0 9px 0 0;border:0;outline:0;background:transparent;color:#4d5e72;font-size:11px;font-weight:700;text-align:right;font-variant-numeric:tabular-nums; }
      .pa-money-blue { border-color:#d8e2ec;background:#f7f9fb; }
      .pa-money-blue input { color:#315b93; }
      .pa-money-gold { border-color:#e8e0cf;background:#fbf9f3; }
      .pa-money-gold input { color:#927544; }
      .pa-profit { min-height:68px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border:1px solid #e2e8e6;border-radius:6px;background:linear-gradient(110deg,#f6f8f5,#fbfaf5); }
      .pa-profit > div:first-child { display:grid;grid-template-columns:auto auto;align-items:baseline;column-gap:8px; }
      .pa-profit small { grid-column:1 / -1;color:#89968f;font-size:7px;font-weight:800;letter-spacing:.13em; }
      .pa-profit strong { margin-top:5px;color:#47765f;font-size:18px;letter-spacing:-.04em;font-variant-numeric:tabular-nums; }
      .pa-profit > div:first-child > span { color:#7a9584;font-size:9px; }
      .pa-profit-note { display:flex;align-items:center;gap:6px;color:#9aa49f;font-size:8px;line-height:1.4;text-align:right; }
      .pa-profit-note svg { flex:none;color:#a79162; }
      .pa-stock-field { display:flex;align-items:center;padding-right:9px; }
      .pa-stock-field input { width:60px;height:39px;padding-left:11px;border:0;outline:0;background:transparent;color:#3c526d;font-size:12px;font-weight:750; }
      .pa-stock-field span { margin-left:auto;color:#9ba4a7;font-size:8px; }
      .pa-side { display:flex;flex-direction:column;gap:12px; }
      .pa-visibility { padding:17px; }
      .pa-visibility .pa-section-heading { margin-bottom:14px; }
      .pa-visibility .pa-section-heading h2 { font-size:12px; }
      .pa-visibility .pa-section-heading p { font-size:9px; }
      .pa-branch-option { display:flex;align-items:center;gap:9px;min-height:56px;padding:9px;border:1px solid #e4e7e4;border-radius:5px;background:#fffefa;cursor:pointer; }
      .pa-branch-option.selected { border-color:#cbd9e7;background:#f6f9fb; }
      .pa-branch-option input { position:absolute;width:1px;height:1px;opacity:0; }
      .pa-check { width:16px;height:16px;flex:none;display:grid;place-items:center;border:1px solid #d2d9d9;border-radius:3px;background:#fff;color:transparent; }
      .pa-branch-option input:checked + .pa-check { border-color:#365f95;background:#365f95;color:white; }
      .pa-branch-option > span:last-child { display:flex;min-width:0;flex-direction:column;gap:3px; }
      .pa-branch-option b { color:#53647a;font-size:9px; }
      .pa-branch-option small { color:#a0a8a9;font-size:8px; }
      .pa-branch-list { display:flex;flex-direction:column;gap:6px;margin-top:7px; }
      .pa-branch-small { min-height:48px; }
      .pa-branch-note { display:flex;gap:7px;margin-top:11px;color:#9ba4a4;font-size:8px;line-height:1.5; }
      .pa-branch-note svg { flex:none;color:#a28a59; }
      .pa-side-preview { padding:15px;border:1px solid #e3e5e1;border-radius:7px;background:#f7f7f2; }
      .pa-preview-heading { display:flex;justify-content:space-between;color:#9ca3a1;font-size:8px;font-weight:800;letter-spacing:.13em; }
      .pa-preview-heading span:last-child { color:#b1935b;font-family:ui-monospace,monospace; }
      .pa-preview-card { margin-top:11px;padding:14px;border:1px solid #e4e6e1;border-radius:6px;background:#fffefa;box-shadow:0 4px 12px rgba(28,43,60,.04); }
      .pa-preview-icon { width:31px;height:31px;display:grid;place-items:center;margin-bottom:12px;border:1px solid #e6dfd0;border-radius:5px;background:#f8f5ed;color:#937b50; }
      .pa-preview-category { color:#9a865e;font-size:8px;font-weight:800;letter-spacing:.1em;text-transform:uppercase; }
      .pa-preview-card > strong { display:block;margin-top:5px;color:#2c405b;font-size:11px;line-height:1.5;overflow-wrap:anywhere; }
      .pa-preview-card > small { display:block;margin-top:5px;color:#9ba5a8;font:8px ui-monospace,monospace;line-height:1.4;overflow-wrap:anywhere; }
      .pa-preview-price { display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:10px;border-top:1px solid #eff0eb;color:#9ba3a4;font-size:8px; }
      .pa-preview-price b { color:#315b93;font-size:12px;font-variant-numeric:tabular-nums; }
      .pa-side-preview > p { margin:9px 0 0;color:#9aa2a1;font-size:8px;line-height:1.5; }
      .pa-local-note { display:flex;align-items:center;gap:8px;padding:10px 4px;color:#8d9895;font-size:8px;line-height:1.5; }
      .pa-submit-bar { position:sticky;z-index:8;bottom:0;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px -2px 0;padding:11px 14px;border:1px solid #e1e5e1;border-radius:7px;background:rgba(255,254,250,.96);box-shadow:0 -6px 20px rgba(28,43,60,.045);backdrop-filter:blur(8px); }
      .pa-submit-note { display:flex;align-items:center;gap:6px;color:#8f999a;font-size:9px; }
      .pa-dot { color:#b3a078; }
      .pa-submit-bar > button { min-height:40px;display:flex;align-items:center;gap:9px;padding:0 15px;border:1px solid #244c87;border-radius:5px;background:#244c87;color:white;font-size:10px;font-weight:800;cursor:pointer;transition:background .15s ease,transform .15s ease; }
      .pa-submit-bar > button:hover { background:#1d3f73;transform:translateY(-1px); }
      .pa-submit-bar > button span { margin-left:5px;color:#d7c69c;font-size:15px; }
      .pa-toast { position:fixed;z-index:70;right:22px;bottom:22px;display:flex;align-items:center;gap:8px;padding:12px 14px;border:1px solid #d7e4da;border-radius:6px;background:#f7fbf7;color:#47745b;font-size:11px;box-shadow:0 12px 30px rgba(25,45,35,.12);animation:pa-in .17s ease both; }
      .pa-toast button { display:grid;place-items:center;margin-left:4px;border:0;background:transparent;color:#779181;cursor:pointer; }
      @keyframes pa-in { from { opacity:0;transform:translateY(5px); } to { opacity:1;transform:translateY(0); } }
      @media(max-width:900px) { .pa-layout { grid-template-columns:minmax(0,1fr) 255px;gap:12px; } .pa-section { padding:16px; } .pa-visibility { padding:14px; } .pa-price-grid { gap:12px; } }
      @media(max-width:700px) {
        .pa-back { padding:8px 10px;font-size:11px; }
        .pa-context { margin-top:-4px; }
        .pa-form { padding-bottom:18px; }
        .pa-steps { gap:7px;min-height:42px;margin-bottom:9px; }
        .pa-step { gap:5px; }
        .pa-step b { width:21px;height:21px;font-size:8px; }
        .pa-step span { font-size:8px; }
        .pa-step-line { flex:1;width:auto;max-width:27px; }
        .pa-layout { display:flex;flex-direction:column;gap:11px; }
        .pa-main,.pa-side { width:100%; }
        .pa-main { gap:10px; }
        .pa-section { padding:14px 12px; }
        .pa-section-heading { gap:9px;margin-bottom:14px; }
        .pa-section-index { width:24px;height:24px;font-size:9px; }
        .pa-section-heading h2 { font-size:13px; }
        .pa-section-heading p { font-size:9px; }
        .pa-fields { grid-template-columns:1fr 1fr;gap:12px 9px; }
        .pa-label { font-size:8px;letter-spacing:.025em; }
        .pa-label span,.pa-label small { font-size:7px; }
        .pa-field > input,.pa-choice-box,.pa-money,.pa-stock-field { min-height:39px; }
        .pa-choice-box input { height:37px;font-size:10px; }
        .pa-field > input { padding:0 9px;font-size:10px; }
        .pa-field textarea { padding:9px;font-size:10px; }
        .pa-barcode-field { gap:5px;padding-left:8px; }
        .pa-barcode-field input { font-size:9px; }
        .pa-barcode-field button { padding:0 6px; }
        .pa-barcode-field button span { display:none; }
        .pa-price-grid { gap:11px 9px; }
        .pa-money > span { padding:0 7px;font-size:8px; }
        .pa-money input { padding-right:6px;font-size:10px; }
        .pa-profit { align-items:flex-start;flex-direction:column;gap:7px;padding:10px; }
        .pa-profit-note { text-align:left; }
        .pa-profit strong { font-size:16px; }
        .pa-stock-field input { width:48px;padding-left:8px; }
        .pa-stock-field span { font-size:7px; }
        .pa-side { display:grid;grid-template-columns:1fr; }
        .pa-visibility { padding:13px; }
        .pa-side-preview { display:none; }
        .pa-local-note { padding:4px 2px; }
        .pa-submit-bar { position:sticky;bottom:0;margin:6px -1px 0;padding:9px 9px; }
        .pa-submit-note { max-width:48%;flex-wrap:wrap;gap:4px;font-size:8px;line-height:1.35; }
        .pa-submit-bar > button { min-height:40px;gap:6px;padding:0 10px;font-size:9px; }
        .pa-submit-bar > button span { margin-left:1px; }
        .pa-toast { right:12px;bottom:14px;left:12px;justify-content:center; }
      }
      @media(max-width:370px) {
        .pa-fields,.pa-price-grid { grid-template-columns:1fr; }
        .pa-full { grid-column:1; }
        .pa-label { font-size:8px; }
        .pa-label small { display:none; }
        .pa-submit-note { max-width:43%; }
        .pa-submit-bar > button { padding:0 8px;font-size:8px; }
        .pa-preview-card > strong { font-size:10px; }
      }
      @media(prefers-reduced-motion:reduce) { .pa-page *, .pa-page *::before, .pa-page *::after { animation-duration:.01ms!important;transition-duration:.01ms!important; } }
    `}</style>
  </PremiumPageFrame>;
}
