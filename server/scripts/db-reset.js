/**
 * XOÁ SẠCH dữ liệu rồi dựng lại index từ đầu.
 *
 * Đây là lệnh PHÁ HUỶ và nó xoá trên CSDL THẬT ở Atlas, không có bản local nào
 * để lỡ tay còn cứu. Vì vậy bắt buộc phải truyền cờ --yes:
 *
 *   npm run db:reset -- --yes
 */

import { MONGODB_DB, assertConfig } from '../src/config.js';
import { COL, close, col, connect, db, ensureIndexes } from '../src/db.js';

const TARGETS = [COL.records, COL.units, COL.batches, COL.counters];

async function main() {
  assertConfig();

  await connect();

  const counts = {};
  for (const name of TARGETS) counts[name] = await col(name).estimatedDocumentCount();

  console.log(`CSDL sẽ bị xoá: ${MONGODB_DB}`);
  for (const name of TARGETS) console.log(`  ${name.padEnd(14)} ${counts[name]} tài liệu`);

  if (!process.argv.includes('--yes')) {
    console.log('\nChưa xoá gì cả. Muốn xoá thật thì chạy lại kèm cờ:');
    console.log('  npm run db:reset -- --yes');
    return;
  }

  const existing = new Set((await db().listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const name of TARGETS) {
    if (existing.has(name)) {
      await db().dropCollection(name);
      console.log(`  đã xoá ${name}`);
    }
  }

  await ensureIndexes();
  console.log('\nĐã xoá sạch và dựng lại index. Nạp lại dữ liệu qua màn hình "Nạp dữ liệu".');
}

main()
  .catch((err) => {
    console.error(`\n${err?.message ?? err}\n`);
    process.exitCode = 1;
  })
  .finally(() => close());
