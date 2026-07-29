/** Đổi 'YYYY-MM-DD' sang 'dd/mm/yyyy' để hiển thị theo thói quen Việt Nam. */
export function toVN(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * Đổi mốc thời gian sang 'dd/mm/yyyy hh:mm' theo GIỜ MÁY NGƯỜI DÙNG.
 * Server trả về chuỗi ISO theo giờ UTC, nếu cắt chuỗi thô thì giờ hiển thị sẽ
 * lệch đúng bằng chênh lệch múi giờ.
 */
export function toVNDateTime(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatNumber(n) {
  return Number(n).toLocaleString('vi-VN');
}
