import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';

import { ADMIN_PASSWORD, ADMIN_USERNAME } from '../config.js';
import { COOKIE_NAME, cookieOptions, currentUser, issueToken, requireAuth } from '../middleware/auth.js';

const auth = Router();

/**
 * So sánh không rò rỉ thông tin qua thời gian phản hồi.
 * timingSafeEqual đòi hai buffer dài bằng nhau nên phải băm qua độ dài trước;
 * ở đây dùng cách đơn giản là so sánh từng byte trên đúng độ dài mong đợi.
 */
function safeEqual(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  if (x.length !== y.length) {
    // Vẫn chạy một phép so sánh giả để thời gian không phụ thuộc vào độ dài.
    timingSafeEqual(x, x);
    return false;
  }
  return timingSafeEqual(x, y);
}

auth.post('/login', (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');

  if (!username || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
  }

  // Kiểm cả hai vế rồi mới kết luận, và dùng chung một thông báo — không tiết lộ
  // sai ở tên đăng nhập hay ở mật khẩu.
  const okUser = safeEqual(username.toLowerCase(), ADMIN_USERNAME.toLowerCase());
  const okPass = safeEqual(password, ADMIN_PASSWORD);
  if (!okUser || !okPass) {
    return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
  }

  res.cookie(COOKIE_NAME, issueToken(), cookieOptions(req));
  res.json({ user: currentUser() });
});

auth.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

/** Khôi phục phiên khi tải lại trang. */
auth.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

export default auth;
