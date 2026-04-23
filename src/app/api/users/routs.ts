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

// GET /api/users — список пользователей (без паролей)
export async function GET() {
  try {
    const users = await db.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        workerId: true,
        mustChangePassword: true,
        worker: { select: { id: true, lastName: true, firstName: true, patronymic: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(users);
  } catch (error: any) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/users — создать пользователя (с автогенерацией пароля)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name, role, workerId } = body;

    if (!email || !name || !role) {
      return NextResponse.json({ error: 'Заполните email, ФИО и роль' }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Пользователь с таким email уже существует' }, { status: 400 });
    }

    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const user = await db.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        workerId: workerId || null,
        mustChangePassword: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        workerId: true,
        mustChangePassword: true,
        worker: { select: { id: true, lastName: true, firstName: true, patronymic: true } },
        createdAt: true,
      },
    });

    const { userId, userName } = await getAuditUser();
    await db.auditLog.create({
      data: {
        userId,
        userName,
        action: 'create',
        entityType: 'user',
        entityId: user.id,
        description: `Создан пользователь ${email} (${role})`,
        newValues: JSON.stringify({ email, name, role }),
      },
    });

    // Возвращаем пользователя ВМЕСТЕ с временным паролем (показать админу один раз!)
    return NextResponse.json({ ...user, tempPassword }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}