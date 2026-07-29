/**
 * Nạp dữ liệu từ file Excel.
 *
 * File được đọc và chuẩn hoá NGAY TRÊN TRÌNH DUYỆT (xem shared/excel.js); ở đây
 * chỉ nhận các dòng đã sạch theo từng lô rồi ghi vào CSDL.
 */

import { Router } from 'express';
import { ObjectId } from 'mongodb';

import { COL, col, nextSeq } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { chunk, wrap } from '../lib/async.js';
import { normalizeChuyenQuan, normalizeSearchText } from '../../../shared/normalize.js';
import { MAX_CHECK_KEYS, MAX_ROWS_PER_REQUEST } from '../../../shared/constants.js';

const imports = Router();
imports.use(requireAuth);

/** Số giá trị tối đa cho một mệnh đề `$in`. */
const IN_CHUNK = 500;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validateRecord(r) {
  if (!r?.soHoSo?.trim()) return 'Thiếu SỐ HỒ SƠ';
  if (!r?.maDonVi?.trim()) return 'Thiếu MÃ ĐƠN VỊ';
  for (const f of ['ngayNhan', 'ngayTra', 'ngayHoan']) {
    const v = r[f];
    if (v !== null && v !== undefined && !ISO_DATE.test(v)) return `Ngày sai định dạng: ${v}`;
  }
  return null;
}

const recordKey = (soHoSo, maDonVi) => `${soHoSo}\t${maDonVi}`;

/* ------------------------------------------------------------------ */
/* POST /api/import/check — cho biết bao nhiêu dòng SẼ BỊ GHI ĐÈ        */
/* ------------------------------------------------------------------ */

imports.post(
  '/check',
  wrap(async (req, res) => {
    const body = req.body ?? {};
    if (!body.kind || !Array.isArray(body.keys)) {
      return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ' });
    }
    if (body.keys.length > MAX_CHECK_KEYS) {
      return res.status(400).json({ error: `Tối đa ${MAX_CHECK_KEYS} khoá mỗi lần kiểm tra` });
    }

    if (body.kind === 'UNITS') {
      const codes = [...new Set(body.keys.map((k) => String(k).toUpperCase()))];
      const found = [];
      for (const group of chunk(codes, IN_CHUNK)) {
        const rows = await col(COL.units)
          .find({ _id: { $in: group } }, { projection: { _id: 1 } })
          .toArray();
        for (const r of rows) found.push(r._id);
      }
      return res.json({ existing: found });
    }

    // keys dạng "soHoSo\tmaDonVi". Lọc theo soHoSo (có index) rồi đối chiếu CẶP
    // trong JS — nhanh hơn nhiều so với dựng một $or khổng lồ, vì vẫn dùng được index.
    const wanted = new Set(body.keys.map(String));
    const soHoSoList = [...new Set(body.keys.map((k) => String(k).split('\t')[0]))];
    const existing = [];

    for (const group of chunk(soHoSoList, IN_CHUNK)) {
      const rows = await col(COL.records)
        .find({ soHoSo: { $in: group } }, { projection: { soHoSo: 1, maDonVi: 1 } })
        .toArray();
      for (const r of rows) {
        const k = recordKey(r.soHoSo, r.maDonVi);
        if (wanted.has(k)) existing.push(k);
      }
    }

    res.json({ existing });
  }),
);

/* ------------------------------------------------------------------ */
/* POST /api/import/begin — mở một lô import                            */
/* ------------------------------------------------------------------ */

imports.post(
  '/begin',
  wrap(async (req, res) => {
    const b = req.body ?? {};
    if (b.kind !== 'RECORDS' && b.kind !== 'UNITS') {
      return res.status(400).json({ error: 'Loại dữ liệu không hợp lệ' });
    }

    const r = await col(COL.batches).insertOne({
      seq: await nextSeq('batches', 1),
      kind: b.kind,
      fileName: b.fileName ?? null,
      sheetName: b.sheetName ?? null,
      uploadedBy: req.user.username,
      totalRows: 0,
      insertedCount: 0,
      updatedCount: 0,
      errorCount: 0,
      errors: null,
      createdAt: new Date(),
    });

    res.json({ batchId: String(r.insertedId) });
  }),
);

/* ------------------------------------------------------------------ */
/* POST /api/import/commit — nạp một lô dòng                            */
/* ------------------------------------------------------------------ */

async function commitUnits(rows, res) {
  if (rows.some((r) => !r?.code?.trim())) {
    return res.status(400).json({ error: 'Có dòng thiếu mã đơn vị' });
  }

  // Cùng một mã xuất hiện hai lần trong một lô sẽ thành hai lệnh upsert giống hệt
  // nhau chạy song song và đụng vào khoá duy nhất => giữ lần xuất hiện cuối.
  const byCode = new Map();
  for (const r of rows) byCode.set(r.code.trim().toUpperCase(), r);

  const now = new Date();
  const ops = [...byCode].map(([code, r]) => {
    // Chuẩn hoá lại ở máy chủ: không tin tuyệt đối vào dữ liệu client gửi lên.
    const cq = normalizeChuyenQuan(r.chuyenQuan);
    return {
      updateOne: {
        filter: { _id: code },
        update: {
          $set: {
            name: r.name ?? null,
            nameNorm: normalizeSearchText(r.name ?? null),
            address: r.address ?? null,
            bankAccount: r.bankAccount ?? null,
            phone: r.phone ?? null,
            chuyenQuan: cq.display,
            chuyenQuanTokens: cq.tokens,
            taxCode: r.taxCode ?? null,
            updatedAt: now,
          },
          // Nạp lại danh mục KHÔNG được bật lại các đơn vị đã đánh dấu ngừng
          // hoạt động, nên isActive chỉ đặt khi tạo mới.
          $setOnInsert: { isActive: true, createdAt: now },
        },
        upsert: true,
      },
    };
  });

  const r = await col(COL.units).bulkWrite(ops, { ordered: false });
  res.json({ inserted: r.upsertedCount, updated: r.matchedCount });
}

async function commitRecords(rows, batchId, res) {
  for (let i = 0; i < rows.length; i++) {
    const err = validateRecord(rows[i]);
    if (err) return res.status(400).json({ error: `Dòng ${i + 1}: ${err}` });
  }

  // Cùng một cặp (SỐ HỒ SƠ, MÃ ĐƠN VỊ) có thể xuất hiện hai lần trong một lô
  // => giữ lần xuất hiện cuối, giống hệt hành vi của câu UPSERT cũ.
  const byKey = new Map();
  for (const r of rows) {
    const soHoSo = r.soHoSo.trim();
    const maDonVi = r.maDonVi.trim().toUpperCase();
    byKey.set(recordKey(soHoSo, maDonVi), { ...r, soHoSo, maDonVi });
  }

  const list = [...byKey.values()];
  // Cấp trước một dải số thứ tự cho các dòng THÊM MỚI. Dòng đã có giữ nguyên seq
  // cũ nhờ $setOnInsert, nên vài số bị bỏ phí — vô hại, seq chỉ cần tăng dần.
  let seq = await nextSeq('records', list.length);
  const now = new Date();

  const ops = list.map((r) => ({
    updateOne: {
      filter: { soHoSo: r.soHoSo, maDonVi: r.maDonVi },
      update: {
        $set: {
          maQuyTrinh: r.maQuyTrinh ?? null,
          maCoQuan: r.maCoQuan ?? null,
          loaiTaiLieu: r.loaiTaiLieu ?? null,
          ngayNhan: r.ngayNhan ?? null,
          ngayTra: r.ngayTra ?? null,
          ngayHoan: r.ngayHoan ?? null,
          importBatchId: batchId,
          updatedAt: now,
        },
        // soHoSo/maDonVi đã nằm trong filter nên Mongo tự điền khi chèn mới; đặt
        // lại ở đây cũng không sao nhưng KHÔNG được để trùng khoá với $set.
        $setOnInsert: { seq: seq++, createdAt: now },
      },
      upsert: true,
    },
  }));

  const r = await col(COL.records).bulkWrite(ops, { ordered: false });

  // Mã đơn vị có trong hồ sơ nhưng chưa có trong danh mục.
  const codes = [...new Set(list.map((x) => x.maDonVi))];
  const known = new Set();
  for (const group of chunk(codes, IN_CHUNK)) {
    const found = await col(COL.units)
      .find({ _id: { $in: group } }, { projection: { _id: 1 } })
      .toArray();
    for (const u of found) known.add(u._id);
  }

  res.json({
    inserted: r.upsertedCount,
    updated: r.matchedCount,
    unknownUnitCodes: codes.filter((c) => !known.has(c)),
  });
}

imports.post(
  '/commit',
  wrap(async (req, res) => {
    const body = req.body ?? {};
    if (!body.batchId || !Array.isArray(body.rows)) {
      return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ' });
    }
    if (body.rows.length > MAX_ROWS_PER_REQUEST) {
      return res.status(400).json({ error: `Tối đa ${MAX_ROWS_PER_REQUEST} dòng mỗi lần gửi` });
    }
    if (body.rows.length === 0) return res.json({ inserted: 0, updated: 0 });

    if (body.kind === 'UNITS') return commitUnits(body.rows, res);
    return commitRecords(body.rows, String(body.batchId), res);
  }),
);

/* ------------------------------------------------------------------ */
/* POST /api/import/finish — chốt sổ một lô                             */
/* ------------------------------------------------------------------ */

imports.post(
  '/finish',
  wrap(async (req, res) => {
    const b = req.body ?? {};
    if (!ObjectId.isValid(b.batchId ?? '')) {
      return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ' });
    }

    const errors = (b.errors ?? []).slice(0, 500);
    const r = await col(COL.batches).updateOne(
      { _id: new ObjectId(b.batchId) },
      {
        $set: {
          totalRows: b.totalRows ?? 0,
          insertedCount: b.inserted ?? 0,
          updatedCount: b.updated ?? 0,
          errorCount: errors.length,
          errors: errors.length ? errors : null,
        },
      },
    );

    if (!r.matchedCount) return res.status(404).json({ error: 'Không tìm thấy lô' });
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------ */
/* GET /api/import/batches — lịch sử các lần nạp                        */
/* ------------------------------------------------------------------ */

imports.get(
  '/batches',
  wrap(async (_req, res) => {
    const rows = await col(COL.batches).find({}).sort({ seq: -1 }).limit(50).toArray();
    res.json({
      items: rows.map((b) => ({
        id: String(b._id),
        kind: b.kind,
        fileName: b.fileName ?? null,
        sheetName: b.sheetName ?? null,
        totalRows: b.totalRows ?? 0,
        inserted: b.insertedCount ?? 0,
        updated: b.updatedCount ?? 0,
        errorCount: b.errorCount ?? 0,
        createdAt: b.createdAt?.toISOString?.() ?? null,
        uploadedBy: b.uploadedBy ?? null,
      })),
    });
  }),
);

imports.get(
  '/batches/:id/errors',
  wrap(async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID không hợp lệ' });
    }
    const b = await col(COL.batches).findOne(
      { _id: new ObjectId(req.params.id) },
      { projection: { errors: 1 } },
    );
    if (!b) return res.status(404).json({ error: 'Không tìm thấy lô' });
    res.json({ errors: b.errors ?? [] });
  }),
);

export default imports;
