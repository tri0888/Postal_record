/**
 * Tạo collection và index trên MongoDB Atlas.
 *
 * Chạy được nhiều lần — index đã có thì Mongo bỏ qua. KHÔNG nạp dữ liệu nghiệp
 * vụ nào: hồ sơ và danh mục đơn vị nạp qua màn hình "Nạp dữ liệu" trên giao diện.
 *
 * Lý do không nạp sẵn: file Excel nguồn chứa dữ liệu thật (địa chỉ, mã số thuế,
 * số tài khoản, email cán bộ) nên không được nằm trong repo — xem `data/` trong
 * .gitignore. Script này phải chạy được trên một máy chưa hề có file dữ liệu nào.
 *
 * Tài khoản đăng nhập KHÔNG nằm trong CSDL: hệ thống chỉ có một tài khoản, đọc
 * thẳng từ server/.env (mặc định admin / admin).
 */

import { MONGODB_DB, assertConfig } from '../src/config.js';
import { COL, close, col, connect, ensureIndexes } from '../src/db.js';

async function main() {
  assertConfig();

  console.log(`Đang kết nối MongoDB (CSDL: ${MONGODB_DB})...`);
  await connect();

  await ensureIndexes();
  console.log('Đã tạo xong index.\n');

  for (const name of [COL.records, COL.units, COL.batches]) {
    const indexes = await col(name).indexes();
    const count = await col(name).estimatedDocumentCount();
    console.log(`  ${name.padEnd(14)} ${String(count).padStart(7)} tài liệu   index: ${indexes.map((i) => i.name).join(', ')}`);
  }

  console.log('\nXong. Đăng nhập bằng tài khoản đặt trong server/.env (mặc định admin / admin).');
  console.log('Hồ sơ và danh mục đơn vị: nạp qua màn hình "Nạp dữ liệu".');
}

main()
  .catch((err) => {
    console.error(`\n${err?.message ?? err}\n`);
    process.exitCode = 1;
  })
  .finally(() => close());
