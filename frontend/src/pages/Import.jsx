import { useEffect, useState } from 'react';
import { detectSheet, parseRecords, parseUnits } from '@shared/excel.js';
import { IMPORT_CHUNK } from '@shared/constants.js';
import { api } from '../lib/api';
import { toVN, toVNDateTime } from '../lib/format';
import { Alert, Badge, Button, Card, Empty, Modal, Spinner } from '../components/ui';

function keyOf(kind, r) {
  return kind === 'UNITS' ? r.code : `${r.soHoSo}\t${r.maDonVi}`;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function Import() {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [prepared, setPrepared] = useState(null);
  const [tab, setTab] = useState('new');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [batches, setBatches] = useState(null);

  const loadBatches = () =>
    api
      .importBatches()
      .then((r) => setBatches(r.items))
      .catch(() => setBatches([]));

  useEffect(() => {
    loadBatches();
  }, []);

  /* -------------------------------------------------------------- */
  /* Bước 1: đọc + phân tích file NGAY TRÊN TRÌNH DUYỆT              */
  /* -------------------------------------------------------------- */
  async function onFile(file) {
    setBusy(true);
    setError('');
    setResult(null);
    setPrepared(null);
    setStage('Đang đọc file...');

    try {
      // Nạp SheetJS theo yêu cầu để không làm nặng lần tải trang đầu tiên.
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      // raw: true => tự kiểm soát việc đổi kiểu trong parseNgay,
      // tránh mọi mơ hồ về múi giờ.
      const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: true });

      const sheets = wb.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(wb.Sheets[name], {
          header: 1,
          raw: true,
          defval: null,
          blankrows: false,
        }),
      }));

      const detected = detectSheet(sheets);
      if (!detected) {
        throw new Error(
          'Không nhận diện được dữ liệu trong file. File cần có cột "SỐ HỒ SƠ" + "MÃ ĐƠN VỊ" (dữ liệu hồ sơ) hoặc "Mã ĐV" + "Tên đơn vị" (danh mục đơn vị).',
        );
      }

      const sheet = sheets.find((s) => s.name === detected.sheetName);
      const parsed =
        detected.kind === 'RECORDS' ? parseRecords(sheet, detected) : parseUnits(sheet, detected);

      setStage('Đang đối chiếu với dữ liệu đã có...');

      // Hỏi máy chủ xem những khoá nào đã tồn tại => biết trước sẽ ghi đè bao nhiêu.
      const keys = parsed.rows.map((r) => keyOf(detected.kind, r.data));
      const existing = new Set();
      for (const group of chunk(keys, 2000)) {
        const r = await api.importCheck(detected.kind, group);
        r.existing.forEach((k) => existing.add(k));
      }

      const rows = parsed.rows;
      const overwriteRows = rows.filter((r) => existing.has(keyOf(detected.kind, r.data)));
      const newRows = rows.filter((r) => !existing.has(keyOf(detected.kind, r.data)));

      setPrepared({
        kind: detected.kind,
        fileName: file.name,
        detected,
        skippedSheets: sheets.map((s) => s.name).filter((n) => n !== detected.sheetName),
        rows,
        errors: parsed.errors,
        totalDataRows: parsed.totalDataRows,
        newRows,
        overwriteRows,
      });
      setTab(overwriteRows.length ? 'over' : 'new');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đọc được file');
    } finally {
      setBusy(false);
      setStage('');
    }
  }

  /* -------------------------------------------------------------- */
  /* Bước 2: nạp thật sau khi người dùng xác nhận                    */
  /* -------------------------------------------------------------- */
  async function commit() {
    if (!prepared) return;
    setConfirmOpen(false);
    setBusy(true);
    setError('');
    setProgress(0);

    try {
      const { batchId } = await api.importBegin(
        prepared.kind,
        prepared.fileName,
        prepared.detected.sheetName,
      );

      let inserted = 0;
      let updated = 0;
      const unknown = new Set();
      const groups = chunk(prepared.rows, IMPORT_CHUNK);

      for (let i = 0; i < groups.length; i++) {
        setStage(`Đang import lô ${i + 1}/${groups.length}...`);
        const r = await api.importCommit(
          batchId,
          prepared.kind,
          groups[i].map((x) => x.data),
        );
        inserted += r.inserted;
        updated += r.updated;
        r.unknownUnitCodes?.forEach((c) => unknown.add(c));
        setProgress(Math.round(((i + 1) / groups.length) * 100));
      }

      await api.importFinish({
        batchId,
        totalRows: prepared.totalDataRows,
        inserted,
        updated,
        errors: prepared.errors,
      });

      setResult({ inserted, updated, unknownUnitCodes: [...unknown] });
      setPrepared(null);
      loadBatches();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import dữ liệu thất bại');
    } finally {
      setBusy(false);
      setStage('');
    }
  }

  const kindLabel = (k) => (k === 'RECORDS' ? 'Dữ liệu hồ sơ' : 'Danh mục đơn vị');

  return (
    <div className="space-y-4">
      <Card title="Import dữ liệu từ file Excel">
        <div className="space-y-3">
          <input
            type="file"
            accept=".xls,.xlsx"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
            className="block w-full cursor-pointer rounded-md border border-slate-300 bg-white p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-sky-700 file:px-3 file:py-1.5 file:text-white hover:file:bg-sky-800"
          />

          {busy && <Spinner label={stage || 'Đang xử lý...'} />}
          {busy && progress > 0 && (
            <div className="h-2 w-full overflow-hidden rounded bg-slate-200">
              <div className="h-full bg-sky-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          {error && <Alert kind="error">{error}</Alert>}

          {result && (
            <Alert kind="success">
              Đã import xong: <b>{result.inserted}</b> dòng thêm mới, <b>{result.updated}</b> dòng cập
              nhật.
              {result.unknownUnitCodes.length > 0 && (
                <div className="mt-2 text-amber-800">
                  Có {result.unknownUnitCodes.length} mã đơn vị chưa có trong danh mục:{' '}
                  <span className="font-mono">
                    {result.unknownUnitCodes.slice(0, 20).join(', ')}
                    {result.unknownUnitCodes.length > 20 && '…'}
                  </span>
                </div>
              )}
            </Alert>
          )}
        </div>
      </Card>

      {prepared && (
        <Card
          title={
            <span className="flex flex-wrap items-center gap-2">
              Xem trước — {prepared.fileName}
              <Badge kind="sky">{kindLabel(prepared.kind)}</Badge>
              <Badge>sheet: {prepared.detected.sheetName}</Badge>
            </span>
          }
          actions={
            <>
              <Button variant="ghost" onClick={() => setPrepared(null)}>
                Huỷ
              </Button>
              <Button
                onClick={() => {
                  setConfirmChecked(false);
                  if (prepared.overwriteRows.length > 0) setConfirmOpen(true);
                  else commit();
                }}
                disabled={prepared.rows.length === 0}
              >
                Import vào hệ thống
              </Button>
            </>
          }
        >
          {prepared.skippedSheets.length > 0 && (
            <p className="mb-3 text-xs text-slate-500">
              Các sheet đã bỏ qua vì không đúng cấu trúc: <b>{prepared.skippedSheets.join(', ')}</b>
            </p>
          )}

          {prepared.overwriteRows.length > 0 && (
            <div className="mb-3">
              <Alert kind="warning">
                <b>{prepared.overwriteRows.length}</b> dòng đã tồn tại trong hệ thống và{' '}
                <b>sẽ bị ghi đè</b> bằng dữ liệu mới. Hãy kiểm tra tab &quot;Sẽ ghi đè&quot; trước
                khi xác nhận.
              </Alert>
            </div>
          )}

          <div className="mb-3 flex flex-wrap gap-2">
            {[
              ['new', `Thêm mới (${prepared.newRows.length})`],
              ['over', `Sẽ ghi đè (${prepared.overwriteRows.length})`],
              ['err', `Lỗi (${prepared.errors.length})`],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  tab === k
                    ? 'bg-sky-700 text-white'
                    : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'err' ? (
            prepared.errors.length === 0 ? (
              <Empty>Không có dòng nào bị lỗi.</Empty>
            ) : (
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-2 text-left">Dòng Excel</th>
                      <th className="px-3 py-2 text-left">Cột</th>
                      <th className="px-3 py-2 text-left">Lý do</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prepared.errors.slice(0, 300).map((e, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2">{e.excelRow}</td>
                        <td className="px-3 py-2 font-mono text-xs">{e.field}</td>
                        <td className="px-3 py-2 text-red-700">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <PreviewTable
              kind={prepared.kind}
              rows={tab === 'new' ? prepared.newRows : prepared.overwriteRows}
            />
          )}
        </Card>
      )}

      {/* <Card title="Lịch sử import dữ liệu">
        {batches === null ? (
          <Spinner />
        ) : batches.length === 0 ? (
          <Empty>Chưa có lần import nào.</Empty>
        ) : (
          <div className="table-scroll">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">Thời điểm</th>
                  <th className="px-3 py-2 text-left">Loại</th>
                  <th className="px-3 py-2 text-left">File</th>
                  <th className="px-3 py-2 text-left">Sheet</th>
                  <th className="px-3 py-2 text-right">Thêm mới</th>
                  <th className="px-3 py-2 text-right">Cập nhật</th>
                  <th className="px-3 py-2 text-right">Lỗi</th>
                  <th className="px-3 py-2 text-left">Người import</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-3 py-2">{toVNDateTime(b.createdAt)}</td>
                    <td className="px-3 py-2">
                      <Badge kind={b.kind === 'RECORDS' ? 'sky' : 'slate'}>
                        {kindLabel(b.kind)}
                      </Badge>
                    </td>
                    <td className="max-w-[16rem] truncate px-3 py-2">{b.fileName}</td>
                    <td className="px-3 py-2 text-slate-500">{b.sheetName}</td>
                    <td className="px-3 py-2 text-right font-medium text-emerald-700">
                      {b.inserted}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-amber-700">{b.updated}</td>
                    <td className="px-3 py-2 text-right">{b.errorCount || ''}</td>
                    <td className="px-3 py-2">{b.uploadedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card> */}

      <Modal
        open={confirmOpen}
        title="Xác nhận ghi đè dữ liệu"
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Quay lại
            </Button>
            <Button variant="danger" disabled={!confirmChecked} onClick={commit}>
              Xác nhận import
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Có <b className="text-red-700">{prepared?.overwriteRows.length}</b> bản ghi đã tồn tại
          trong hệ thống. Nếu tiếp tục, dữ liệu cũ của các bản ghi này sẽ{' '}
          <b>bị thay thế hoàn toàn</b> bằng dữ liệu trong file <b>{prepared?.fileName}</b>. Thao tác
          này không thể hoàn tác.
        </p>
        <p className="mt-2 text-sm text-slate-700">
          Đồng thời sẽ thêm mới <b>{prepared?.newRows.length}</b> bản ghi.
        </p>
        <label className="mt-4 flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm">
          <input
            type="checkbox"
            checked={confirmChecked}
            onChange={(e) => setConfirmChecked(e.target.checked)}
            className="mt-0.5"
          />
          <span>Tôi đã kiểm tra danh sách và đồng ý ghi đè.</span>
        </label>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PreviewTable({ kind, rows }) {
  if (rows.length === 0) return <Empty>Không có dòng nào.</Empty>;
  const shown = rows.slice(0, 200);

  if (kind === 'UNITS') {
    return (
      <>
        <div className="table-scroll">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="px-3 py-2 text-left">Dòng</th>
                <th className="px-3 py-2 text-left">Mã ĐV</th>
                <th className="px-3 py-2 text-left">Tên đơn vị</th>
                <th className="px-3 py-2 text-left">Địa chỉ</th>
                <th className="px-3 py-2 text-left">Điện thoại</th>
                <th className="px-3 py-2 text-left">Mã số thuế</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ excelRow, data: u }) => (
                <tr key={excelRow} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-400">{excelRow}</td>
                  <td className="px-3 py-2 font-mono text-xs">{u.code}</td>
                  <td className="max-w-[22rem] truncate px-3 py-2">{u.name}</td>
                  <td className="max-w-[20rem] truncate px-3 py-2 text-slate-500">{u.address}</td>
                  <td className="px-3 py-2">{u.phone}</td>
                  <td className="px-3 py-2 font-mono text-xs">{u.taxCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > shown.length && (
          <p className="pt-2 text-xs text-slate-500">
            Đang hiện {shown.length} trên {rows.length} dòng.
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <div className="table-scroll">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">Dòng</th>
              <th className="px-3 py-2 text-left">Số hồ sơ</th>
              <th className="px-3 py-2 text-left">Mã đơn vị</th>
              <th className="px-3 py-2 text-left">Quy trình</th>
              <th className="px-3 py-2 text-left">Loại</th>
              <th className="px-3 py-2 text-left">Ngày nhận</th>
              <th className="px-3 py-2 text-left">Ngày trả</th>
              <th className="px-3 py-2 text-left">Ngày hoàn</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ excelRow, data: r }) => (
              <tr key={excelRow} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-400">{excelRow}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.soHoSo}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.maDonVi}</td>
                <td className="px-3 py-2 text-slate-500">{r.maQuyTrinh}</td>
                <td className="px-3 py-2">{r.loaiTaiLieu}</td>
                <td className="whitespace-nowrap px-3 py-2">{toVN(r.ngayNhan)}</td>
                <td className="whitespace-nowrap px-3 py-2">{toVN(r.ngayTra)}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-sky-800">
                  {toVN(r.ngayHoan)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && (
        <p className="pt-2 text-xs text-slate-500">
          Đang hiện {shown.length} trên {rows.length} dòng.
        </p>
      )}
    </>
  );
}
