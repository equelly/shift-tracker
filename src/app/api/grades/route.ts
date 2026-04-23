import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuditUser } from '@/lib/auth-guard';

export async function GET() {
  try {
    const grades = await db.grade.findMany({
      include: { _count: { select: { workers: { where: { isActive: true } } } } },
      orderBy: { number: 'asc' },
    });

    return NextResponse.json(grades.map(g => ({
      ...g,
      workerCount: g._count.workers,
      _count: undefined,
    })));
  } catch (error) {
    console.error('Error fetching grades:', error);
    return NextResponse.json({ error: 'Failed to fetch grades' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { number, hourlyRate, name } = body;

    const grade = await db.grade.update({
      where: { number },
      data: { hourlyRate, name },
    });

    const { userId, userName } = await getAuditUser();
    await db.auditLog.create({
      data: {
        userId,
        userName,
        action: 'update',
        entityType: 'grade',
        entityId: String(number),
        description: `Изменён ${number} разряд: ставка ${hourlyRate}`,
        newValues: JSON.stringify(body),
      },
    });

    return NextResponse.json(grade);
  } catch (error) {
    console.error('Error updating grade:', error);
    return NextResponse.json({ error: 'Failed to update grade' }, { status: 500 });
  }
}
