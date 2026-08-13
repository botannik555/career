import { NextResponse, type NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { currentUser } from '@/lib/user';
import { extractText, ACCEPTED, MAX_BYTES, ResumeError } from '@/lib/resume';
import { extractProfile } from '@/lib/ai/extract';
import { BudgetExceeded } from '@/lib/ai/cost';

export const maxDuration = 120;   // разбор резюме занимает десятки секунд

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Нужно войти.' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Файл не приложен.' }, { status: 400 });
  }
  const kind = ACCEPTED[file.type];
  if (!kind) {
    return NextResponse.json({ error: 'Подходят PDF и DOCX.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Файл больше 10 МБ.' }, { status: 400 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const text = await extractText(buf, kind);

    const { rows } = await pool.query(
      `INSERT INTO resumes (user_id, filename, mime, raw_text)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [user.id, file.name, file.type, text],
    );

    const { profileId, cost } = await extractProfile({
      userId: user.id, resumeId: rows[0].id, rawText: text,
    });

    return NextResponse.json({ profileId, cost });
  } catch (e: unknown) {
    if (e instanceof ResumeError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    if (e instanceof BudgetExceeded) {
      return NextResponse.json(
        { error: 'Месячный лимит разборов исчерпан.' }, { status: 429 },
      );
    }
    console.error('upload failed', e);
    return NextResponse.json(
      { error: 'Не удалось разобрать резюме. Попробуйте другой файл.' }, { status: 500 },
    );
  }
}
