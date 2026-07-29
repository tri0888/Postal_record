/**
 * Danh mục đơn vị.
 *
 * `_id` của mỗi tài liệu CHÍNH LÀ mã đơn vị (đã viết hoa). Nhờ vậy tính duy nhất
 * của mã do MongoDB tự bảo đảm, và `$lookup` từ hồ sơ sang đây khớp thẳng vào
 * khoá chính — không cần index phụ nào cho việc ghép.
 */

import { Router } from 'express';

import { COL, col } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { wrap } from '../lib/async.js';
import { contains } from '../lib/regex.js';
import { str } from '../lib/query.js';
import { normalizeChuyenQuan, normalizeSearchText } from '../../../shared/normalize.js';

const units = Router();
units.use(requireAuth);

function toApi(u, soHoSoCount = 0) {
  return {
    id: u._id,
    code: u._id,
    name: u.name ?? null,
    address: u.address ?? null,
    bankAccount: u.bankAccount ?? null,
    phone: u.phone ?? null,
    chuyenQuan: u.chuyenQuan ?? null,
    taxCode: u.taxCode ?? null,
    isActive: u.isActive !== false,
    soHoSoCount,
  };
}

/**
 * Đếm số hồ sơ của từng đơn vị trên trang hiện tại — bằng MỘT truy vấn gộp cho
 * cả trang, thay vì mỗi đơn vị một truy vấn.
 */
async function countRecords(codes) {
  if (codes.length === 0) return new Map();
  const rows = await col(COL.records)
    .aggregate([{ $match: { maDonVi: { $in: codes } } }, { $group: { _id: '$maDonVi', n: { $sum: 1 } } }])
    .toArray();
  return new Map(rows.map((r) => [r._id, r.n]));
}

/** Dựng payload ghi vào CSDL từ dữ liệu người dùng gửi lên. */
function unitDoc(b) {
  // Chuẩn hoá lại ở máy chủ: không tin tuyệt đối vào dữ liệu client gửi lên.
  const cq = normalizeChuyenQuan(b.chuyenQuan);
  return {
    name: b.name ?? null,
    nameNorm: normalizeSearchText(b.name ?? null),
    address: b.address ?? null,
    bankAccount: b.bankAccount ?? null,
    phone: b.phone ?? null,
    chuyenQuan: cq.display,
    chuyenQuanTokens: cq.tokens,
    taxCode: b.taxCode ?? null,
    isActive: b.isActive !== false,
    updatedAt: new Date(),
  };
}

/** GET /api/units — tra cứu danh mục đơn vị. */
units.get(
  '/',
  wrap(async (req, res) => {
    const q = req.query;
    const filter = {};

    const keyword = str(q.q);
    if (keyword) {
      // Gõ mã hay gõ tên đều tìm được; tên thì không phân biệt hoa/thường và dấu.
      filter.$or = [
        { _id: contains(keyword.toUpperCase()) },
        { nameNorm: contains(normalizeSearchText(keyword) ?? keyword.toUpperCase()) },
      ];
    }

    // Một đơn vị có thể có nhiều chuyên quản => khớp đúng một phần tử.
    const chuyenQuan = str(q.chuyenQuan).toLowerCase();
    if (chuyenQuan) filter.chuyenQuanTokens = chuyenQuan;

    if (str(q.onlyActive) === 'true') filter.isActive = { $ne: false };

    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(q.pageSize) || 50));

    const [total, rows] = await Promise.all([
      col(COL.units).countDocuments(filter),
      col(COL.units)
        .find(filter)
        .sort({ _id: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray(),
    ]);

    const counts = await countRecords(rows.map((u) => u._id));

    res.json({
      items: rows.map((u) => toApi(u, counts.get(u._id) ?? 0)),
      total,
      page,
      pageSize,
    });
  }),
);

units.get(
  '/:code',
  wrap(async (req, res) => {
    const code = req.params.code.toUpperCase();
    const u = await col(COL.units).findOne({ _id: code });
    if (!u) return res.status(404).json({ error: 'Không tìm thấy đơn vị' });

    const counts = await countRecords([code]);
    res.json({ item: toApi(u, counts.get(code) ?? 0) });
  }),
);

units.post(
  '/',
  wrap(async (req, res) => {
    const b = req.body ?? {};
    const code = (b.code ?? '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'Thiếu mã đơn vị' });

    try {
      // insertOne thất bại nếu _id đã tồn tại => không cần đọc trước để kiểm tra,
      // và cũng không có khe hở khi hai người thêm cùng lúc.
      await col(COL.units).insertOne({ _id: code, ...unitDoc(b), createdAt: new Date() });
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(409).json({ error: `Mã đơn vị ${code} đã tồn tại` });
      }
      throw err;
    }

    res.status(201).json({ ok: true });
  }),
);

units.put(
  '/:code',
  wrap(async (req, res) => {
    const code = req.params.code.toUpperCase();
    const r = await col(COL.units).updateOne({ _id: code }, { $set: unitDoc(req.body ?? {}) });
    if (!r.matchedCount) return res.status(404).json({ error: 'Không tìm thấy đơn vị' });
    res.json({ ok: true });
  }),
);

units.delete(
  '/:code',
  wrap(async (req, res) => {
    const code = req.params.code.toUpperCase();

    // Không cho xoá cứng đơn vị đang có hồ sơ — sẽ làm hỏng liên kết dữ liệu.
    const used = await col(COL.records).countDocuments({ maDonVi: code });
    if (used > 0) {
      return res.status(409).json({
        error: `Đơn vị ${code} đang có ${used} hồ sơ, không thể xoá. Hãy đánh dấu ngừng hoạt động.`,
      });
    }

    const r = await col(COL.units).deleteOne({ _id: code });
    if (!r.deletedCount) return res.status(404).json({ error: 'Không tìm thấy đơn vị' });
    res.json({ ok: true });
  }),
);

export default units;
