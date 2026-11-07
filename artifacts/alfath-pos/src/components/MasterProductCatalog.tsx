import { useMemo, useState } from "react";
import {
  Barcode,
  CheckCircle2,
  ChevronDown,
  Edit3,
  MapPin,
  Search,
  Trash2,
} from "lucide-react";
import "./MasterProductCatalog.css";

type MasterProduct = {
  id: string;
  name: string;
  barcode?: string | null;
  category?: string | null;
  brand?: string | null;
  provider?: string | null;
  description?: string | null;
  purchasePrice?: number | null;
  sellingPrice?: number | null;
  discountPrice?: number | null;
  visibleBranchIds?: string | null;
};

type MasterProductCatalogProps = {
  products: MasterProduct[];
  searchTerm: string;
  getProductName: (product: MasterProduct) => string;
  onEdit: (product: MasterProduct) => void;
  onDelete: (id: string, name: string) => void;
  hasMoreProducts: boolean;
  onLoadMore: () => void;
};

function getCategory(product: MasterProduct) {
  return product.category &&
    product.category !== "UMUM" &&
    product.category !== "LAINNYA"
    ? product.category
    : "Lain-lain";
}

function getProvider(product: MasterProduct, category: string) {
  const primaryGroup =
    category === "Voucher" || category.includes("Perdana")
      ? product.provider
      : product.brand;
  return primaryGroup || product.brand || product.provider || category;
}

function formatRupiah(value: number | null | undefined) {
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

function countVisibleBranches(value?: string | null) {
  return value?.split(",").length || 0;
}

export function MasterProductCatalog({
  products,
  searchTerm,
  getProductName,
  onEdit,
  onDelete,
  hasMoreProducts,
  onLoadMore,
}: MasterProductCatalogProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    () => new Set(),
  );

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.toLowerCase();
    return products.filter(
      (product) =>
        product &&
        (!searchTerm ||
          (product.name || "").toLowerCase().includes(normalizedSearch) ||
          (product.barcode || "").includes(searchTerm)),
    );
  }, [products, searchTerm]);

  const categories = useMemo(() => {
    const groups = new Map<string, MasterProduct[]>();
    for (const product of filteredProducts) {
      const category = getCategory(product);
      const items = groups.get(category) || [];
      items.push(product);
      groups.set(category, items);
    }

    return Array.from(groups.entries()).sort(([left], [right]) =>
      left.localeCompare(right, "id"),
    );
  }, [filteredProducts]);

  const toggleCategory = (category: string) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const toggleProvider = (category: string, provider: string) => {
    const key = `${category}::${provider}`;
    setExpandedProviders((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="mp-catalog" data-master-product-catalog>
      <div className="mp-catalog-columns" aria-hidden="true">
        <span>Produk</span>
        <span>Kategori &amp; spesifikasi</span>
        <span className="mp-column-number">Modal</span>
        <span className="mp-column-number">Harga aktif</span>
        <span className="mp-column-number">Cabang</span>
        <span className="mp-column-actions">Aksi</span>
      </div>

      <div className="mp-catalog-list">
        {categories.length ? (
          categories.map(([category, categoryProducts], categoryIndex) => {
            const categoryOpen =
              Boolean(searchTerm) || expandedCategories.has(category);
            const categoryPanelId = `mp-category-panel-${categoryIndex}`;
            const providerGroups = new Map<string, MasterProduct[]>();

            for (const product of categoryProducts) {
              const provider = getProvider(product, category);
              const items = providerGroups.get(provider) || [];
              items.push(product);
              providerGroups.set(provider, items);
            }

            const providers = Array.from(providerGroups.entries()).sort(
              ([left], [right]) => left.localeCompare(right, "id"),
            );

            return (
              <section className="mp-category" key={category}>
                <button
                  type="button"
                  className={`mp-category-toggle${categoryOpen ? " is-open" : ""}`}
                  aria-expanded={categoryOpen}
                  aria-controls={categoryPanelId}
                  onClick={() => toggleCategory(category)}
                >
                  <span className="mp-category-index">
                    {String(categoryIndex + 1).padStart(2, "0")}
                  </span>
                  <span className="mp-category-label">Kategori</span>
                  <strong className="mp-category-name">{category}</strong>
                  <span className="mp-category-count">
                    {categoryProducts.length} produk
                  </span>
                  <ChevronDown className="mp-chevron" size={16} />
                </button>

                {categoryOpen && (
                  <div className="mp-provider-list mp-reveal" id={categoryPanelId}>
                    {providers.map(([provider, providerProducts], providerIndex) => {
                      const providerKey = `${category}::${provider}`;
                      const providerOpen =
                        Boolean(searchTerm) || expandedProviders.has(providerKey);
                      const providerPanelId = `mp-provider-panel-${categoryIndex}-${providerIndex}`;
                      const sortedProducts = providerProducts
                        .slice()
                        .sort((left, right) => {
                          const activePrice = (product: MasterProduct) =>
                            Number(product.discountPrice) > 0
                              ? Number(product.discountPrice)
                              : Number(product.sellingPrice || 0);
                          return activePrice(left) - activePrice(right);
                        });

                      return (
                        <div className="mp-provider" key={providerKey}>
                          <button
                            type="button"
                            className={`mp-provider-toggle${providerOpen ? " is-open" : ""}`}
                            aria-expanded={providerOpen}
                            aria-controls={providerPanelId}
                            onClick={() => toggleProvider(category, provider)}
                          >
                            <span className="mp-provider-mark">
                              {provider.slice(0, 1).toUpperCase()}
                            </span>
                            <strong>{provider}</strong>
                            <span className="mp-provider-count">
                              {providerProducts.length} produk
                            </span>
                            <ChevronDown className="mp-chevron" size={15} />
                          </button>

                          {providerOpen && (
                            <div
                              className="mp-product-list mp-reveal"
                              id={providerPanelId}
                            >
                              {sortedProducts.map((product) => {
                                const visibleEverywhere =
                                  product.visibleBranchIds === "*";
                                const visibleBranchCount = countVisibleBranches(
                                  product.visibleBranchIds,
                                );
                                const hasDiscount = Number(product.discountPrice) > 0;
                                const activePrice = hasDiscount
                                  ? product.discountPrice
                                  : product.sellingPrice;

                                return (
                                  <article className="mp-product-row" key={product.id}>
                                    <div className="mp-product-item">
                                      <strong>{getProductName(product)}</strong>
                                      <span className="mp-product-barcode">
                                        <Barcode size={13} />
                                        {product.barcode || "Tanpa barcode"}
                                      </span>
                                    </div>

                                    <div className="mp-product-meta">
                                      <span className="mp-product-tag">
                                        {category}
                                        {product.brand || product.provider
                                          ? ` · ${product.brand || product.provider}`
                                          : ""}
                                      </span>
                                      {product.description && (
                                        <small title={product.description}>
                                          {product.description}
                                        </small>
                                      )}
                                    </div>

                                    <div className="mp-product-price mp-product-cost">
                                      <span>Modal</span>
                                      <strong>
                                        {formatRupiah(product.purchasePrice)}
                                      </strong>
                                    </div>

                                    <div className="mp-product-price mp-product-selling">
                                      <span>{hasDiscount ? "Harga promo" : "Harga jual"}</span>
                                      <strong>{formatRupiah(activePrice)}</strong>
                                      {hasDiscount && (
                                        <del>{formatRupiah(product.sellingPrice)}</del>
                                      )}
                                    </div>

                                    <div className="mp-product-visibility">
                                      {visibleEverywhere ? (
                                        <span className="mp-visibility-all">
                                          <CheckCircle2 size={13} />
                                          Semua
                                        </span>
                                      ) : (
                                        <span
                                          className="mp-visibility-branches"
                                          title={product.visibleBranchIds || ""}
                                        >
                                          <MapPin size={13} />
                                          {visibleBranchCount} cabang
                                        </span>
                                      )}
                                    </div>

                                    <div className="mp-product-actions">
                                      <button
                                        type="button"
                                        onClick={() => onEdit(product)}
                                        aria-label={`Ubah ${getProductName(product)}`}
                                        title="Ubah produk"
                                      >
                                        <Edit3 size={15} />
                                      </button>
                                      <button
                                        type="button"
                                        className="mp-delete"
                                        onClick={() =>
                                          onDelete(product.id, product.name)
                                        }
                                        aria-label={`Hapus ${getProductName(product)}`}
                                        title="Hapus produk"
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        ) : (
          <div className="mp-catalog-empty">
            <span><Search size={18} /></span>
            <strong>{searchTerm ? "Produk tidak ditemukan" : "Belum ada produk"}</strong>
            <small>
              {searchTerm
                ? "Coba nama produk atau barcode yang berbeda."
                : "Produk akan muncul di sini setelah tersedia."}
            </small>
          </div>
        )}
      </div>

      {hasMoreProducts && (
        <div className="mp-catalog-more">
          <button type="button" onClick={onLoadMore}>
            Muat lebih banyak produk
          </button>
        </div>
      )}
    </div>
  );
}
