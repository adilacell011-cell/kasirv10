export function NeuColor() {
  const base = "#eaedf3";
  const cards = [
    {
      label: "Shift Hari Ini",
      revenue: "Rp 0",
      laba: "Laba: Rp 0",
      bg: "#dce8fb",
      darkShadow: "#b3c6e6",
      labelColor: "#2563a8",
      amountColor: "#163a66",
    },
    {
      label: "Shift Kemarin",
      revenue: "Rp 20.000",
      laba: "Laba: Rp 20.000",
      bg: "#f1e2fb",
      darkShadow: "#d3b6e8",
      labelColor: "#8b3bb8",
      amountColor: "#5a1f80",
    },
  ];
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-6"
      style={{ backgroundColor: base }}
    >
      <div className="w-full max-w-md">
        <p
          className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-center"
          style={{ color: "#94a0b4" }}
        >
          Laporan Pendapatan Shift
        </p>
        <div className="grid grid-cols-2 gap-5">
          {cards.map((c) => (
            <div
              key={c.label}
              className="p-5 rounded-3xl"
              style={{
                backgroundColor: c.bg,
                boxShadow: `7px 7px 16px ${c.darkShadow}, -7px -7px 16px #ffffff`,
              }}
            >
              <p
                className="text-[9px] font-black uppercase tracking-wider mb-2"
                style={{ color: c.labelColor }}
              >
                {c.label}
              </p>
              <p className="text-lg font-black" style={{ color: c.amountColor }}>
                {c.revenue}
              </p>
              <span
                className="inline-block mt-3 text-[9px] font-black uppercase px-3 py-1.5 rounded-full"
                style={{
                  color: "#2f8a63",
                  backgroundColor: c.bg,
                  boxShadow: `inset 3px 3px 6px ${c.darkShadow}, inset -3px -3px 6px #ffffff`,
                }}
              >
                {c.laba}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
