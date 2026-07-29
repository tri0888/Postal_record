/**
 * Phiên đăng nhập.
 *
 * Hệ thống chỉ có MỘT tài khoản (xem config.js) nên ở đây không có CSDL người
 * dùng, không có vai trò, không có băm mật khẩu. Đăng nhập xong thì ký một JWT
 * và đặt vào cookie httpOnly — JavaScript trên trang không đọc được cookie đó.
 */

import jwt from 'jsonwebtoken';
import { ADMIN_FULL_NAME, ADMIN_USERNAME, JWT_SECRET } from '../config.js';

export const COOKIE_NAME = 'pr_session';
const SESSION_HOURS = 12;

/** Thông tin người dùng trả về cho giao diện. */
export function currentUser() {
  return { username: ADMIN_USERNAME, fullName: ADMIN_FULL_NAME };
}

export function issueToken() {
  return jwt.sign({ sub: ADMIN_USERNAME }, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${SESSION_HOURS}h`,
  });
}

export function cookieOptions(req) {
  return {
    httpOnly: true,
    // Bám theo giao thức thật thay vì đặt cứng: chạy thật qua https thì bật cờ
    // Secure, còn chạy trên máy qua http mà bật thì trình duyệt vứt cookie đi và
    // không bao giờ đăng nhập được.
    // Đọc đúng được giá trị này là nhờ `app.set('trust proxy', 1)` ở index.js —
    // sau reverse proxy, giao thức thật nằm trong header X-Forwarded-Proto.
    secure: req.protocol === 'https',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_HOURS * 3600 * 1000,
  };
}

/** Bắt buộc đăng nhập. Gắn thông tin người dùng vào req.user. */
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });

  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    // Đổi ADMIN_USERNAME trong .env thì mọi phiên cũ phải hết hiệu lực ngay.
    if (payload.sub !== ADMIN_USERNAME) {
      return res.status(401).json({ error: 'Phiên đăng nhập không còn hợp lệ' });
    }
  } catch {
    return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn' });
  }

  req.user = currentUser();
  next();
}
