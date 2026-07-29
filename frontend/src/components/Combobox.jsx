import { useEffect, useMemo, useRef, useState } from 'react';

function fold(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function Combobox({
  value,
  options,
  onChange,
  placeholder = 'Gõ để tìm...',
  emptyLabel = '— Tất cả —',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);

  // Đóng danh sách khi bấm ra ngoài
  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    const list = q ? options.filter((o) => fold(o).includes(q)) : options;
    return list.slice(0, 200);
  }, [options, query]);

  useEffect(() => setActive(0), [query, open]);

  function pick(v) {
    onChange(v);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // vị trí 0 là mục "Tất cả"
      if (active === 0) pick('');
      else if (filtered[active - 1] !== undefined) pick(filtered[active - 1]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  const control =
    'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600';

  return (
    <div ref={boxRef} className="relative">
      <input
        className={control}
        // Khi chưa mở: hiện giá trị đang chọn. Khi đang mở: hiện thứ đang gõ.
        value={open ? query : value}
        placeholder={value ? value : placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />

      {value && !open && (
        <button
          type="button"
          aria-label="Xoá lựa chọn"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          ×
        </button>
      )}

      {open && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          <li>
            <button
              type="button"
              onMouseEnter={() => setActive(0)}
              onClick={() => pick('')}
              className={`block w-full px-3 py-1.5 text-left text-sm ${
                active === 0 ? 'bg-sky-50 text-sky-900' : 'text-slate-500'
              }`}
            >
              {emptyLabel}
            </button>
          </li>
          {filtered.map((o, i) => (
            <li key={o}>
              <button
                type="button"
                onMouseEnter={() => setActive(i + 1)}
                onClick={() => pick(o)}
                className={`block w-full truncate px-3 py-1.5 text-left text-sm ${
                  active === i + 1 ? 'bg-sky-50 text-sky-900' : 'text-slate-700'
                } ${o === value ? 'font-semibold' : ''}`}
                title={o}
              >
                {o}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-400">Không có kết quả phù hợp</li>
          )}
        </ul>
      )}
    </div>
  );
}
