'use client';
import { useState } from 'react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await fetch('/career/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      window.location.href = '/career/admin';
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Не удалось войти. Проверьте соединение.');
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit}>
        <h1>Вход</h1>
        <p className="hint">Панель управления career</p>

        {error && <p className="error" role="alert">{error}</p>}

        <label htmlFor="email">Почта</label>
        <input id="email" type="email" autoComplete="username" required
               value={email} onChange={(e) => setEmail(e.target.value)} />

        <label htmlFor="password">Пароль</label>
        <input id="password" type="password" autoComplete="current-password" required
               value={password} onChange={(e) => setPassword(e.target.value)} />

        <button type="submit" disabled={busy}>{busy ? 'Проверяем…' : 'Войти'}</button>
      </form>
    </div>
  );
}
