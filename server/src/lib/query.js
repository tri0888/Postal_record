/**
 * Đọc tham số truy vấn về dạng chuỗi đã trim.
 *
 * Express trả về MẢNG cho `?x[]=a&x[]=b` và OBJECT cho `?x[k]=v`. Gọi thẳng
 * .trim() lên mấy thứ đó sẽ ném TypeError và biến một request rác thành lỗi 500
 * khó hiểu, nên ép kiểu ở một chỗ duy nhất.
 *
 * @param {unknown} v
 * @returns {string}
 */
export function str(v) {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0].trim() : '';
  return '';
}
