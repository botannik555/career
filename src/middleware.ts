import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Защита /admin. Проверяем только подпись — обращений к БД здесь нет,
 * middleware работает на edge-рантайме.
 * Пути в matcher указываются БЕЗ basePath.
 */
export async function middleware(req: NextRequest) {
  const token = req.cookies.get('career_session')?.value;
  const loginUrl = new URL('/login', req.url);

  if (!token) return NextResponse.redirect(loginUrl);

  try {
    const { payload } = await jwtVerify(
      token, new TextEncoder().encode(process.env.AUTH_SECRET!),
    );
    if (!payload.role) return NextResponse.redirect(loginUrl);
    if (req.nextUrl.pathname.startsWith('/admin') && payload.role !== 'admin') {
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(loginUrl);
  }
}

export const config = { matcher: ['/admin/:path*', '/upload/:path*', '/profile/:path*'] };
