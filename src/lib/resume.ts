import mammoth from 'mammoth';

export const MAX_BYTES = 10 * 1024 * 1024;

export const ACCEPTED: Record<string, 'pdf' | 'docx'> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export class ResumeError extends Error {}

/**
 * Достаёт текст резюме. Отдельно ловим случай, когда файл — скан:
 * текстового слоя нет, и дальше по конвейеру уедет пустой профиль,
 * за который пользователь ещё и заплатит.
 */
export async function extractText(buf: Buffer, kind: 'pdf' | 'docx'): Promise<string> {
  let text: string;

  if (kind === 'pdf') {
    // Импорт именно lib/pdf-parse.js: корневой index.js в этом пакете
    // при загрузке пытается прочитать тестовый файл и падает.
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const res = await pdfParse(buf);
    text = res.text;
  } else {
    const res = await mammoth.extractRawText({ buffer: buf });
    text = res.value;
  }

  text = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.length < 200) {
    throw new ResumeError(
      'В файле почти нет текста. Похоже, это скан или картинка — нужен PDF с текстовым слоем или DOCX.',
    );
  }

  return text;
}
