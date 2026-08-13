'use client';

import { useEffect, useRef, useState } from 'react';
import './landing.css';

/** Сигнатура макета: карточка разбора вакансии. Числа демонстрационные —
 *  это пример того, что получит пользователь, а не реальные данные. */
const CRITERIA = [
  { k: 'Опыт', v: 95 },
  { k: 'Навыки', v: 91 },
  { k: 'Образование', v: 100 },
  { k: 'Грейд', v: 90 },
  { k: 'Зарплата', v: 75 },
  { k: 'Локация', v: 100 },
];

function MatchCard() {
  const ref = useRef<HTMLDivElement>(null);
  const [lit, setLit] = useState(false);

  // Полосы дорисовываются, когда карточка попала в кадр: одно движение
  // на странице, оно же показывает, что оценка складывается из частей.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setLit(true),
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className={`lp-card ${lit ? 'lp-lit' : ''}`} ref={ref}>
      <div className="lp-card-top">
        <span className="lp-card-score">87</span>
        <span className="lp-card-tag">разбор вакансии</span>
      </div>
      <h3>Senior Business Analyst</h3>
      <p className="meta">Москва, гибрид · ₽250 000–350 000</p>

      <div className="lp-rows">
        {CRITERIA.map((c) => (
          <div className="lp-row" key={c.k}>
            <span className="k">{c.k}</span>
            <div className="lp-track">
              <div className="lp-fill" style={{ ['--w' as string]: `${c.v}%` }} />
            </div>
            <span className="v">{c.v}</span>
          </div>
        ))}
      </div>

      <div className="lp-missing">
        <span className="k">есть у вас · чего не хватает</span>
        <div className="lp-chips">
          <span className="lp-chip has">SQL</span>
          <span className="lp-chip has">Power BI</span>
          <span className="lp-chip has">6 лет опыта</span>
          <span className="lp-chip gap">Python</span>
          <span className="lp-chip gap">A/B-тесты</span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'fail'>('idle');
  const [msg, setMsg] = useState('');

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    try {
      const res = await fetch('/career/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setState('done');
        setMsg('Записали. Напишем, когда откроем загрузку резюме.');
      } else {
        const j = await res.json().catch(() => ({}));
        setState('fail');
        setMsg(j.error ?? 'Не получилось отправить. Попробуйте ещё раз.');
      }
    } catch {
      setState('fail');
      setMsg('Нет связи с сервером. Проверьте соединение.');
    }
  }

  return (
    <div className="lp">
      <div className="lp-wrap">
        <nav className="lp-nav">
          <span className="lp-logo">career</span>
          <a className="enter" href="/career/login">Войти</a>
        </nav>

        <header className="lp-hero">
          <div>
            <h1>Одно резюме. И агент, который <em>читает вакансии за вас</em>.</h1>
            <p className="lead">
              Загрузите резюме — дальше система сама собирает вакансии с hh.ru, отбрасывает
              дубли и разбирает каждую относительно вашего опыта: где вы проходите,
              чего не хватает и стоит ли откликаться.
            </p>

            <form className="lp-form" onSubmit={join}>
              <input
                type="email" required placeholder="Почта" aria-label="Почта"
                value={email} onChange={(e) => setEmail(e.target.value)}
                disabled={state === 'done'}
              />
              <button type="submit" disabled={state === 'busy' || state === 'done'}>
                {state === 'busy' ? 'Отправляем…' : 'Получить доступ'}
              </button>
            </form>
            <p className={`lp-note ${state === 'done' ? 'done' : state === 'fail' ? 'fail' : ''}`}>
              {msg || 'Открываем доступ по мере готовности. Без рассылок и рекламы.'}
            </p>
          </div>

          <MatchCard />
        </header>
      </div>

      <section className="lp-sec">
        <div className="lp-wrap">
          <p className="lp-eyebrow">как это работает</p>
          <h2>Резюме превращается в профиль, профиль — в ежедневный поиск</h2>
          <div className="lp-steps">
            <div className="lp-step">
              <span className="n">01</span>
              <h3>Разбор резюме</h3>
              <p>Опыт, навыки, грейд, индустрии и зарплатные ожидания — в структурированный профиль.</p>
            </div>
            <div className="lp-step">
              <span className="n">02</span>
              <h3>Сбор вакансий</h3>
              <p>Система забирает вакансии с hh.ru и склеивает дубли: одна вакансия вместо пяти копий.</p>
            </div>
            <div className="lp-step">
              <span className="n">03</span>
              <h3>Оценка под вас</h3>
              <p>Каждая вакансия оценивается относительно вашего профиля, а не абстрактных требований.</p>
            </div>
            <div className="lp-step">
              <span className="n">04</span>
              <h3>Утренний дайджест</h3>
              <p>В Telegram или на почту приходит только то, что действительно стоит открыть.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <p className="lp-eyebrow">каждое утро</p>
          <h2>Не лента вакансий, а короткий список</h2>
          <p className="sub">
            За сутки на популярный запрос выходит несколько десятков вакансий. Читать стоит
            единицы — система показывает, какие именно.
          </p>
          <div className="lp-digest">
            <p className="head">17 новых вакансий за сутки</p>
            <ul>
              <li>
                <span className="cnt top">3</span>
                <span>Отличное совпадение<br /><span className="lbl">откликаться сегодня</span></span>
              </li>
              <li>
                <span className="cnt">8</span>
                <span>Хорошее совпадение<br /><span className="lbl">стоит посмотреть</span></span>
              </li>
              <li>
                <span className="cnt">6</span>
                <span>Возможное<br /><span className="lbl">если расширить критерии</span></span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <p className="lp-eyebrow">тарифы</p>
          <h2>Платите за агента, а не за доступ к вакансиям</h2>
          <div className="lp-plans">
            <div className="lp-plan">
              <span className="name">Бесплатно</span>
              <span className="price">$0</span>
              <span className="per">навсегда</span>
              <ul>
                <li>Разбор резюме</li>
                <li>10 вакансий в месяц</li>
                <li>Базовая оценка совпадения</li>
              </ul>
            </div>
            <div className="lp-plan pick">
              <span className="name">Pro</span>
              <span className="price">$19,99</span>
              <span className="per">в месяц</span>
              <ul>
                <li>Поиск без ограничений</li>
                <li>Полный разбор каждой вакансии</li>
                <li>Ежедневные оповещения</li>
                <li>Улучшение резюме</li>
                <li>Сопроводительные письма</li>
              </ul>
            </div>
            <div className="lp-plan">
              <span className="name">Premium</span>
              <span className="price">$39,99</span>
              <span className="per">в месяц</span>
              <ul>
                <li>Всё из Pro</li>
                <li>Резюме под конкретную вакансию</li>
                <li>Трекер откликов</li>
                <li>Анализ зарплат</li>
                <li>Карьерный советник</li>
                <li>Уведомления в Telegram</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <div className="lp-wrap">
        <footer className="lp-foot">
          <span>career · поиск работы с ИИ-агентом</span>
          <a href="/career/login">Вход для администратора</a>
        </footer>
      </div>
    </div>
  );
}
