/**
 * OperatorLogo — logo resmi operator seluler Indonesia.
 * SVG diimport sebagai static asset Vite — nol request server, browser cache permanen.
 */

import telkomselSrc from "../assets/operators/telkomsel.svg";
import indosatSrc   from "../assets/operators/indosat.svg";
import xlSrc        from "../assets/operators/xl.svg";
import axisSrc      from "../assets/operators/axis.svg";
import smartfrenSrc from "../assets/operators/smartfren.svg";
import triSrc       from "../assets/operators/tri.svg";

/* ── Registry brand → asset URL ── */
const LOGO_MAP: Record<string, string> = {
  telkomsel: telkomselSrc,
  indosat:   indosatSrc,
  xl:        xlSrc,
  axis:      axisSrc,
  smartfren: smartfrenSrc,
  tri:       triSrc,
};

function matchKey(brand: string): string | null {
  const b = brand.toLowerCase().trim();
  if (b.startsWith("telkomsel")) return "telkomsel";
  if (b.startsWith("indosat"))   return "indosat";
  if (b === "xl")                return "xl";
  if (b.startsWith("axis"))      return "axis";
  if (b.startsWith("smartfren")) return "smartfren";
  if (b === "tri" || b === "3")  return "tri";
  return null;
}

/** Mengembalikan URL asset logo, atau null jika tidak dikenal. */
export function getOperatorLogoUrl(brand: string): string | null {
  const key = matchKey(brand);
  return key ? LOGO_MAP[key] : null;
}

/**
 * OperatorBadge — menampilkan logo resmi (img) jika dikenal,
 * atau text pill biasa jika tidak.
 */
export function OperatorBadge({ brand }: { brand: string }) {
  const logoUrl = getOperatorLogoUrl(brand);

  if (logoUrl) {
    return (
      <span className="inline-flex items-center shrink-0 bg-white border border-slate-200 rounded-md px-1.5 py-[3px] leading-none">
        <img
          src={logoUrl}
          alt={brand}
          className="h-3.5 w-auto max-w-[56px] object-contain"
          draggable={false}
        />
      </span>
    );
  }

  return (
    <span className="text-[7px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded leading-none shrink-0 bg-slate-100 text-slate-500">
      {brand}
    </span>
  );
}

/** @deprecated gunakan OperatorBadge langsung */
export function getOperatorLogo(brand: string, _size?: number) {
  return null;
}
