import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  Pagination,
  Spinner,
} from '../components/ui';
import { Combobox } from '../components/Combobox';

const BLANK = {
  code: '',
  name: '',
  address: '',
  bankAccount: '',
  phone: '',
  chuyenQuan: '',
  taxCode: '',
  isActive: true,
};

export default function Units() {
  const [q, setQ] = useState('');
  const [applied, setApplied] = useState('');
  const [chuyenQuan, setChuyenQuan] = useState('');
  const [chuyenQuanList, setChuyenQuanList] = useState([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const pageSize = 50;

  useEffect(() => {
    api
      .facets()
      .then((f) => setChuyenQuanList(f.chuyenQuan))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page: String(page), pageSize: String(pageSize) };
      if (applied.trim()) params.q = applied.trim();
      if (chuyenQuan) params.chuyenQuan = chuyenQuan;
      const r = await api.searchUnits(params);
      setData({ items: r.items, total: r.total });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh mục');
    } finally {
      setLoading(false);
    }
  }, [applied, chuyenQuan, page]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    setFormError('');
    try {
      if (isNew) await api.createUnit(editing);
      else await api.updateUnit(editing.code, editing);
      setEditing(null);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  }

  async function remove(u) {
    if (!confirm(`Xoá đơn vị ${u.code} — ${u.name ?? ''}?`)) return;
    try {
      await api.deleteUnit(u.code);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xoá thất bại');
    }
  }

  return (
    <div className="space-y-4">
      <Card
        title="Danh mục đơn vị"
        actions={
          <Button
            onClick={() => {
              setEditing({ ...BLANK });
              setIsNew(true);
              setFormError('');
            }}
          >
            Thêm đơn vị
          </Button>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setApplied(q);
          }}
          className="grid gap-3 sm:grid-cols-3"
        >
          <div className="sm:col-span-2">
            <Field label="Tìm theo mã hoặc tên đơn vị">
              <Input value={q} onChange={(e) => setQ(e.target.value)} />
            </Field>
          </div>
          <Field label="Chuyên quản">
            <Combobox
              value={chuyenQuan}
              options={chuyenQuanList}
              onChange={(v) => {
                setChuyenQuan(v);
                setPage(1);
              }}
              placeholder="Gõ để tìm..."
            />
          </Field>
          <button type="submit" hidden />
        </form>

        <div className="mt-3 flex gap-2">
          <Button
            onClick={() => {
              setPage(1);
              setApplied(q);
            }}
          >
            Tìm
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setQ('');
              setApplied('');
              setChuyenQuan('');
              setPage(1);
            }}
          >
            Xoá lọc
          </Button>
        </div>
      </Card>

      <Card title={`Kết quả: ${(data?.total ?? 0).toLocaleString('vi-VN')} đơn vị`}>
        {error && <Alert kind="error">{error}</Alert>}
        {loading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <Empty>Không tìm thấy đơn vị nào.</Empty>
        ) : (
          <>
            <div className="table-scroll">
              <table className="w-full min-w-[1400px] text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  {/* Thứ tự cột giữ đúng như file danh mục gốc. */}
                  <tr>
                    <th className="px-3 py-2 text-left">STT</th>
                    <th className="px-3 py-2 text-left">Mã ĐV</th>
                    <th className="px-3 py-2 text-left">Tên đơn vị</th>
                    <th className="px-3 py-2 text-left">Địa chỉ</th>
                    <th className="px-3 py-2 text-left">Tài khoản</th>
                    <th className="px-3 py-2 text-left">Điện thoại</th>
                    <th className="px-3 py-2 text-left">Chuyên quản</th>
                    <th className="px-3 py-2 text-left">Mã số thuế</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u, i) => (
                    <tr key={u.code} className="border-t border-slate-100 hover:bg-sky-50/60">
                      {/* STT chỉ là số đếm dòng, chạy tiếp qua từng trang. */}
                      <td className="px-3 py-2 text-slate-500">{(page - 1) * pageSize + i + 1}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                        {u.code}
                        {!u.isActive && (
                          <span className="ml-1">
                            <Badge kind="red">ngừng</Badge>
                          </span>
                        )}
                      </td>
                      <td className="max-w-[24rem] truncate px-3 py-2" title={u.name ?? ''}>
                        {u.name}
                      </td>
                      <td
                        className="max-w-[20rem] truncate px-3 py-2 text-slate-500"
                        title={u.address ?? ''}
                      >
                        {u.address}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                        {u.bankAccount}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{u.phone}</td>
                      {/* Một đơn vị có thể có hàng chục chuyên quản => cắt bớt, xem đủ ở tooltip. */}
                      <td className="max-w-[16rem] truncate px-3 py-2" title={u.chuyenQuan ?? ''}>
                        {u.chuyenQuan}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{u.taxCode}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditing({ ...u });
                            setIsNew(false);
                            setFormError('');
                          }}
                        >
                          Sửa
                        </Button>
                        <Button variant="ghost" onClick={() => remove(u)}>
                          Xoá
                        </Button>
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

      <Modal
        open={!!editing}
        title={isNew ? 'Thêm đơn vị' : `Sửa đơn vị ${editing?.code ?? ''}`}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Huỷ
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            {formError && <Alert kind="error">{formError}</Alert>}
            <Field label="Mã đơn vị">
              <Input
                value={editing.code ?? ''}
                disabled={!isNew}
                onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Tên đơn vị">
              <Input
                value={editing.name ?? ''}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label="Địa chỉ">
              <Input
                value={editing.address ?? ''}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Điện thoại/Fax">
                <Input
                  value={editing.phone ?? ''}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                />
              </Field>
              <Field label="Mã số thuế">
                <Input
                  value={editing.taxCode ?? ''}
                  onChange={(e) => setEditing({ ...editing, taxCode: e.target.value })}
                />
              </Field>
              <Field label="Tài khoản">
                <Input
                  value={editing.bankAccount ?? ''}
                  onChange={(e) => setEditing({ ...editing, bankAccount: e.target.value })}
                />
              </Field>
              <Field label="Chuyên quản">
                <Input
                  value={editing.chuyenQuan ?? ''}
                  onChange={(e) => setEditing({ ...editing, chuyenQuan: e.target.value })}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.isActive !== false}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
              />
              Đang hoạt động
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
