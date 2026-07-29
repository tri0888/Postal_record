/**
 * Đọc và kiểm tra cấu hình.
 *
 * Không giá trị nhạy cảm nào nằm trong mã nguồn: connection string và khoá ký
 * cookie đều lấy từ `server/.env` (đã gitignore), có `server/.env.example` đi kèm
 * để biết cần điền gì.
 */

import { randomBytes } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Nạp theo đường dẫn tuyệt đối chứ không theo thư mục hiện hành, để chạy lệnh từ
// thư mục gốc hay từ server/ đều tìm thấy .env.
loadEnv({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

export const PORT = Number(process.env.PORT) || 3000;
export const MONGODB_URI = process.env.MONGODB_URI ?? '';
export const MONGODB_DB = process.env.MONGODB_DB || 'postal_record';
export const JWT_SECRET = process.env.JWT_SECRET ?? '';

/**
 * DNS riêng để tra bản ghi SRV của Atlas.
 *
 * Chuỗi `mongodb+srv://` bắt buộc phải tra bản ghi DNS loại SRV trước khi kết
 * nối. Nhiều DNS của nhà mạng và mạng cơ quan chặn hoặc từ chối loại truy vấn
 * này, cho ra lỗi `querySrv ECONNREFUSED`. Đặt biến này để riêng phần tra SRV đi
 * qua một DNS công cộng, không phải sửa cấu hình mạng của cả máy.
 *
 * Ví dụ: MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1
 */
export const MONGODB_DNS_SERVERS = (process.env.MONGODB_DNS_SERVERS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Hệ thống chỉ có MỘT tài khoản. Không có CSDL người dùng, không có phân quyền. */
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
export const ADMIN_FULL_NAME = process.env.ADMIN_FULL_NAME || 'Quản trị hệ thống';

/**
 * Dừng ngay khi thiếu cấu hình bắt buộc, kèm hướng dẫn sửa.
 * Thà không khởi động còn hơn chạy với khoá ký rỗng — cookie đăng nhập khi đó ai
 * cũng giả mạo được.
 */
export function assertConfig() {
  const problems = [];

  if (!MONGODB_URI) {
    problems.push('  MONGODB_URI  — chưa đặt. Lấy ở Atlas > Cluster > Connect > Drivers.');
  }
  if (!JWT_SECRET) {
    problems.push(
      `  JWT_SECRET   — chưa đặt. Dán dòng này vào server/.env:\n` +
        `                 JWT_SECRET=${randomBytes(48).toString('base64url')}`,
    );
  }

  if (problems.length) {
    throw new Error(
      `Thiếu cấu hình trong server/.env:\n\n${problems.join('\n')}\n\n` +
        'Chưa có file thì chép server/.env.example thành server/.env.',
    );
  }
}
