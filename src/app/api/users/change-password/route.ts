import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import bcrypt from 'bcryptjs';

// POST /api/users/change-password — пользователь меняет свой пароль
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Необходима авторизация' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await request.json();
    const { oldPassword, newPassword, mustChange } = body;

    if (!newPassword) {
      return NextResponse.json({ error: 'Укажите новый пароль' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Новый пароль должен быть не менее 6 символов' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, name: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    // Проверяем старый пароль ТОЛЬКО если это не принудительная смена
    if (!mustChange) {
      if (!oldPassword) {
        return NextResponse.json({ error: 'Укажите старый пароль' }, { status: 400 });
      }
      const isValid = await bcrypt.compare(oldPassword, user.password);
      if (!isValid) {
        return NextResponse.json({ error: 'Неверный текущий пароль' }, { status: 400 });
      }
    }

    // Хешируем новый пароль
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Обновляем через raw SQL
    await db.$executeRaw`UPDATE User SET password = ${hashedPassword}, mustChangePassword = 0, updatedAt = datetime('now') WHERE id = ${userId}`;

    // Аудит
    try {
      await db.auditLog.create({
        data: {
          userId,
          userName: user.name || 'Неизвестный',
          action: 'update',
          entityType: 'user',
          entityId: userId,
          description: mustChange
            ? 'Пользователь установил пароль (принудительная смена)'
            : 'Пользователь изменил свой пароль',
        },
      });
    } catch (auditErr) {
      console.error('Audit log failed:', auditErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error changing password:', error);
    return NextResponse.json(
      { error: 'Ошибка смены пароля: ' + (error.message || String(error)) },
      { status: 500 }
    );
  }
}