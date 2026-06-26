export function NeuGrey() {
  const base = "#e0e5ec";
  const cards = [
    { label: "Shift Hari Ini", revenue: "Rp 0", laba: "Laba: Rp 0" },
    { label: "Shift Kemarin", revenue: "Rp 20.000", laba: "Laba: Rp 20.000" },
  ];
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-6"
      style={{ backgroundColor: base }}
    >
      <div className="w-full max-w-md">
        <p
          className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-center"
          style={{ color: "#8794a8" }}
        >
          Laporan Pendapatan Shift
        </p>
        <div className="grid grid-cols-2 gap-5">
          {cards.map((c) => (
            <div
              key={c.label}
              className="p-5 rounded-3xl"
              style={{
                backgroundColor: base,
                boxShadow: "7px 7px 16px #b8c2d0, -7px -7px 16px #ffffff",
              }}
            >
              <p
                className="text-[9px] font-black uppercase tracking-wider mb-2"
                style={{ color: "#8794a8" }}
              >
                {c.label}
              </p>
              <p className="text-lg font-black" style={{ color: "#3d4859" }}>
                {c.revenue}
              </p>
              <span
                className="inline-block mt-3 text-[9px] font-black uppercase px-3 py-1.5 rounded-full"
                style={{
                  color: "#5b9279",
                  backgroundColor: base,
                  boxShadow:
                    "inset 3px 3px 6px #b8c2d0, inset -3px -3px 6px #ffffff",
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
