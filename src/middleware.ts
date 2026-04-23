import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Next.js Middleware — выполняется ДО каждого запроса.
 *
 * Здесь мы проверяем авторизацию для API-маршрутов,
 * которые изменяют данные (POST, PUT, DELETE).
 *
 * Исключения:
 * - /api/auth/* — NextAuth свои запросы обрабатывает
 * - /api/users/reset-password — сброс пароля со страницы входа (без авторизации)
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Маршруты, доступные без авторизации
  const publicPaths = [
    '/api/auth',           // NextAuth
    '/api/users/reset-password', // Сброс пароля со страницы входа
  ];

  const isPublic = publicPaths.some(p => pathname.startsWith(p));

  // Защищаем только API-маршруты, которые изменяют данные
  const isWriteApi = pathname.startsWith('/api/') &&
    !isPublic &&
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method);

  if (isWriteApi) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

// Matcher определяет, на какие пути действует middleware
export const config = {
  matcher: ['/api/:path*'],
};