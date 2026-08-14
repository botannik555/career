'use client';

import { useState } from 'react';

/** Сброс поиска. Вакансии и оценки остаются — удаляется только сам агент. */
export default function ResetAgent({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    setBusy(true);
    const res = await fetch(`/career/api/agents?id=${id}`, { method: 'DELETE' });
    if (res.ok) { window.location.reload(); return; }
    setBusy(false);
    setConfirming(false);
  }

  const link = {
    background: 'none', border: 'none', padding: 0, marginTop: 4, width: 'auto',
    fontSize: 13, cursor: 'pointer', display: 'block', fontFamily: 'inherit',
  } as const;

  if (confirming) {
    return (
      <span style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button onClick={remove} disabled={busy}
                style={{ ...link, marginTop: 0, color: 'var(--warn)', fontWeight: 600 }}>
          {busy ? 'Сбрасываем…' : 'Точно сбросить'}
        </button>
        <button onClick={() => setConfirming(false)} disabled={busy}
                style={{ ...link, marginTop: 0, color: 'var(--ink-3)' }}>
          Отмена
        </button>
      </span>
    );
  }

  return (
    <button onClick={() => setConfirming(true)} style={{ ...link, color: 'var(--ink-3)' }}>
      Сбросить поиск
    </button>
  );
}
