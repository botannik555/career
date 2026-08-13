'use client';

import { useRef, useState } from 'react';
import '../app.css';

type Stage = 'idle' | 'reading' | 'parsing' | 'error';

export default function Upload() {
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function send(file: File) {
    setStage('reading');
    setError('');

    // Этапы показываем честно: чтение файла быстрое, разбор моделью —
    // десятки секунд, и человеку нужно понимать, что происходит.
    const body = new FormData();
    body.append('file', file);

    const t = setTimeout(() => setStage('parsing'), 1200);

    try {
      const res = await fetch('/career/api/upload', { method: 'POST', body });
      clearTimeout(t);
      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(j.error ?? 'Не удалось загрузить файл.');
        setStage('error');
        return;
      }
      window.location.href = `/career/profile/${j.profileId}`;
    } catch {
      clearTimeout(t);
      setError('Соединение прервалось. Файл не загрузился.');
      setStage('error');
    }
  }

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (f) void send(f);
  }

  const busy = stage === 'reading' || stage === 'parsing';

  return (
    <div className="ap">
      <div className="ap-wrap">
        <nav className="ap-nav">
          <span className="logo">career</span>
          <a href="/career/admin">Панель управления</a>
        </nav>

        <h1>Загрузите резюме</h1>
        <p className="lead">
          PDF или DOCX. Система разберёт его на структурированный профиль — опыт, навыки,
          грейд, зарплатные ожидания — и покажет, что именно извлекла.
        </p>

        {busy ? (
          <div className="busy">
            <div className={`stage ${stage === 'parsing' ? 'done' : ''}`}>
              <span className="tick">{stage === 'parsing' ? '✓' : '·'}</span>
              Читаем файл
            </div>
            <div className={`stage ${stage === 'parsing' ? '' : 'wait'}`}>
              <span className="tick">·</span>
              Разбираем резюме — обычно 20–40 секунд
            </div>
          </div>
        ) : (
          <label
            className={`drop ${over ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
          >
            <div className="big">Перетащите файл или выберите на диске</div>
            <div className="small">PDF или DOCX, до 10 МБ</div>
            <input
              ref={input} type="file" accept=".pdf,.docx"
              onChange={(e) => pick(e.target.files)}
            />
          </label>
        )}

        {error && <p className="err">{error}</p>}

        <p className="hint">
          Скан или фотография не подойдут: нужен текстовый слой. Если резюме собрано
          в Word, сохраните его как DOCX — так разбор точнее.
        </p>
      </div>
    </div>
  );
}
