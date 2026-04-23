import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';

/**
 * Проверяет авторизацию в API маршруте.
 * Возвращает объект сессии или NextResponse с ошибкой 401.
 *
 * Использование:
 *   const session = await requireAuth();
 *   if (session instanceof NextResponse) return session; // не авторизован
 *   // дальше можно использовать session.user.id и т.д.
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 });
  }
  return session;
}

/**
 * Извлекает ID пользователя из сессии.
 * Если сессии нет — возвращает null.
 */
export async function getAuthUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user ? (session.user as any).id : null;
}

/**
 * Извлекает имя и ID пользователя из сессии для аудита.
 * Если сессии нет — возвращает системные значения.
 */
export async function getAuditUser(): Promise<{ userId: string; userName: string }> {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    return {
      userId: (session.user as any).id,
      userName: session.user.name || 'Неизвестный',
    };
  }
  // Системный пользователь для фоновых операций
  return { userId: 'system', userName: 'Система' };
}
