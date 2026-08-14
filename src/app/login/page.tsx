'use client';

import { useState } from 'react';
import '../app.css';

/** Вход и регистрация на одной странице: почта и пароль, без кодов. */
export default function Login() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');

    const url = mode === 'login' ? '/career/api/auth/login' : '/career/api/auth/register';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await res.json().catch(() => ({}));

    if (res.ok) { window.location.href = j.redirect ?? '/career/app'; return; }
    setBusy(false);
    setError(j.error ?? 'Не получилось. Попробуйте ещё раз.');
  }

  const field = {
    width: '100%', padding: '12px 14px', fontSize: 15, marginBottom: 12,
    border: '1px solid var(--rule)', borderRadius: 3, background: '#fff',
    fontFamily: 'inherit', color: 'var(--ink)',
  } as const;

  const tab = (active: boolean) => ({
    background: 'none', border: 'none', padding: '0 0 6px', marginRight: 20,
    fontSize: 15, fontWeight: active ? 700 : 400, cursor: 'pointer',
    color: active ? 'var(--ink)' : 'var(--ink-3)',
    borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent',
    width: 'auto',
  } as const);

  return (
    <div className="ap">
      <div className="ap-wrap" style={{ maxWidth: 380, paddingTop: 72 }}>
        <div style={{ marginBottom: 24 }}>
          <button type="button" style={tab(mode === 'login')}
                  onClick={() => { setMode('login'); setError(''); }}>
            Вход
          </button>
          <button type="button" style={tab(mode === 'register')}
                  onClick={() => { setMode('register'); setError(''); }}>
            Регистрация
          </button>
        </div>

        <p className="lead" style={{ fontSize: 15 }}>
          {mode === 'login'
            ? 'Войдите, чтобы вернуться к своим вакансиям.'
            : 'Загрузите резюме — система соберёт вакансии и оценит каждую под ваш опыт.'}
        </p>

        {error && <p className="err" role="alert" style={{ marginTop: 0 }}>{error}</p>}

        <form onSubmit={submit}>
          <input
            style={field} type="email" required placeholder="Почта" aria-label="Почта"
            autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <input
            style={field} type="password" required placeholder="Пароль" aria-label="Пароль"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 8 : undefined}
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'register' && (
            <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '0 0 14px' }}>
              От 8 символов.
            </p>
          )}
          <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Секунду…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>
        </form>

        <p className="hint">
          <a href="/career/" style={{ color: 'var(--ink-3)' }}>На главную</a>
        </p>
      </div>
    </div>
  );
}
