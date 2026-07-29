import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { Button, Spinner } from './components/ui';
import Login from './pages/Login';
import Search from './pages/Search';
import Import from './pages/Import';
import Units from './pages/Units';

const LINKS = [
  ['/', 'Hồ sơ'],
  ['/danh-muc/don-vi', 'Danh mục đơn vị'],
  ['/nap-du-lieu', 'Nạp dữ liệu'],
];

function Nav() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <span className="font-semibold text-slate-800">Quản lý Hồ sơ Hoàn</span>

        <nav className="flex flex-wrap gap-1">
          {LINKS.map(([to, label]) => {
            const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  active ? 'bg-sky-700 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-slate-500">{user?.fullName || user?.username}</span>
          <Button variant="secondary" onClick={logout}>
            Đăng xuất
          </Button>
        </div>
      </div>
    </header>
  );
}

function Shell() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Đang kiểm tra phiên đăng nhập..." />
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <div className="min-h-full">
      <Nav />
      <main className="mx-auto max-w-[1400px] p-4">
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/danh-muc/don-vi" element={<Units />} />
          <Route path="/nap-du-lieu" element={<Import />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  );
}
