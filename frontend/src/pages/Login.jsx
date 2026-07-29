import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { Alert, Button, Field, Input } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-lg font-semibold text-slate-800">Quản lý Hồ sơ Hoàn</h1>
        <p className="mt-1 mb-5 text-sm text-slate-500">Đăng nhập để tiếp tục</p>

        <div className="space-y-3">
          <Field label="Tên đăng nhập">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Mật khẩu">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
        </div>

        {error && (
          <div className="mt-3">
            <Alert kind="error">{error}</Alert>
          </div>
        )}

        <Button type="submit" disabled={busy} className="mt-5 w-full">
          {busy ? 'Đang kiểm tra...' : 'Đăng nhập'}
        </Button>
      </form>
    </div>
  );
}
