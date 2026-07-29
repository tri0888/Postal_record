import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { toVN } from '../lib/format';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Pagination,
  Select,
  Spinner,
} from '../components/ui';
import { Combobox } from '../components/Combobox';
import {
  DateFilter,
  EMPTY_DATE_GROUP,
  dateGroupActive,
  dateGroupParams,
} from '../components/DateFilter';

const EMPTY = {
  maDonVi: '',
  tenDonVi: '',
  soHoSo: '',
  loaiTaiLieu: '',
  maQuyTrinh: '',
  chuyenQuan: '',
  ngayHoan: EMPTY_DATE_GROUP,
  ngayNhan: EMPTY_DATE_GROUP,
  ngayTra: EMPTY_DATE_GROUP,
};

const TEXT_FIELDS = ['maDonVi', 'tenDonVi', 'soHoSo', 'loaiTaiLieu', 'maQuyTrinh', 'chuyenQuan'];

const DATE_FIELDS = ['ngayHoan', 'ngayNhan', 'ngayTra'];

function toParams(f, extra = {}) {
  const out = { ...extra };

  for (const k of TEXT_FIELDS) {
    if (f[k].trim()) out[k] = f[k].trim();
  }

  // Không tích "từ ngày → đến ngày" thì from = to = đúng ngày đang chọn.
  for (const k of DATE_FIELDS) {
    const { from, to } = dateGroupParams(f[k]);
    if (from) out[`${k}From`] = from;
    if (to) out[`${k}To`] = to;
  }

  return out;
}

function countActive(f) {
  let n = 0;
  for (const k of TEXT_FIELDS) if (f[k].trim()) n++;
  for (const k of DATE_FIELDS) if (dateGroupActive(f[k])) n++;
  return n;
}

export default function Search() {
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  // Mặc định là thứ tự gốc (thứ tự nhập liệu) — giống khi mở thẳng file Excel.
  // Cột STT trên bảng chỉ là số đếm dòng, nên sắp xếp theo 'id' mới là "về gốc".
  const [sort, setSort] = useState('id');
  const [dir, setDir] = useState('asc');

  const [data, setData] = useState(null);
  const [facets, setFacets] = useState({ loaiTaiLieu: [], maQuyTrinh: [], chuyenQuan: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api
      .facets()
      .then(setFacets)
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = toParams(applied, {
        page: String(page),
        pageSize: String(pageSize),
        sort,
        dir,
      });
      const list = await api.searchRecords(params);
      setData({ items: list.items, total: list.total });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [applied, page, pageSize, sort, dir]);

  useEffect(() => {
    load();
  }, [load]);

  function submit() {
    setPage(1);
    setApplied(draft);
  }

  function reset() {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setPage(1);
  }

  function sortBy(col) {
    if (sort === col) setDir(dir === 'asc' ? 'desc' : 'asc');
    else {
      setSort(col);
      setDir('asc');
    }
    setPage(1);
  }

  /** Xuất Excel ngay tại trình duyệt — Cloud Function chỉ việc trả dữ liệu thô. */
  async function exportExcel() {
    setExporting(true);
    try {
      // Nạp SheetJS theo yêu cầu: thư viện nặng ~700 KB, không nên bắt người
      // chỉ vào tra cứu phải tải nó.
      const XLSX = await import('xlsx');
      const { items } = await api.exportRecords(toParams(applied, { sort, dir }));
      const rows = items.map((r, i) => ({
        STT: i + 1,
        'SỐ HỒ SƠ': r.soHoSo,
        'Mã quy trình': r.maQuyTrinh ?? '',
        'MÃ ĐƠN VỊ': r.maDonVi,
        'Tên đơn vị': r.tenDonVi ?? '',
        'Địa chỉ': r.diaChi ?? '',
        'Điện thoại': r.dienThoai ?? '',
        'Mã số thuế': r.maSoThue ?? '',
        'Chuyên quản': r.chuyenQuan ?? '',
        'THẺ,TỜ RỜI, BÌA': r.loaiTaiLieu ?? '',
        'NGÀY NHẬN': toVN(r.ngayNhan),
        'NGÀY TRẢ': toVN(r.ngayTra),
        'NGÀY HOÀN': toVN(r.ngayHoan),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Ho so hoan');
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Ho_so_hoan_${stamp}.xlsx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xuất Excel thất bại');
    } finally {
      setExporting(false);
    }
  }

  const th = (col, label) => (
    <th
      className="cursor-pointer whitespace-nowrap px-3 py-2 text-left font-semibold hover:bg-slate-200"
      onClick={() => sortBy(col)}
    >
      {label}
      {sort === col && <span className="ml-1 text-sky-700">{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );

  const totalFound = data?.total ?? 0;
  const activeCount = useMemo(() => countActive(applied), [applied]);

  return (
    <div className="space-y-4">
      <Card
        title="Bộ lọc tra cứu"
        actions={
          <>
            {activeCount > 0 && <Badge kind="sky">{activeCount} điều kiện</Badge>}
            <Button variant="ghost" onClick={reset}>
              Xoá lọc
            </Button>
            <Button onClick={submit}>Tra cứu</Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Field label="Mã đơn vị">
            <Input
              value={draft.maDonVi}
              onChange={(e) => setDraft({ ...draft, maDonVi: e.target.value })}
            />
          </Field>

          <DateFilter
            label="Ngày hoàn"
            value={draft.ngayHoan}
            onChange={(v) => setDraft({ ...draft, ngayHoan: v })}
          />
          <DateFilter
            label="Ngày trả"
            value={draft.ngayTra}
            onChange={(v) => setDraft({ ...draft, ngayTra: v })}
          />

          <div className="lg:col-span-1">
            <Field label="Chuyên quản">
              <Combobox
                value={draft.chuyenQuan}
                options={facets.chuyenQuan}
                onChange={(v) => setDraft({ ...draft, chuyenQuan: v })}
                placeholder="Gõ để tìm..."
              />
            </Field>
          </div>

          <Field label="Số dòng mỗi trang">
            <Select
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>

          <button type="submit" hidden />
        </form>
      </Card>

      <Card
        title={`Kết quả: ${totalFound.toLocaleString('vi-VN')} hồ sơ`}
        actions={
          <Button variant="secondary" onClick={exportExcel} disabled={exporting || !totalFound}>
            {exporting ? 'Đang xuất...' : 'Xuất Excel'}
          </Button>
        }
      >
        {error && <Alert kind="error">{error}</Alert>}
        {loading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <Empty>Không có hồ sơ nào khớp điều kiện tra cứu.</Empty>
        ) : (
          <>
            <div className="table-scroll">
              <table className="w-full min-w-[1300px] border-collapse text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    {th('id', 'STT')}
                    {th('soHoSo', 'Số hồ sơ')}
                    <th className="px-3 py-2 text-left font-semibold">Mã quy trình</th>
                    {th('maDonVi', 'Mã đơn vị')}
                    {th('tenDonVi', 'Tên đơn vị')}
                    <th className="px-3 py-2 text-left font-semibold">Chuyên quản</th>
                    <th className="px-3 py-2 text-left font-semibold">Thẻ/tờ rời/bìa</th>
                    {th('ngayNhan', 'Ngày nhận')}
                    {th('ngayTra', 'Ngày trả')}
                    {th('ngayHoan', 'Ngày hoàn')}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r, i) => (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-sky-50/60">
                      {/* STT chỉ là số đếm dòng, chạy tiếp qua từng trang. */}
                      <td className="px-3 py-2 text-slate-500">{(page - 1) * pageSize + i + 1}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{r.soHoSo}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">{r.maQuyTrinh}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                          {r.maDonVi}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="block max-w-[26rem] truncate" title={r.tenDonVi ?? ''}>
                          {r.tenDonVi ?? <em className="text-amber-700">Chưa có trong danh mục</em>}
                        </span>
                        {r.dienThoai && <span className="text-xs text-slate-400">{r.dienThoai}</span>}
                      </td>
                      {/* Một đơn vị có thể có hàng chục chuyên quản => cắt bớt, xem đủ ở tooltip. */}
                      <td className="px-3 py-2">
                        <span className="block max-w-[16rem] truncate" title={r.chuyenQuan ?? ''}>
                          {r.chuyenQuan}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{r.loaiTaiLieu}</td>
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
            <Pagination page={page} pageSize={pageSize} total={data.total} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
