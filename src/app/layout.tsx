import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'career — поиск работы с ИИ-агентом',
  description: 'Загрузите резюме: система соберёт вакансии с hh.ru и разберёт каждую относительно вашего опыта.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
