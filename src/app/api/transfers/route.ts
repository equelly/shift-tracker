import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuditUser } from '@/lib/auth-guard';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    const where: any = {};
    if (date) where.date = date;

    const transfers = await db.transfer.findMany({
      where,
      include: { worker: { include: { grade: true } } },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json(transfers);
  } catch (error) {
    console.error('Error fetching transfers:', error);
    return NextResponse.json({ error: 'Failed to fetch transfers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workerId, fromEquipmentId, toEquipmentId, fromShiftNumber, toShiftNumber, date, reason } = body;

    const transfer = await db.transfer.create({
      data: {
        workerId,
        fromEquipmentId: fromEquipmentId ?? null,
        toEquipmentId: toEquipmentId ?? null,
        fromShiftNumber: fromShiftNumber ?? null,
        toShiftNumber: toShiftNumber ?? null,
        date,
        reason,
      },
      include: { worker: true },
    });

    // If changing shift, update worker
    if (toShiftNumber) {
      await db.worker.update({
        where: { id: workerId },
        data: { shiftNumber: toShiftNumber },
      });
    }

    // If changing equipment, update worker
    if (toEquipmentId) {
      await db.worker.update({
        where: { id: workerId },
        data: { equipmentId: toEquipmentId },
      });
    }

    // Audit log
    const { userId, userName } = await getAuditUser();
    await db.auditLog.create({
      data: {
        userId,
        userName,
        action: 'create',
        entityType: 'transfer',
        entityId: transfer.id,
        description: `Перевод: ${transfer.worker.lastName} ${date}`,
        newValues: JSON.stringify(body),
      },
    });

    return NextResponse.json(transfer, { status: 201 });
  } catch (error) {
    console.error('Error creating transfer:', error);
    return NextResponse.json({ error: 'Failed to create transfer' }, { status: 500 });
  }
}
