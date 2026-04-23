import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { getAuditUser } from '@/lib/auth-guard';

function generateTempPassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let pass = '';
  for (let i = 0; i < 8; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)];
  }
  return pass;
}

// POST /api/users/reset-password — сбросить пароль (админ)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Укажите userId' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await db.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        mustChangePassword: true,
      },
    });

    const { userId: auditUserId, userName } = await getAuditUser();
    await db.auditLog.create({
      data: {
        userId: auditUserId,
        userName,
        action: 'update',
        entityType: 'user',
        entityId: userId,
        description: `Сброшен пароль для ${user.email}`,
      },
    });

    return NextResponse.json({ tempPassword });
  } catch (error: any) {
    console.error('Error resetting password:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}