import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuditUser } from '@/lib/auth-guard';
import bcrypt from 'bcryptjs';

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
        createdAt: true,
        worker: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
            patronymic: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

// POST /api/users — создать пользователя (админ)
export async function POST(request: NextRequest) {
  try {
    const { userId: adminId, userName: adminName } = await getAuditUser();

    const admin = await db.user.findUnique({
      where: { id: adminId },
      select: { role: true },
    });

    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
    }

    const body = await request.json();
    const { email, name, role, workerId } = body;

    if (!email || !name || !role) {
      return NextResponse.json({ error: 'Email, имя и роль обязательны' }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Пользователь с таким email уже существует' }, { status: 400 });
    }

    // Генерируем временный пароль
    const tempPassword = Math.random().toString(36).slice(2, 10) +
                         Math.random().toString(36).slice(2, 6).toUpperCase();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const user = await db.user.create({
      data: {
        email,
        name,
        role,
        workerId: workerId || null,
        password: hashedPassword,
        mustChangePassword: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        workerId: true,
        mustChangePassword: true,
        worker: {
          select: { id: true, lastName: true, firstName: true, patronymic: true },
        },
      },
    });

    await db.auditLog.create({
      data: {
        userId: adminId,
        userName: adminName,
        action: 'create',
        entityType: 'user',
        entityId: user.id,
        description: `Создан пользователь ${email} (${role})`,
        newValues: JSON.stringify({ email, name, role, workerId }),
      },
    });

    return NextResponse.json({ ...user, tempPassword }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Ошибка создания пользователя: ' + (error.message || String(error)) },
      { status: 500 }
    );
  }
}