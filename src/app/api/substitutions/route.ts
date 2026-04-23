import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuditUser } from '@/lib/auth-guard';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const shiftNumber = searchParams.get('shiftNumber');

    const where: any = {};
    if (date) where.date = date;
    if (shiftNumber) where.worker = { shiftNumber: parseInt(shiftNumber) };

    const substitutions = await db.substitution.findMany({
      where,
      include: {
        worker: { select: { id: true, lastName: true, firstName: true, gradeNumber: true } },
        substituteWorker: { select: { id: true, lastName: true, firstName: true, gradeNumber: true } },
        equipment: true,
      },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json(substitutions);
  } catch (error) {
    console.error('Error fetching substitutions:', error);
    return NextResponse.json({ error: 'Failed to fetch substitutions' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workerId, substituteWorkerId, date, shiftType, equipmentId, reason } = body;

    // Validate: both workers must be grade 7 or 8
    const worker = await db.worker.findUnique({ where: { id: workerId } });
    const substitute = await db.worker.findUnique({ where: { id: substituteWorkerId } });

    if (!worker || !substitute) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
    }

    if (worker.gradeNumber < 7 || substitute.gradeNumber < 7) {
      return NextResponse.json({ error: 'Подмена доступна только для работников 7 и 8 разрядов' }, { status: 400 });
    }

    const substitution = await db.substitution.create({
      data: {
        workerId,
        substituteWorkerId,
        date,
        shiftType,
        equipmentId: equipmentId ?? null,
        reason,
      },
      include: {
        worker: true,
        substituteWorker: true,
        equipment: true,
      },
    });

    // Also create attendance record for the substitute as "substitution"
    await db.attendanceRecord.upsert({
      where: {
        workerId_date_shiftType: { workerId: substituteWorkerId, date, shiftType },
      },
      create: {
        workerId: substituteWorkerId,
        date,
        shiftType,
        status: 'substitution',
        hoursWorked: 12,
        nightHours: shiftType === 'night' ? 8 : 0,
        notes: `Подмена: ${worker.lastName} ${worker.firstName}`,
      },
      update: {
        status: 'substitution',
        hoursWorked: 12,
        nightHours: shiftType === 'night' ? 8 : 0,
        notes: `Подмена: ${worker.lastName} ${worker.firstName}`,
      },
    });

    // Audit log
    const { userId, userName } = await getAuditUser();
    await db.auditLog.create({
      data: {
        userId,
        userName,
        action: 'create',
        entityType: 'substitution',
        entityId: substitution.id,
        description: `Подмена: ${substitute.lastName} заменяет ${worker.lastName} (${date})`,
        newValues: JSON.stringify(body),
      },
    });

    return NextResponse.json(substitution, { status: 201 });
  } catch (error) {
    console.error('Error creating substitution:', error);
    return NextResponse.json({ error: 'Failed to create substitution' }, { status: 500 });
  }
}
