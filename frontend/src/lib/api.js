export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * Giao diện và API cùng gốc (Vite proxy `/api` sang server ở cổng 3000), nên chỉ
 * cần `credentials: 'same-origin'` là cookie phiên tự đi kèm mọi request.
 */
async function request(path, init) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) throw new ApiError(data.error ?? `Lỗi ${res.status}`, res.status);
  return data;
}

export const api = {
  /* ---------------- Đăng nhập ---------------- */

  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  logout: () => request('/api/auth/logout', { method: 'POST' }),

  me: () => request('/api/auth/me'),

  /* ---------------- Tra cứu hồ sơ ---------------- */

  searchRecords: (params) => request(`/api/records?${new URLSearchParams(params)}`),

  recordSummary: (params) => request(`/api/records/summary?${new URLSearchParams(params)}`),

  exportRecords: (params) => request(`/api/records/export?${new URLSearchParams(params)}`),

  facets: () => request('/api/records/facets'),

  deleteRecord: (id) => request(`/api/records/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /* ---------------- Danh mục đơn vị ---------------- */

  searchUnits: (params) => request(`/api/units?${new URLSearchParams(params)}`),

  getUnit: (code) => request(`/api/units/${encodeURIComponent(code)}`),

  createUnit: (body) => request('/api/units', { method: 'POST', body: JSON.stringify(body) }),

  updateUnit: (code, body) =>
    request(`/api/units/${encodeURIComponent(code)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteUnit: (code) => request(`/api/units/${encodeURIComponent(code)}`, { method: 'DELETE' }),

  /* ---------------- Nạp dữ liệu ---------------- */

  importCheck: (kind, keys) =>
    request('/api/import/check', { method: 'POST', body: JSON.stringify({ kind, keys }) }),

  importBegin: (kind, fileName, sheetName) =>
    request('/api/import/begin', {
      method: 'POST',
      body: JSON.stringify({ kind, fileName, sheetName }),
    }),

  importCommit: (batchId, kind, rows) =>
    request('/api/import/commit', {
      method: 'POST',
      body: JSON.stringify({ batchId, kind, rows }),
    }),

  importFinish: (body) =>
    request('/api/import/finish', { method: 'POST', body: JSON.stringify(body) }),

  importBatches: () => request('/api/import/batches'),
};
