import React, { useState } from 'react';

interface CustomSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (val: string) => void;
  placeholder?: string;
  /** Izinkan menambah nilai baru yang diketik (mis. kategori manual). Default: true */
  allowCreate?: boolean;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  label,
  value,
  options,
  onChange,
  placeholder,
  allowCreate = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const open = () => {
    setQuery(value || '');
    setIsOpen(true);
  };

  const commit = (val: string) => {
    onChange(val.trim());
    setIsOpen(false);
  };

  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  const exactMatch = options.some((o) => o.trim().toLowerCase() === q);
  const showCreate = allowCreate && q.length > 0 && !exactMatch;

  return (
    <div className="relative group">
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 focus-within:text-blue-600 transition-colors">
        {label}
      </label>
      <input
        value={isOpen ? query : value}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={open}
        onClick={() => {
          if (!isOpen) open();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const t = query.trim();
            const exact = options.find((o) => o.trim().toLowerCase() === t.toLowerCase());
            if (exact) commit(exact);
            else if (showCreate) commit(t);
            else if (filtered.length) commit(filtered[0]);
          } else if (e.key === 'Escape') {
            setIsOpen(false);
          }
        }}
        onBlur={() =>
          setTimeout(() => {
            const t = query.trim();
            if (t && t.toLowerCase() !== (value || '').trim().toLowerCase()) {
              const exact = options.find((o) => o.trim().toLowerCase() === t.toLowerCase());
              if (exact) onChange(exact);
              else if (allowCreate) onChange(t);
            }
            setIsOpen(false);
          }, 150)
        }
        placeholder={placeholder}
        className="w-full border border-slate-300 rounded-2xl px-4 py-3 text-sm focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none font-bold transition-all shadow-sm cursor-text"
      />
      {isOpen && (
        <div className="app-solid absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-48 overflow-y-auto">
          {showCreate && (
            <div
              className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer text-sm font-black text-blue-600 flex items-center gap-2 border-b border-slate-100"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(query);
              }}
            >
              <span className="text-base leading-none">+</span>
              <span className="truncate">Tambah "{query.trim()}"</span>
            </div>
          )}
          {filtered.map((opt) => (
            <div
              key={opt}
              className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm font-medium text-slate-700"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(opt);
              }}
            >
              {opt}
            </div>
          ))}
          {filtered.length === 0 && !showCreate && (
            <div className="px-4 py-2 text-sm font-medium text-slate-400">Tidak ada pilihan</div>
          )}
        </div>
      )}
    </div>
  );
};
