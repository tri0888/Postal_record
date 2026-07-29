/**
 * Điểm vào của server.
 *
 * Chạy trên máy: API ở http://127.0.0.1:3000, giao diện do Vite phục vụ ở
 * http://localhost:5173 và proxy `/api` sang đây — nên trình duyệt coi hai bên
 * là cùng gốc, cookie đăng nhập hoạt động bình thường và không cần cấu hình CORS.
 */

import express from 'express';
import cookieParser from 'cookie-parser';

import { PORT, assertConfig, MONGODB_DB } from './src/config.js';
import { connect, ensureIndexes } from './src/db.js';
import auth from './src/routes/auth.js';
import records from './src/routes/records.js';
import units from './src/routes/units.js';
import imports from './src/routes/imports.js';

function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());

  app.use('/api/auth', auth);
  app.use('/api/records', records);
  app.use('/api/units', units);
  app.use('/api/import', imports);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Không tìm thấy endpoint' }));

  app.use((_req, res) => {
    res
      .status(404)
      .type('text/plain; charset=utf-8')
      .send('Đây chỉ là API. Giao diện chạy ở http://localhost:5173 (npm run dev).');
  });

  // eslint-disable-next-line no-unused-vars -- Express nhận diện error handler qua số tham số
  app.use((err, _req, res, _next) => {
    console.error('Lỗi không mong đợi:', err);
    res.status(500).json({ error: 'Lỗi hệ thống. Vui lòng thử lại.' });
  });

  return app;
}

async function main() {
  assertConfig();

  console.log(`Đang kết nối MongoDB (CSDL: ${MONGODB_DB})...`);
  await connect();
  // Chạy được nhiều lần; đặt ở đây để index duy nhất trên (soHoSo, maDonVi) chắc
  // chắn tồn tại kể cả khi quên chạy `npm run db:init`.
  await ensureIndexes();

  buildApp().listen(PORT, '127.0.0.1', () => {
    console.log(`API sẵn sàng: http://127.0.0.1:${PORT}`);
    console.log('Giao diện: chạy `npm run dev` ở thư mục frontend (http://localhost:5173)');
  });
}

main().catch((err) => {
  console.error(`\n${err?.message ?? err}\n`);
  process.exit(1);
});
