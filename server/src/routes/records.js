/**
 * Tra cứu hồ sơ.
 *
 * Ghép hồ sơ với danh mục đơn vị bằng `$lookup` + `$unwind
 * preserveNullAndEmptyArrays` — đúng nghĩa LEFT JOIN, tức hồ sơ có mã đơn vị
 * chưa có trong danh mục vẫn hiện ra (giao diện đánh dấu "Chưa có trong danh mục").
 */

import { Router } from 'express';
import { ObjectId } from 'mongodb';

import { COL, col } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { wrap } from '../lib/async.js';
import { contains } from '../lib/regex.js';
import { str } from '../lib/query.js';
import { normalizeSearchText } from '../../../shared/normalize.js';
import { MAX_EXPORT_ROWS } from '../../../shared/constants.js';

const records = Router();
records.use(requireAuth);

/** Chỉ cho phép sắp xếp theo các cột đã liệt kê — chặn injection qua ?sort= */
const SORTABLE = {
  // 'id' = thứ tự nhập liệu, cũng chính là thứ tự gốc của file Excel. Đây là
  // cột mà tiêu đề "STT" trên giao diện sắp xếp theo.
  id: 'seq',
  soHoSo: 'soHoSo',
  maDonVi: 'maDonVi',
  ngayHoan: 'ngayHoan',
  ngayNhan: 'ngayNhan',
  ngayTra: 'ngayTra',
  tenDonVi: 'unit.name',
};

const DATE_FIELDS = ['ngayHoan', 'ngayNhan', 'ngayTra'];

/** Ghép đơn vị vào hồ sơ. */
const JOIN_UNIT = [
  { $lookup: { from: COL.units, localField: 'maDonVi', foreignField: '_id', as: 'unit' } },
  { $unwind: { path: '$unit', preserveNullAndEmptyArrays: true } },
];

const PROJECT = {
  $project: {
    seq: 1,
    soHoSo: 1,
    maQuyTrinh: 1,
    maDonVi: 1,
    maCoQuan: 1,
    loaiTaiLieu: 1,
    ngayNhan: 1,
    ngayTra: 1,
    ngayHoan: 1,
    tenDonVi: '$unit.name',
    diaChi: '$unit.address',
    dienThoai: '$unit.phone',
    chuyenQuan: '$unit.chuyenQuan',
    maSoThue: '$unit.taxCode',
  },
};

function toApi(r) {
  return {
    id: String(r._id),
    soHoSo: r.soHoSo,
    maQuyTrinh: r.maQuyTrinh ?? null,
    maDonVi: r.maDonVi,
    maCoQuan: r.maCoQuan ?? null,
    loaiTaiLieu: r.loaiTaiLieu ?? null,
    ngayNhan: r.ngayNhan ?? null,
    ngayTra: r.ngayTra ?? null,
    ngayHoan: r.ngayHoan ?? null,
    tenDonVi: r.tenDonVi ?? null,
    diaChi: r.diaChi ?? null,
    dienThoai: r.dienThoai ?? null,
    chuyenQuan: r.chuyenQuan ?? null,
    maSoThue: r.maSoThue ?? null,
  };
}

function resolveSort(q) {
  // Object.hasOwn chứ không phải `SORTABLE[key] ?? mặc định`: với ?sort=constructor
  // hay ?sort=__proto__ thì phép tra cứu thường trả về thứ kế thừa từ
  // Object.prototype — khác undefined nên toán tử ?? không đỡ được.
  const key = str(q.sort);
  const field = Object.hasOwn(SORTABLE, key) ? SORTABLE[key] : SORTABLE.id;
  return { field, dir: str(q.dir) === 'desc' ? -1 : 1 };
}

/**
 * Luôn phá hoà bằng `seq` để thứ tự trang này sang trang khác không nhảy lung
 * tung khi nhiều dòng cùng giá trị sắp xếp — đúng vai trò của `, r.id ASC` cũ.
 */
function sortStage({ field, dir }) {
  return field === 'seq' ? { seq: dir } : { [field]: dir, seq: 1 };
}

/**
 * Tách bộ lọc làm hai phần: phần chạy trên chính hồ sơ (trước khi join) và phần
 * chạy trên thông tin đơn vị (sau khi join).
 */
function buildFilters(q) {
  const recordMatch = {};

  const maDonVi = str(q.maDonVi).toUpperCase();
  if (maDonVi) {
    recordMatch.maDonVi = str(q.maDonViExact) === 'true' ? maDonVi : contains(maDonVi);
  }

  const soHoSo = str(q.soHoSo);
  if (soHoSo) recordMatch.soHoSo = contains(soHoSo);

  const loaiTaiLieu = str(q.loaiTaiLieu);
  if (loaiTaiLieu) recordMatch.loaiTaiLieu = loaiTaiLieu;

  const maQuyTrinh = str(q.maQuyTrinh);
  if (maQuyTrinh) recordMatch.maQuyTrinh = maQuyTrinh;

  // Ngày lưu dạng chuỗi 'YYYY-MM-DD' nên so sánh chuỗi = so sánh thời gian.
  for (const f of DATE_FIELDS) {
    const from = str(q[`${f}From`]);
    const to = str(q[`${f}To`]);
    if (!from && !to) continue;
    recordMatch[f] = {};
    if (from) recordMatch[f].$gte = from;
    if (to) recordMatch[f].$lte = to;
  }

  const unitMatch = {};

  // Tên đơn vị: bỏ dấu, không phân biệt hoa/thường, khớp chuỗi con.
  const tenDonVi = normalizeSearchText(str(q.tenDonVi));
  if (tenDonVi) unitMatch['unit.nameNorm'] = contains(tenDonVi);

  // Một đơn vị có thể có nhiều chuyên quản => so khớp ĐÚNG một phần tử của mảng,
  // không khớp nhầm chuỗi con (tìm `anv@…` sẽ không dính `hoanv@…`).
  const chuyenQuan = str(q.chuyenQuan).toLowerCase();
  if (chuyenQuan) unitMatch['unit.chuyenQuanTokens'] = chuyenQuan;

  return { recordMatch, unitMatch, hasUnitFilter: Object.keys(unitMatch).length > 0 };
}

/** GET /api/records — tra cứu chính, có phân trang. */
records.get(
  '/',
  wrap(async (req, res) => {
    const q = req.query;
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(q.pageSize) || 50));
    const { recordMatch, unitMatch, hasUnitFilter } = buildFilters(q);
    const sort = resolveSort(q);

    const paging = [{ $sort: sortStage(sort) }, { $skip: (page - 1) * pageSize }, { $limit: pageSize }];

    let items;
    let total;

    if (hasUnitFilter || sort.field.startsWith('unit.')) {
      // Có lọc/sắp xếp theo thông tin đơn vị => phải join trước rồi mới đếm và
      // cắt trang. $facet cho cả hai trong một lượt.
      const [out] = await col(COL.records)
        .aggregate(
          [
            { $match: recordMatch },
            ...JOIN_UNIT,
            { $match: unitMatch },
            { $facet: { items: [...paging, PROJECT], total: [{ $count: 'n' }] } },
          ],
          { allowDiskUse: true },
        )
        .toArray();
      items = out.items;
      total = out.total[0]?.n ?? 0;
    } else {
      // Không đụng tới đơn vị => đếm bằng index, và chỉ join đúng số dòng của
      // một trang thay vì join cả tập kết quả.
      [total, items] = await Promise.all([
        col(COL.records).countDocuments(recordMatch),
        col(COL.records)
          .aggregate([{ $match: recordMatch }, ...paging, ...JOIN_UNIT, PROJECT])
          .toArray(),
      ]);
    }

    res.json({ items: items.map(toApi), total, page, pageSize });
  }),
);

/** GET /api/records/summary — đếm hồ sơ theo từng ngày hoàn (cùng bộ lọc). */
records.get(
  '/summary',
  wrap(async (req, res) => {
    const { recordMatch, unitMatch, hasUnitFilter } = buildFilters(req.query);

    const rows = await col(COL.records)
      .aggregate(
        [
          { $match: recordMatch },
          ...(hasUnitFilter ? [...JOIN_UNIT, { $match: unitMatch }] : []),
          { $group: { _id: '$ngayHoan', soLuong: { $sum: 1 } } },
          // Ngày mới nhất lên đầu; hồ sơ chưa có ngày hoàn (null) xuống cuối.
          { $sort: { _id: -1 } },
        ],
        { allowDiskUse: true },
      )
      .toArray();

    res.json({ items: rows.map((r) => ({ ngayHoan: r._id ?? null, soLuong: r.soLuong })) });
  }),
);

/** GET /api/records/export — trả toàn bộ kết quả (không phân trang) để xuất Excel. */
records.get(
  '/export',
  wrap(async (req, res) => {
    const { recordMatch, unitMatch, hasUnitFilter } = buildFilters(req.query);
    const sort = resolveSort(req.query);

    const rows = await col(COL.records)
      .aggregate(
        [
          { $match: recordMatch },
          ...JOIN_UNIT,
          ...(hasUnitFilter ? [{ $match: unitMatch }] : []),
          { $sort: sortStage(sort) },
          { $limit: MAX_EXPORT_ROWS },
          PROJECT,
        ],
        { allowDiskUse: true },
      )
      .toArray();

    res.json({ items: rows.map(toApi) });
  }),
);

/** GET /api/records/facets — các giá trị có thật, để đổ vào dropdown bộ lọc. */
records.get(
  '/facets',
  wrap(async (_req, res) => {
    const clean = (list) => list.filter((v) => v !== null && v !== undefined && v !== '').sort();

    const [loaiTaiLieu, maQuyTrinh, chuyenQuan] = await Promise.all([
      col(COL.records).distinct('loaiTaiLieu'),
      col(COL.records).distinct('maQuyTrinh'),
      col(COL.units).distinct('chuyenQuanTokens'),
    ]);

    res.json({
      loaiTaiLieu: clean(loaiTaiLieu),
      maQuyTrinh: clean(maQuyTrinh),
      chuyenQuan: clean(chuyenQuan),
    });
  }),
);

/** DELETE /api/records/:id */
records.delete(
  '/:id',
  wrap(async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'ID không hợp lệ' });

    const r = await col(COL.records).deleteOne({ _id: new ObjectId(id) });
    if (!r.deletedCount) return res.status(404).json({ error: 'Không tìm thấy hồ sơ' });
    res.json({ ok: true, deleted: r.deletedCount });
  }),
);

export default records;
