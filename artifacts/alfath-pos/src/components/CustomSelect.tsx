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
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-600 transition-colors focus-within:text-blue-700">
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
        className="min-h-11 w-full rounded-xl border border-slate-300/80 px-3.5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-100 cursor-text"
      />
      {isOpen && (
        <div className="app-solid absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          {showCreate && (
            <div
              className="flex min-h-11 cursor-pointer items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-50"
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
              className="min-h-11 cursor-pointer px-4 py-3 text-sm font-medium text-slate-700 hover:bg-blue-50"
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
