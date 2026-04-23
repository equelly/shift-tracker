import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

// POST /api/users/reset-password — сброс пароля
// По email — со страницы входа (без авторизации)
// По userId — админ из панели управления
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, userId: targetUserId } = body;

    let user;

    if (email) {
      user = await db.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true },
      });

      if (!user) {
        return NextResponse.json({ error: 'Пользователь с таким email не найден' }, { status: 404 });
      }
    } else if (targetUserId) {
      let adminId: string | undefined;
      try {
        const { getAuthUserId } = await import('@/lib/auth-guard');
        adminId = (await getAuthUserId()) || undefined;
      } catch {}

      if (adminId) {
        const admin = await db.user.findUnique({
          where: { id: adminId },
          select: { role: true },
        });
        if (!admin || admin.role !== 'admin') {
          return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
        }
      }

      user = await db.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, email: true, name: true },
      });

      if (!user) {
        return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
      }
    } else {
      return NextResponse.json({ error: 'Укажите email или userId' }, { status: 400 });
    }

    // Генерируем временный пароль
    const tempPassword = Math.random().toString(36).slice(2, 10) +
                         Math.random().toString(36).slice(2, 6).toUpperCase();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Обновляем пароль и mustChangePassword через raw SQL
    await db.$executeRaw`UPDATE User SET password = ${hashedPassword}, mustChangePassword = 1, updatedAt = datetime('now') WHERE id = ${user.id}`;

    // Аудит
    try {
      const { getAuditUser } = await import('@/lib/auth-guard');
      const auditUser = await getAuditUser();

      const logUserId = auditUser.userId === 'system' ? user.id : auditUser.userId;
      const logUserName = auditUser.userId === 'system'
        ? `${user.name} (сброс со страницы входа)`
        : auditUser.userName;

      await db.auditLog.create({
        data: {
          userId: logUserId,
          userName: logUserName,
          action: 'update',
          entityType: 'user',
          entityId: user.id,
          description: `Сброшен пароль пользователя ${user.email}`,
        },
      });
    } catch (auditErr) {
      console.error('Audit log failed:', auditErr);
    }

    // Всегда возвращаем временный пароль
    return NextResponse.json({
      success: true,
      tempPassword,
      email: user.email,
      message: targetUserId
        ? `Пароль сброшен для ${user.email}`
        : 'Пароль сброшен',
    });
  } catch (error: any) {
    console.error('Error resetting password:', error);
    return NextResponse.json(
      { error: 'Ошибка сброса пароля: ' + (error.message || String(error)) },
      { status: 500 }
    );
  }
}