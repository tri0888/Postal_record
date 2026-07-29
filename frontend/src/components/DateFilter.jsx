import { Input } from './ui';

/**
 * Bộ lọc cho MỘT cột ngày.
 *
 * Mặc định chỉ có một ô: lọc đúng ngày đó. Tích ô "Từ ngày → đến ngày" thì
 * đổi thành hai ô để lọc theo khoảng.
 *
 * @typedef {{ exact: string, from: string, to: string, range: boolean }} DateGroup
 */

/** @type {DateGroup} */
export const EMPTY_DATE_GROUP = { exact: '', from: '', to: '', range: false };

/** Đổi một DateGroup thành cặp tham số from/to gửi lên API. */
export function dateGroupParams(g) {
  if (g.range) return { from: g.from.trim(), to: g.to.trim() };
  const d = g.exact.trim();
  // Không tích khoảng => lọc đúng một ngày, tức from = to.
  return { from: d, to: d };
}

export function dateGroupActive(g) {
  return g.range ? !!(g.from.trim() || g.to.trim()) : !!g.exact.trim();
}

export function DateFilter({ label, value, onChange }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>

      {value.range ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            aria-label={`${label} từ ngày`}
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
          />
          <span className="shrink-0 text-xs text-slate-400">→</span>
          <Input
            type="date"
            aria-label={`${label} đến ngày`}
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
          />
        </div>
      ) : (
        <Input
          type="date"
          aria-label={label}
          value={value.exact}
          onChange={(e) => onChange({ ...value, exact: e.target.value })}
        />
      )}

      <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={value.range}
          onChange={(e) => {
            const range = e.target.checked;
            // Chuyển qua lại giữ nguyên ngày đang chọn để không phải gõ lại.
            onChange(
              range
                ? { ...value, range, from: value.exact || value.from, to: value.exact || value.to }
                : { ...value, range, exact: value.from || value.exact },
            );
          }}
        />
        Từ ngày → đến ngày
      </label>
    </div>
  );
}
