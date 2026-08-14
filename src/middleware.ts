import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Защита приватных страниц. Проверяем только подпись — обращений к БД нет,
 * middleware работает на edge-рантайме.
 *
 * Пути в matcher указываются БЕЗ basePath, а вот в редиректе basePath
 * нужен явно: new URL('/login', req.url) его теряет и уводит на корень домена,
 * где живёт Jitsi.
 */
export async function middleware(req: NextRequest) {
  const login = new URL('/career/login', req.url);
  const token = req.cookies.get('career_session')?.value;

  if (!token) return NextResponse.redirect(login);

  try {
    const { payload } = await jwtVerify(
      token, new TextEncoder().encode(process.env.AUTH_SECRET!),
    );
    if (!payload.role) return NextResponse.redirect(login);
    if (req.nextUrl.pathname.startsWith('/admin') && payload.role !== 'admin') {
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(login);
  }
}

export const config = {
  matcher: ['/admin/:path*', '/upload/:path*', '/profile/:path*', '/app/:path*'],
};
