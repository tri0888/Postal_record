/**
 * Express 4 không tự bắt lỗi của handler async — Promise bị từ chối sẽ làm
 * request treo cho tới khi hết thời gian chờ. Bọc mọi handler bằng hàm này để
 * lỗi luôn chảy về error handler chung.
 */
export function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
}

/**
 * Chia mảng thành từng khúc — dùng cho các truy vấn `$in` và cho `bulkWrite`.
 * @template T
 * @param {T[]} arr
 * @param {number} size
 * @returns {T[][]}
 */
export function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
