/**
 * Chuẩn hoá chuỗi — dùng chung cho server và giao diện.
 *
 * Tách riêng khỏi excel.js vì phía máy chủ chỉ cần mấy hàm này, không cần kéo
 * theo toàn bộ phần đọc file Excel.
 */

/**
 * Bỏ dấu tiếng Việt.
 * NFD tách dấu thanh ra, nhưng đ/Đ không phải ký tự có dấu tổ hợp nên phải
 * thay thủ công.
 * @param {string} s
 * @returns {string}
 */
export function stripAccents(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Chuẩn hoá chuỗi để tìm kiếm: bỏ dấu, viết hoa, gộp khoảng trắng.
 * Nhờ đó gõ "cty co phan" vẫn tìm ra "CTY Cổ Phần ...".
 * @param {string|null|undefined} s
 * @returns {string|null}
 */
export function normalizeSearchText(s) {
  if (s === null || s === undefined) return null;
  const out = stripAccents(String(s)).toUpperCase().replace(/\s+/g, ' ').trim();
  return out === '' ? null : out;
}

/**
 * Chuẩn hoá ô "Chuyên quản".
 *
 * Một ô có thể chứa NHIỀU người, ngăn cách bằng dấu phẩy, và trong dữ liệu thật
 * có ô chứa tới vài chục giá trị, lẫn cả email lẫn mã dạng `12-abcd`, kèm dấu
 * phẩy thừa ở cuối và giá trị trùng nhau.
 *
 * @param {unknown} raw
 * @returns {{ tokens: string[], display: string|null }}
 *   `tokens`  đã tách, viết thường, khử trùng, sắp xếp — lưu thẳng vào MongoDB
 *             dưới dạng mảng, nhờ vậy lọc theo một chuyên quản là phép so khớp
 *             ĐÚNG một phần tử, không khớp nhầm chuỗi con (tìm `anv@…` sẽ không
 *             dính `hoanv@…`).
 *   `display` chuỗi để hiển thị, giữ nguyên cách viết hoa/thường gốc.
 */
export function normalizeChuyenQuan(raw) {
  if (raw === null || raw === undefined) return { tokens: [], display: null };

  // key viết thường -> cách viết gốc gặp đầu tiên
  const seen = new Map();
  for (const part of String(raw).split(/[,;\n\r]+/)) {
    const t = part.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (!seen.has(key)) seen.set(key, t);
  }

  const tokens = [...seen.keys()].sort();
  if (tokens.length === 0) return { tokens: [], display: null };

  return { tokens, display: tokens.map((k) => seen.get(k)).join(', ') };
}
