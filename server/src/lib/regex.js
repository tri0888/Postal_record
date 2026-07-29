/**
 * Dựng regex từ chuỗi người dùng gõ vào.
 *
 * MongoDB không có LIKE; tìm chuỗi con phải dùng regex. Nhưng ghép thẳng chuỗi
 * người dùng vào regex là nguy hiểm: gõ `.*` sẽ khớp mọi thứ và làm Mongo quét
 * toàn bộ collection, còn `(a+)+` thì gây bùng nổ thời gian khớp. Escape trước
 * là bắt buộc — đây đúng là vai trò của hàm `likeEscape` ở bản chạy trên SQL.
 */

/** Escape mọi ký tự có nghĩa đặc biệt trong regex. */
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Regex "chứa chuỗi này", đã escape an toàn.
 * @param {string} s
 * @param {string} [flags] 'i' nếu cần bỏ qua hoa/thường
 */
export function contains(s, flags = '') {
  return new RegExp(escapeRegex(s), flags);
}
