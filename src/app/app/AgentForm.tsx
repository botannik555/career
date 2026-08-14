'use client';

import { useState } from 'react';

const AREAS = [
  ['113', 'Россия'], ['1', 'Москва'], ['2', 'Санкт-Петербург'],
  ['2019', 'Московская область'], ['1202', 'Казахстан'], ['16', 'Беларусь'],
];

export default function AgentForm() {
  const [text, setText] = useState('');
  const [area, setArea] = useState('113');
  const [salary, setSalary] = useState('');
  const [remoteOnly, setRemote] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const res = await fetch('/career/api/agents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, area, salary: Number(salary) || undefined, remoteOnly }),
    });
    if (res.ok) { window.location.reload(); return; }
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setError(j.error ?? 'Не удалось создать поиск.');
  }

  const field = {
    width: '100%', padding: '10px 12px', fontSize: 15, marginBottom: 10,
    border: '1px solid var(--rule)', borderRadius: 3, background: '#fff',
    fontFamily: 'inherit', color: 'var(--ink)',
  } as const;

  return (
    <form onSubmit={create}>
      {error && <p className="err" style={{ marginTop: 0 }}>{error}</p>}

      <input
        style={field} placeholder="Должность или ключевые слова" aria-label="Должность"
        value={text} onChange={(e) => setText(e.target.value)} required maxLength={100}
      />
      <select style={field} value={area} onChange={(e) => setArea(e.target.value)} aria-label="Регион">
        {AREAS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
      <input
        style={field} type="number" inputMode="numeric" placeholder="Зарплата от, ₽ (необязательно)"
        aria-label="Зарплата от" value={salary} onChange={(e) => setSalary(e.target.value)}
      />
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14,
                      color: 'var(--ink-2)', marginBottom: 16 }}>
        <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemote(e.target.checked)}
               style={{ width: 'auto', margin: 0 }} />
        Только удалённая работа
      </label>

      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Запускаем…' : 'Запустить поиск'}
      </button>
    </form>
  );
}
