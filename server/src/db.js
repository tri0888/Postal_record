/**
 * Kết nối MongoDB và khai báo index.
 */

import dns from 'node:dns';
import { MongoClient } from 'mongodb';
import { MONGODB_DB, MONGODB_DNS_SERVERS, MONGODB_URI } from './config.js';

export const COL = {
  units: 'units',
  records: 'records',
  batches: 'importBatches',
  counters: 'counters',
};

let client = null;
let database = null;

/**
 * Dịch lỗi kết nối của driver ra câu người dùng hiểu được kèm cách sửa.
 * Nguyên văn lỗi của driver (`querySrv ECONNREFUSED …`) không nói cho ai biết
 * phải làm gì tiếp theo.
 */
function explainConnectError(err) {
  const msg = String(err?.message ?? err);

  // Tra bản ghi SRV thất bại — chưa hề chạm tới được Atlas.
  if (/querySrv|_mongodb\._tcp/i.test(msg)) {
    return (
      `Không tra được bản ghi DNS SRV của Atlas.\n  (${msg})\n\n` +
      'Chuỗi mongodb+srv:// phải tra DNS loại SRV trước khi kết nối, mà DNS máy\n' +
      'bạn đang dùng từ chối loại truy vấn này. Chọn MỘT trong ba cách:\n\n' +
      '  1. Thêm vào server/.env  (gọn nhất, không đụng cấu hình mạng):\n' +
      '       MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1\n\n' +
      '  2. Dùng chuỗi kết nối KHÔNG cần SRV: ở Atlas vào Connect > Drivers,\n' +
      '     chọn Node.js phiên bản 2.2.12 or later — nó cho chuỗi mongodb://\n' +
      '     liệt kê thẳng các host, bỏ qua hoàn toàn bước tra SRV.\n\n' +
      '  3. Đổi DNS của máy sang 8.8.8.8 hoặc 1.1.1.1.'
    );
  }

  if (/Authentication failed|bad auth/i.test(msg)) {
    return (
      `Sai tài khoản CSDL.\n  (${msg})\n\n` +
      'Kiểm tra user/password trong MONGODB_URI. Mật khẩu có ký tự đặc biệt\n' +
      '(@ : / ? # [ ] %) thì phải mã hoá URL, ví dụ @ viết thành %40.'
    );
  }

  if (/ServerSelection|ETIMEOUT|ETIMEDOUT/i.test(msg)) {
    return (
      `Kết nối tới Atlas quá hạn chờ.\n  (${msg})\n\n` +
      'Thường là do IP máy bạn chưa được cho phép: vào Atlas > Network Access\n' +
      '> Add IP Address > Add Current IP Address, chờ trạng thái chuyển Active.'
    );
  }

  return msg;
}

export async function connect() {
  if (database) return database;

  // Chỉ đổi DNS cho các hàm dns.resolve* (driver dùng chúng để tra SRV/TXT).
  // Việc phân giải tên host khi mở kết nối vẫn đi qua DNS của hệ điều hành.
  if (MONGODB_DNS_SERVERS.length) dns.setServers(MONGODB_DNS_SERVERS);

  client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
  } catch (err) {
    await client.close().catch(() => undefined);
    client = null;
    throw new Error(explainConnectError(err));
  }

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
