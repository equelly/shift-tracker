import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuditUser } from '@/lib/auth-guard';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const area = searchParams.get('area');
    const workshop = searchParams.get('workshop');

    const where: any = {};
    if (area) where.area = { contains: area };
    if (workshop) where.workshop = { contains: workshop };

    const equipment = await db.equipment.findMany({
      where,
      include: {
        workers: { where: { isActive: true }, select: { id: true, lastName: true, firstName: true } },
      },
      orderBy: [{ workshop: 'asc' }, { area: 'asc' }, { name: 'asc' }],
    });

    return NextResponse.json(equipment);
  } catch (error) {
    console.error('Error fetching equipment:', error);
    return NextResponse.json({ error: 'Failed to fetch equipment' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const equipment = await db.equipment.create({
      data: {
        name: body.name,
        workshop: body.workshop || 'Цех №1',
        area: body.area,
      },
    });

    const { userId, userName } = await getAuditUser();
    await db.auditLog.create({
      data: {
        userId,
        userName,
        action: 'create',
        entityType: 'equipment',
        entityId: String(equipment.id),
        description: `Создано оборудование: ${body.name}`,
        newValues: JSON.stringify(body),
      },
    });

    return NextResponse.json(equipment, { status: 201 });
  } catch (error) {
    console.error('Error creating equipment:', error);
    return NextResponse.json({ error: 'Failed to create equipment' }, { status: 500 });
  }
}
