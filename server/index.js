/**
 * Điểm vào của server.
 *
 * Hai chế độ chạy, cùng một file:
 *
 *  - TRÊN MÁY   API ở http://127.0.0.1:3000, giao diện do Vite phục vụ ở :5173 và
 *               proxy `/api` sang đây.
 *  - CHẠY THẬT  Express phục vụ luôn giao diện đã build trong frontend/dist, nên
 *               chỉ cần MỘT service duy nhất.
 *
 * Cả hai chế độ giao diện và API đều cùng một gốc, nhờ vậy cookie đăng nhập hoạt
 * động bình thường và không phải cấu hình CORS.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';

import { PORT, assertConfig, MONGODB_DB } from './src/config.js';
import { connect, ensureIndexes } from './src/db.js';
import auth from './src/routes/auth.js';
import records from './src/routes/records.js';
import units from './src/routes/units.js';
import imports from './src/routes/imports.js';

// Tính từ vị trí file này, không phụ thuộc thư mục đang chạy lệnh.
const DIST = fileURLToPath(new URL('../frontend/dist', import.meta.url));
const INDEX_HTML = fileURLToPath(new URL('../frontend/dist/index.html', import.meta.url));

function buildApp() {
  const app = express();
  app.disable('x-powered-by');

  // Sau reverse proxy (Render và tương tự), Express nhận request qua http và chỉ
  // biết được giao thức thật nhờ header X-Forwarded-Proto. Không bật cái này thì
  // req.protocol luôn là 'http' và cookie phiên sẽ thiếu cờ Secure.
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());

  app.use('/api/auth', auth);
  app.use('/api/records', records);
  app.use('/api/units', units);
  app.use('/api/import', imports);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  // Đặt trước phần phục vụ giao diện: endpoint API gõ sai phải trả JSON 404 chứ
  // không được rơi vào fallback SPA rồi trả về index.html.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Không tìm thấy endpoint' }));

  if (existsSync(INDEX_HTML)) {
    app.use(express.static(DIST));
    // Fallback cho single-page application: các đường dẫn như /danh-muc/don-vi
    // chỉ tồn tại trong React Router, trên đĩa không có file nào tương ứng. Thiếu
    // dòng này thì vào thẳng URL đó hoặc bấm F5 sẽ ra 404.
    app.use((_req, res) => res.sendFile(INDEX_HTML));
  } else {
    app.use((_req, res) => {
      res
        .status(404)
        .type('text/plain; charset=utf-8')
        .send('Đây chỉ là API. Giao diện chạy ở http://localhost:5173 (npm run dev).');
    });
  }

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
  // chắn tồn tại kể cả khi quên chạy `npm run db:init`, và để lần deploy đầu tiên
  // tự có đủ index mà không phải chạy thêm lệnh nào.
  await ensureIndexes();

  const servesUi = existsSync(INDEX_HTML);

  // KHÔNG ràng buộc vào 127.0.0.1: nền tảng hosting gọi vào container từ bên
  // ngoài, chỉ nghe loopback thì không ai chạm tới được.
  buildApp().listen(PORT, () => {
    console.log(`Sẵn sàng ở cổng ${PORT}`);
    if (servesUi) {
      console.log('Đang phục vụ cả giao diện từ frontend/dist');
    } else {
      console.log('Chỉ có API. Giao diện: chạy `npm run dev` (http://localhost:5173)');
    }
  });
}

main().catch((err) => {
  console.error(`\n${err?.message ?? err}\n`);
  process.exit(1);
});
