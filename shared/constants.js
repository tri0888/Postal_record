/**
 * Hằng số dùng chung giữa server và giao diện.
 *
 * KHÔNG đặt bất kỳ khoá, mật khẩu hay dữ liệu thật nào ở đây — file này được
 * đóng gói vào bundle của trình duyệt.
 */

/** Số dòng giao diện gửi lên mỗi lần khi nạp dữ liệu. */
export const IMPORT_CHUNK = 200;

/**
 * Trần số dòng server chấp nhận trong một request nạp dữ liệu.
 * Phải lớn hơn IMPORT_CHUNK; để hai giá trị cạnh nhau cho khỏi lệch nhau về sau.
 */
export const MAX_ROWS_PER_REQUEST = 400;

/** Số khoá tối đa mỗi lần hỏi "dòng nào sẽ bị ghi đè". */
export const MAX_CHECK_KEYS = 5000;

/** Trần số dòng cho chức năng xuất Excel — chặn một câu truy vấn kéo về vô hạn. */
export const MAX_EXPORT_ROWS = 20000;
