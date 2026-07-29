/* ---------------- Nút ---------------- */

const VARIANTS = {
  primary: 'bg-sky-700 text-white hover:bg-sky-800 disabled:bg-sky-300',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:opacity-50',
};

export function Button({ variant = 'primary', className = '', ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    />
  );
}

/* ---------------- Ô nhập ---------------- */

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const CONTROL =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600 disabled:bg-slate-100';

export function Input({ className = '', ...props }) {
  return <input {...props} className={`${CONTROL} ${className}`} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select {...props} className={`${CONTROL} ${className}`}>
      {children}
    </select>
  );
}

/* ---------------- Bố cục ---------------- */

export function Card({ title, actions, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Alert({ kind = 'info', children }) {
  const styles = {
    info: 'bg-sky-50 text-sky-900 border-sky-200',
    success: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    warning: 'bg-amber-50 text-amber-900 border-amber-300',
    error: 'bg-red-50 text-red-900 border-red-200',
  }[kind];
  return <div className={`rounded-md border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}

export function Spinner({ label = 'Đang tải...' }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
      <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600" />
      {label}
    </div>
  );
}

export function Empty({ children }) {
  return <p className="py-8 text-center text-sm text-slate-500">{children}</p>;
}

export function Badge({ children, kind = 'slate' }) {
  const map = {
    slate: 'bg-slate-100 text-slate-700',
    sky: 'bg-sky-100 text-sky-800',
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${map[kind] ?? map.slate}`}
    >
      {children}
    </span>
  );
}

/* ---------------- Phân trang ---------------- */

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm text-slate-600">
      <span>
        Hiển thị <b>{from.toLocaleString('vi-VN')}</b>–<b>{to.toLocaleString('vi-VN')}</b> trên{' '}
        <b>{total.toLocaleString('vi-VN')}</b> dòng
      </span>
      <div className="flex items-center gap-1">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(1)}>
          «
        </Button>
        <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Trước
        </Button>
        <span className="px-2">
          Trang {page}/{pages}
        </span>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Sau
        </Button>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onChange(pages)}>
          »
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Hộp thoại ---------------- */

export function Modal({ open, title, onClose, children, footer, wide = false }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className={`mt-12 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-lg bg-white shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-800">{title}</h3>
        </header>
        <div className="max-h-[65vh] overflow-y-auto p-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
