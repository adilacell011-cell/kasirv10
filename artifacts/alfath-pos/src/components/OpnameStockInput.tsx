import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

type Props = {
  branchId: string;
  productId: string;
  currentStock: number;
  onSave: (branchId: string, productId: string, oldQty: number, newQty: number) => Promise<void>;
};

// The parent keys this editor by branch AND product. A draft always keeps the
// stock snapshot it was based on, even when realtime data changes during typing.
export function OpnameStockInput({ branchId, productId, currentStock, onSave }: Props) {
  const [value, setValue] = useState(String(currentStock));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const baseline = useRef(currentStock);
  const pending = useRef(false);
  useEffect(() => {
    if (!dirty) {
      baseline.current = currentStock;
      setValue(String(currentStock));
    }
  }, [currentStock, dirty]);

  const save = async () => {
    if (pending.current || !dirty || value.trim() === "") return;
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 0) return;
    if (quantity === baseline.current) { setDirty(false); return; }
    pending.current = true;
    setSaving(true);
    try {
      await onSave(branchId, productId, baseline.current, quantity);
    } finally {
      pending.current = false;
      setSaving(false);
      setDirty(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <input
        aria-label="Jumlah fisik opname"
        type="number" min="0" step="1" value={value} disabled={saving}
        onChange={(event) => { setValue(event.target.value); setDirty(true); }}
        onBlur={(event) => {
          // Moving to the branch selector discards the draft, not an implicit save.
          if ((event.relatedTarget as HTMLElement | null)?.closest("[data-opname-branch]")) {
            setDirty(false);
            setValue(String(currentStock));
            return;
          }
          void save();
        }}
        onKeyDown={(event) => { if (event.key === "Enter") void save(); }}
        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center text-xs font-black focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-none transition-all outline-none"
      />
      <button
        aria-label="Simpan opname" disabled={saving}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => void save()}
        className="shrink-0 p-2 text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
      >
        <Check className="w-4 h-4" />
      </button>
    </div>
  );
}
