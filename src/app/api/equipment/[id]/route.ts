import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuditUser } from '@/lib/auth-guard';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numId = parseInt(id);
    if (isNaN(numId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const body = await request.json();
    const oldEq = await db.equipment.findUnique({ where: { id: numId } });

    const equipment = await db.equipment.update({
      where: { id: numId },
      data: {
        name: body.name,
        workshop: body.workshop,
        area: body.area,
      },
    });

    const { userId, userName } = await getAuditUser();
    await db.auditLog.create({
      data: {
        userId,
        userName,
        action: 'update',
        entityType: 'equipment',
        entityId: id,
        description: `Изменено оборудование: ${body.name}`,
        oldValues: oldEq ? JSON.stringify(oldEq) : null,
        newValues: JSON.stringify(body),
      },
    });

    return NextResponse.json(equipment);
  } catch (error) {
    console.error('Error updating equipment:', error);
    return NextResponse.json({ error: 'Failed to update equipment' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const numId = parseInt(id);
    if (isNaN(numId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const oldEq = await db.equipment.findUnique({ where: { id: numId } });
    await db.equipment.delete({ where: { id: numId } });

    const { userId, userName } = await getAuditUser();
    await db.auditLog.create({
      data: {
        userId,
        userName,
        action: 'delete',
        entityType: 'equipment',
        entityId: id,
        description: `Удалено оборудование: ${oldEq?.name}`,
        oldValues: oldEq ? JSON.stringify(oldEq) : null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting equipment:', error);
    return NextResponse.json({ error: 'Failed to delete equipment' }, { status: 500 });
  }
}
