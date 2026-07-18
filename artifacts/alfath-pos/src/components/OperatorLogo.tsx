import React from "react";

/**
 * OperatorLogo — inline SVG circular logo untuk operator seluler Indonesia.
 * Pure static component, zero network request, zero server impact.
 */

type LogoProps = { size: number };

/* ─────────── Individual SVG Logos ─────────── */

const TelkomselLogo = ({ size }: LogoProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="16" fill="#E01E20" />
    {/* Lightning bolt / T-flash mark */}
    <path d="M19.5 5.5 L10.5 17.5 H15.5 L12.5 26.5 L22.5 14 H17.5 Z" fill="white" />
  </svg>
);

const IndosatLogo = ({ size }: LogoProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="16" fill="#F4A918" />
    {/* "i" with dot */}
    <circle cx="16" cy="9" r="2.5" fill="white" />
    <rect x="13.5" y="13" width="5" height="11.5" rx="2" fill="white" />
  </svg>
);

const XLLogo = ({ size }: LogoProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="16" fill="#003F9A" />
    <text
      x="16" y="21"
      fontSize="13" fontWeight="900" fill="white"
      textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif"
    >
      XL
    </text>
  </svg>
);

const AxisLogo = ({ size }: LogoProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="16" fill="#2C2C2C" />
    <text
      x="16" y="20.5"
      fontSize="9" fontWeight="900" fill="white"
      textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif" letterSpacing="0.5"
    >
      AXIS
    </text>
  </svg>
);

const SmartfrenLogo = ({ size }: LogoProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="16" fill="#D8006A" />
    {/* Signal-like bars */}
    <rect x="9" y="20" width="3.5" height="5" rx="1" fill="white" />
    <rect x="14.25" y="15.5" width="3.5" height="9.5" rx="1" fill="white" />
    <rect x="19.5" y="10.5" width="3.5" height="14.5" rx="1" fill="white" />
  </svg>
);

const TriLogo = ({ size }: LogoProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="16" fill="#00A0D2" />
    <text
      x="16" y="23"
      fontSize="20" fontWeight="900" fill="white"
      textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif"
    >
      3
    </text>
  </svg>
);

/* ─────────── Logo registry ─────────── */

const LOGO_MAP: Record<string, (size: number) => React.ReactElement> = {
  telkomsel:  (s) => <TelkomselLogo size={s} />,
  indosat:    (s) => <IndosatLogo   size={s} />,
  xl:         (s) => <XLLogo        size={s} />,
  axis:       (s) => <AxisLogo      size={s} />,
  smartfren:  (s) => <SmartfrenLogo size={s} />,
  tri:        (s) => <TriLogo       size={s} />,
  "3":        (s) => <TriLogo       size={s} />,
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

/* ─────────── Public API ─────────── */

/**
 * Mengembalikan elemen SVG logo operator, atau null jika tidak dikenal.
 * Gunakan null-check untuk fallback ke text badge.
 */
export function getOperatorLogo(brand: string, size = 22): React.ReactElement | null {
  const key = matchKey(brand);
  if (!key) return null;
  return LOGO_MAP[key](size);
}

/**
 * OperatorBadge — badge yang menampilkan logo (jika dikenal) + nama brand.
 * Jika tidak dikenal, tampil sebagai text pill biasa.
 */
export function OperatorBadge({ brand }: { brand: string }) {
  const logo = getOperatorLogo(brand, 18);

  if (logo) {
    return (
      <span className="flex items-center gap-1 shrink-0 leading-none">
        <span className="shrink-0 rounded-full overflow-hidden">{logo}</span>
        <span className="text-[7px] font-black tracking-widest uppercase text-slate-500 leading-none">
          {brand}
        </span>
      </span>
    );
  }

  return (
    <span className="text-[7px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded leading-none shrink-0 bg-slate-100 text-slate-500">
      {brand}
    </span>
  );
}
