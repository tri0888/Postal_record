/**
 * Lõi xử lý Excel — chạy phía TRÌNH DUYỆT (màn hình "Nạp dữ liệu").
 *
 * Module này tồn tại để chống lại các bẫy dữ liệu đã phát hiện trong file nguồn:
 *
 *  1. NGÀY HOÀN lẫn lộn kiểu: có ô là Excel serial, có ô là chuỗi "09/10/2025".
 *  2. Cột nằm rải rác không liên tục + header 'NGÀY NHẬN (*) ' có dấu cách thừa
 *     => map theo TÊN header, không bao giờ theo vị trí.
 *  3. 'Mã quy trình' về dạng số thực 600.0 => phải làm tròn về số nguyên.
 *  4. SỐ HỒ SƠ một mình KHÔNG duy nhất => khoá là cặp (soHoSo, maDonVi).
 *  6. Ngày theo chuẩn Việt Nam dd/mm/yyyy, không phải mm/dd/yyyy.
 *  7. 'Mã số thuế' / 'Điện thoại' có số 0 đứng đầu => luôn giữ dạng chuỗi.
 */

import { normalizeChuyenQuan, stripAccents } from './normalize.js';

/* ------------------------------------------------------------------ */
/* Chuẩn hoá header                                                     */
/* ------------------------------------------------------------------ */

/**
 * Rút header về "khoá lỏng": bỏ (*), bỏ mọi dấu câu và khoảng trắng, viết hoa.
 * Nhờ vậy 'NGÀY NHẬN (*) ' và 'THẺ,TỜ RỜI, BÌA' đều khớp ổn định.
 * @param {unknown} raw
 * @returns {string}
 */
export function looseKey(raw) {
  return String(raw ?? '')
    .replace(/\(\s*\*\s*\)/g, ' ')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function looseKeyNoAccent(raw) {
  return stripAccents(looseKey(raw));
}

/**
 * Định nghĩa một trường: tên trường + các biến thể header chấp nhận được.
 * @typedef {{ field: string, aliases: string[] }} FieldSpec
 */

// Cột "STT" của file Excel cố tình KHÔNG được đọc: nó chỉ là số đếm dòng, mỗi file
// lại đánh lại từ 1 nên vô nghĩa khi gộp nhiều đợt nạp. Màn hình tự đánh số lại.
/** @type {FieldSpec[]} */
export const RECORD_FIELDS = [
  { field: 'soHoSo', aliases: ['SỐ HỒ SƠ', 'SO HO SO', 'SỐ HỒSƠ'] },
  { field: 'maQuyTrinh', aliases: ['MÃ QUY TRÌNH', 'MA QUY TRINH'] },
  { field: 'maDonVi', aliases: ['MÃ ĐƠN VỊ', 'MA DON VI', 'MÃ ĐV'] },
  { field: 'loaiTaiLieu', aliases: ['THẺ,TỜ RỜI, BÌA', 'THẺ TỜ RỜI BÌA', 'LOẠI TÀI LIỆU'] },
  { field: 'ngayNhan', aliases: ['NGÀY NHẬN', 'NGAY NHAN'] },
  { field: 'ngayTra', aliases: ['NGÀY TRẢ', 'NGAY TRA'] },
  { field: 'ngayHoan', aliases: ['NGÀY HOÀN', 'NGAY HOAN'] },
];

/** @type {FieldSpec[]} */
export const UNIT_FIELDS = [
  { field: 'code', aliases: ['MÃ ĐV', 'MÃ ĐƠN VỊ', 'MA DV'] },
  { field: 'name', aliases: ['TÊN ĐƠN VỊ', 'TEN DON VI'] },
  { field: 'address', aliases: ['ĐỊA CHỈ', 'DIA CHI'] },
  { field: 'bankAccount', aliases: ['TÀI KHOẢN', 'TAI KHOAN'] },
  { field: 'phone', aliases: ['ĐIỆN THOẠI/FAX', 'ĐIỆN THOẠI', 'DIEN THOAI'] },
  { field: 'chuyenQuan', aliases: ['CHUYÊN QUẢN', 'CHUYEN QUAN'] },
  { field: 'taxCode', aliases: ['MÃ SỐ THUẾ', 'MA SO THUE', 'MST'] },
];

/**
 * Map header row -> { tên trường: chỉ số cột }.
 * Khớp 2 lượt: có dấu trước, không dấu sau (phòng khi ai đó gõ thiếu dấu).
 * @param {unknown[]} headerRow
 * @param {FieldSpec[]} specs
 * @returns {Record<string, number>}
 */
export function mapColumns(headerRow, specs) {
  const exact = new Map();
  const noAccent = new Map();

  headerRow.forEach((cell, idx) => {
    const k = looseKey(cell);
    if (!k) return;
    if (!exact.has(k)) exact.set(k, idx);
    const n = looseKeyNoAccent(cell);
    if (!noAccent.has(n)) noAccent.set(n, idx);
  });

  const map = {};
  for (const spec of specs) {
    for (const alias of spec.aliases) {
      const hit = exact.get(looseKey(alias)) ?? noAccent.get(looseKeyNoAccent(alias));
      if (hit !== undefined) {
        map[spec.field] = hit;
        break;
      }
    }
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Ngày tháng — hàm quan trọng nhất của hệ thống                        */
/* ------------------------------------------------------------------ */

function isRealDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function fmt(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Đổi Excel serial sang 'YYYY-MM-DD'.
 * Mốc là 1899-12-30. Excel coi nhầm 1900 là năm nhuận nên với serial <= 59
 * phải cộng bù 1 ngày; serial 60 là ngày ma 29/02/1900 (không tồn tại).
 * @param {number} serial
 * @returns {string|null}
 */
export function excelSerialToISO(serial) {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 2958465) return null;
  const days = Math.floor(serial);
  const adjusted = days <= 59 ? days + 1 : days;
  const ms = Date.UTC(1899, 11, 30) + adjusted * 86400000;
  const dt = new Date(ms);
  return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/**
 * Đọc một ô ngày ở BẤT KỲ dạng nào Excel có thể trả về và luôn cho ra
 * 'YYYY-MM-DD' (hoặc null nếu ô trống / không đọc được).
 *
 * Đây là hàm gánh bẫy #1: trong 'NGÀY HOÀN' có ô số (serial) lẫn với ô CHUỖI
 * "09/10/2025". Nếu chỉ xử lý một dạng thì một phần hồ sơ sẽ biến mất khỏi
 * kết quả tra cứu.
 *
 * @param {unknown} value
 * @returns {{ iso: string|null, error?: string }}
 */
export function parseNgay(value) {
  if (value === null || value === undefined || value === '') return { iso: null };

  // SheetJS trả về Date khi bật cellDates — đọc theo giờ địa phương vì SheetJS
  // dựng Date bằng các thành phần local.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { iso: null, error: 'Ngày không hợp lệ' };
    return { iso: fmt(value.getFullYear(), value.getMonth() + 1, value.getDate()) };
  }

  if (typeof value === 'number') {
    const iso = excelSerialToISO(value);
    return iso ? { iso } : { iso: null, error: `Số ngày Excel không hợp lệ: ${value}` };
  }

  const s = String(value).trim();
  if (!s) return { iso: null };

  // Chuỗi thuần số => vẫn là serial, chỉ khác là bị lưu dạng text.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const iso = excelSerialToISO(Number(s));
    if (iso) return { iso };
  }

  // Bỏ phần giờ nếu có: "09/10/2025 00:00:00"
  const datePart = s.split(/[T\s]/)[0];

  // dd/mm/yyyy — ƯU TIÊN kiểu Việt Nam. Đã kiểm chứng bằng dữ liệu thật:
  // các ô text "09/10/2025" nằm xen giữa các ô serial 07/10, 08/10, 10/10.
  let m = datePart.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);
    if (m[3].length === 2) y += y < 70 ? 2000 : 1900;
    if (isRealDate(y, mo, d)) return { iso: fmt(y, mo, d) };
    return { iso: null, error: `Ngày không hợp lệ: "${s}"` };
  }

  // yyyy-mm-dd
  m = datePart.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (isRealDate(y, mo, d)) return { iso: fmt(y, mo, d) };
    return { iso: null, error: `Ngày không hợp lệ: "${s}"` };
  }

  return { iso: null, error: `Không đọc được ngày: "${s}"` };
}

/* ------------------------------------------------------------------ */
/* Ép kiểu ô                                                            */
/* ------------------------------------------------------------------ */

/**
 * Luôn trả về chuỗi, giữ nguyên số 0 đứng đầu (bẫy #7 — 'Mã số thuế'
 * 0100000000 không được biến thành 100000000) và không để lọt ký hiệu mũ.
 * @param {unknown} value
 * @returns {string|null}
 */
export function asText(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const s = String(value);
    return s.includes('e') || s.includes('E') ? value.toFixed(0) : s;
  }
  const s = String(value).trim();
  return s === '' ? null : s;
}

/**
 * Số nguyên dạng chuỗi: 600.0 -> "600" (bẫy #3).
 * @param {unknown} value
 * @returns {string|null}
 */
export function asIntText(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(Math.round(value)) : null;
  }
  const s = String(value).trim();
  if (s === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return String(Math.round(Number(s)));
  return s;
}

/**
 * Tách mã cơ quan từ đuôi số hồ sơ: '29336/2025/07913' -> '07913'.
 * @param {string|null} soHoSo
 * @returns {string|null}
 */
export function extractMaCoQuan(soHoSo) {
  if (!soHoSo) return null;
  const parts = soHoSo.split('/');
  const last = parts[parts.length - 1]?.trim();
  return last && /^\d+$/.test(last) ? last : null;
}

/* ------------------------------------------------------------------ */
/* Nhận diện sheet / dòng header                                        */
/* ------------------------------------------------------------------ */

/**
 * Tìm dòng header trong 15 dòng đầu: dòng nào map được nhiều trường bắt buộc
 * nhất thì thắng. Nhờ vậy không phụ thuộc vào việc header nằm ở dòng 0 hay 1.
 */
function findHeaderRow(rows, specs, required) {
  let best = null;
  const limit = Math.min(rows.length, 15);

  for (let i = 0; i < limit; i++) {
    const map = mapColumns(rows[i] ?? [], specs);
    if (!required.every((f) => map[f] !== undefined)) continue;
    const score = Object.keys(map).length;
    if (!best || score > best.score) best = { index: i, map, score };
  }
  return best ? { index: best.index, map: best.map } : null;
}

/**
 * @typedef {{ name: string, rows: unknown[][] }} SheetLike
 * @typedef {{ kind: 'RECORDS'|'UNITS', sheetName: string, headerRowIndex: number,
 *             columnMap: Record<string, number> }} DetectedSheet
 */

/**
 * Nhận diện file thuộc loại nào bằng chữ ký header, không bắt người dùng chọn.
 * Sheet rỗng hoặc không khớp chữ ký nào sẽ bị bỏ qua — nhờ vậy file nhiều sheet
 * vẫn chỉ lấy đúng sheet có đủ cột bắt buộc.
 * @param {SheetLike[]} sheets
 * @returns {DetectedSheet|null}
 */
export function detectSheet(sheets) {
  // Ưu tiên kiểm tra RECORDS trước: sheet hồ sơ cũng có cột 'MÃ ĐƠN VỊ',
  // nếu xét UNITS trước sẽ nhận nhầm.
  for (const sheet of sheets) {
    const hit = findHeaderRow(sheet.rows, RECORD_FIELDS, ['soHoSo', 'maDonVi']);
    if (hit) {
      return {
        kind: 'RECORDS',
        sheetName: sheet.name,
        headerRowIndex: hit.index,
        columnMap: hit.map,
      };
    }
  }
  for (const sheet of sheets) {
    const hit = findHeaderRow(sheet.rows, UNIT_FIELDS, ['code', 'name']);
    if (hit) {
      return {
        kind: 'UNITS',
        sheetName: sheet.name,
        headerRowIndex: hit.index,
        columnMap: hit.map,
      };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Chuẩn hoá dòng                                                       */
/* ------------------------------------------------------------------ */

function cell(row, map, field) {
  const idx = map[field];
  return idx === undefined ? null : row[idx];
}

function isBlankRow(row) {
  return !row || row.every((c) => c === null || c === undefined || String(c).trim() === '');
}

/**
 * Đọc sheet hồ sơ đã nhận diện thành các dòng đã chuẩn hoá.
 * @param {SheetLike} sheet
 * @param {DetectedSheet} detected
 */
export function parseRecords(sheet, detected) {
  const { columnMap: map, headerRowIndex } = detected;
  const rows = [];
  const errors = [];
  let totalDataRows = 0;

  for (let i = headerRowIndex + 1; i < sheet.rows.length; i++) {
    const raw = sheet.rows[i];
    if (isBlankRow(raw)) continue;
    totalDataRows++;
    const excelRow = i + 1; // Excel đếm từ 1

    const soHoSo = asText(cell(raw, map, 'soHoSo'));
    const maDonVi = asText(cell(raw, map, 'maDonVi'))?.toUpperCase() ?? null;

    if (!soHoSo) {
      errors.push({ excelRow, field: 'soHoSo', message: 'Thiếu SỐ HỒ SƠ' });
      continue;
    }
    if (!maDonVi) {
      errors.push({ excelRow, field: 'maDonVi', message: 'Thiếu MÃ ĐƠN VỊ' });
      continue;
    }

    const dates = {};
    let dateFailed = false;
    for (const f of ['ngayNhan', 'ngayTra', 'ngayHoan']) {
      const r = parseNgay(cell(raw, map, f));
      if (r.error) {
        errors.push({ excelRow, field: f, message: r.error });
        dateFailed = true;
      }
      dates[f] = r.iso;
    }
    if (dateFailed) continue;

    rows.push({
      excelRow,
      data: {
        soHoSo,
        maQuyTrinh: asIntText(cell(raw, map, 'maQuyTrinh')),
        maDonVi,
        maCoQuan: extractMaCoQuan(soHoSo),
        loaiTaiLieu: asText(cell(raw, map, 'loaiTaiLieu')),
        ngayNhan: dates.ngayNhan,
        ngayTra: dates.ngayTra,
        ngayHoan: dates.ngayHoan,
      },
    });
  }

  return {
    kind: 'RECORDS',
    sheetName: detected.sheetName,
    headerRowIndex,
    columnMap: map,
    rows,
    errors,
    totalDataRows,
  };
}

/**
 * Đọc sheet danh mục đơn vị đã nhận diện thành các dòng đã chuẩn hoá.
 * @param {SheetLike} sheet
 * @param {DetectedSheet} detected
 */
export function parseUnits(sheet, detected) {
  const { columnMap: map, headerRowIndex } = detected;
  const rows = [];
  const errors = [];
  const seen = new Set();
  let totalDataRows = 0;

  for (let i = headerRowIndex + 1; i < sheet.rows.length; i++) {
    const raw = sheet.rows[i];
    if (isBlankRow(raw)) continue;
    totalDataRows++;
    const excelRow = i + 1;

    const code = asText(cell(raw, map, 'code'))?.toUpperCase() ?? null;
    if (!code) {
      errors.push({ excelRow, field: 'code', message: 'Thiếu Mã ĐV' });
      continue;
    }
    if (seen.has(code)) {
      errors.push({ excelRow, field: 'code', message: `Mã ĐV trùng trong file: ${code}` });
      continue;
    }
    seen.add(code);

    rows.push({
      excelRow,
      data: {
        code,
        name: asText(cell(raw, map, 'name')),
        address: asText(cell(raw, map, 'address')),
        // Ba trường dưới dùng asText để giữ số 0 đứng đầu (bẫy #7).
        bankAccount: asText(cell(raw, map, 'bankAccount')),
        phone: asText(cell(raw, map, 'phone')),
        // Ô này hay chứa nhiều người + trùng lặp => chuẩn hoá ngay lúc đọc file.
        chuyenQuan: normalizeChuyenQuan(cell(raw, map, 'chuyenQuan')).display,
        taxCode: asText(cell(raw, map, 'taxCode')),
      },
    });
  }

  return {
    kind: 'UNITS',
    sheetName: detected.sheetName,
    headerRowIndex,
    columnMap: map,
    rows,
    errors,
    totalDataRows,
  };
}
