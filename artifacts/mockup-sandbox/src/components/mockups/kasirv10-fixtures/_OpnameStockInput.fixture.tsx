import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

type Props = { branchId: string; productId: string; currentStock: number; onSave: (branchId: string, productId: string, oldQty: number, newQty: number) => Promise<void> };

// Isolated copy of the app's OpnameStockInput; saves only to the caller's no-op.
export function OpnameStockInput({ branchId, productId, currentStock, onSave }: Props) {
  const [value, setValue] = useState(String(currentStock));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const baseline = useRef(currentStock);
  const pending = useRef(false);
  useEffect(() => {
    if (!dirty) { baseline.current = currentStock; setValue(String(currentStock)); }
  }, [currentStock, dirty]);
  const save = async () => {
    if (pending.current || !dirty || value.trim() === "") return;
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 0) return;
    if (quantity === baseline.current) { setDirty(false); return; }
    pending.current = true; setSaving(true);
    try { await onSave(branchId, productId, baseline.current, quantity); }
    finally { pending.current = false; setSaving(false); setDirty(false); }
  };
  return <div className="flex min-w-[104px] items-center gap-1.5">
    <input aria-label="Jumlah fisik opname" type="number" min="0" step="1" value={value} disabled={saving} onChange={(e) => { setValue(e.target.value); setDirty(true); }} onBlur={(e) => {
      if ((e.relatedTarget as HTMLElement | null)?.closest("[data-opname-branch]")) { setDirty(false); setValue(String(currentStock)); return; }
      void save();
    }} onKeyDown={(e) => { if (e.key === "Enter") void save(); }} className="fixture-inset min-h-10 w-full rounded-xl px-2 py-2 text-center text-sm font-extrabold tabular-nums" />
    <button aria-label="Simpan opname" disabled={saving} onMouseDown={(e) => e.preventDefault()} onClick={() => void save()} className="min-h-10 min-w-10 shrink-0 rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><Check className="h-4 w-4" /></button>
  </div>;
}
