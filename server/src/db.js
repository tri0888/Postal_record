/**
 * Kết nối MongoDB và khai báo index.
 */

import { MongoClient } from 'mongodb';
import { MONGODB_DB, MONGODB_URI } from './config.js';

export const COL = {
  units: 'units',
  records: 'records',
  batches: 'importBatches',
  counters: 'counters',
};

let client = null;
let database = null;

export async function connect() {
  if (database) return database;
  client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await client.connect();
  database = client.db(MONGODB_DB);
  return database;
}

export function db() {
  if (!database) throw new Error('Chưa kết nối CSDL — gọi connect() trước.');
  return database;
}

/** Lối tắt tới một collection. */
export const col = (name) => db().collection(name);

export async function close() {
  await client?.close();
  client = null;
  database = null;
}

/**
 * Tạo index. Chạy được nhiều lần — index đã có thì Mongo bỏ qua.
 *
 * Index quan trọng nhất là cái unique ghép trên `records`: nó chính là chỗ bẫy
 * "SỐ HỒ SƠ một mình KHÔNG duy nhất" được xử lý. Cùng một số hồ sơ có thể xuất
 * hiện ở nhiều đơn vị, nên khoá phải là CẶP (soHoSo, maDonVi). Có index này thì
 * thao tác nạp dữ liệu chỉ cần upsert, khỏi tự kiểm tra trùng.
 */
export async function ensureIndexes() {
  await col(COL.records).createIndexes([
    { key: { soHoSo: 1, maDonVi: 1 }, name: 'uniq_soHoSo_maDonVi', unique: true },
    // Thứ tự nhập liệu = thứ tự gốc của file Excel; cũng là cột mặc định để sắp xếp.
    { key: { seq: 1 }, name: 'seq' },
    { key: { maDonVi: 1 }, name: 'maDonVi' },
    { key: { ngayHoan: 1 }, name: 'ngayHoan' },
    { key: { ngayNhan: 1 }, name: 'ngayNhan' },
    { key: { ngayTra: 1 }, name: 'ngayTra' },
  ]);

  await col(COL.units).createIndexes([
    // Tìm theo tên đơn vị chạy trên bản đã bỏ dấu + viết hoa.
    { key: { nameNorm: 1 }, name: 'nameNorm' },
    // Một đơn vị có nhiều chuyên quản => index trên mảng, khớp đúng một phần tử.
    { key: { chuyenQuanTokens: 1 }, name: 'chuyenQuanTokens' },
  ]);

  await col(COL.batches).createIndex({ seq: -1 }, { name: 'seq_desc' });
}

/**
 * Cấp phát một dải `count` số thứ tự liên tiếp.
 *
 * MongoDB không có AUTO_INCREMENT, nhưng giao diện cần một thứ tự ổn định
 * ("thứ tự gốc của file Excel"), nên ta tự đếm bằng một tài liệu riêng. $inc là
 * thao tác nguyên tử nên hai lần nạp chạy song song cũng không cấp trùng số.
 *
 * @param {'records'|'batches'} name
 * @param {number} count
 * @returns {Promise<number>} số đầu tiên của dải
 */
export async function nextSeq(name, count = 1) {
  if (count <= 0) return 0;
  const res = await col(COL.counters).findOneAndUpdate(
    { _id: name },
    { $inc: { seq: count } },
    { upsert: true, returnDocument: 'after' },
  );
  // Driver 6 trả thẳng tài liệu; driver cũ bọc trong { value }.
  const doc = res?.value ?? res;
  return doc.seq - count + 1;
}
