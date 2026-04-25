import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateNightHours } from '@/lib/shift-utils';
import { getAuditUser } from '@/lib/auth-guard';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const shiftNumber = searchParams.get('shiftNumber') ? parseInt(searchParams.get('shiftNumber')!) : null;
    const shiftType = searchParams.get('shiftType');
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    const where: any = {};
    if (date) where.date = date;
    else if (startDateStr && endDateStr) where.date = { gte: startDateStr, lte: endDateStr };
    if (shiftType) where.shiftType = shiftType;
    if (shiftNumber) where.worker = { shiftNumber };

    const records = await db.attendanceRecord.findMany({
      where,
      include: {
        worker: { include: { grade: true, shift: true, equipment: true } },
      },
      orderBy: [{ date: 'asc' }, { worker: { lastName: 'asc' } }],
    });

    return NextResponse.json(records);
  } catch (error) {
    console.error('Error fetching attendance:', error);
    return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workerId, date, shiftType, status, absenceReason, notes } = body;

    if (!workerId || !date || !shiftType || !status) {
      return NextResponse.json({ error: 'Не все обязательные поля заполнены' }, { status: 400 });
    }

    const { userId, userName } = await getAuditUser();

    // Auto-calculate hours
    const holiday = await db.holiday.findUnique({ where: { date } });

    let hoursWorked = 0;
    let nightHours = 0;
    let holidayHours = 0;

    if (status === 'present') {
      hoursWorked = 12;
      nightHours = calculateNightHours(shiftType);
      if (holiday) holidayHours = 12;
    }

    // Get worker's current grade/position for multi-row timesheet
    const workerData = await db.worker.findUnique({
      where: { id: workerId },
      select: { gradeNumber: true, position: true },
    });
    const currentGradeNumber = workerData?.gradeNumber ?? 0;
    const currentPosition = workerData?.position ?? 'worker';

    // Upsert attendance record
    const record = await db.attendanceRecord.upsert({
      where: {
        workerId_date_shiftType: { workerId, date, shiftType },
      },
      create: {
        workerId,
        date,
        shiftType,
        status,
        absenceReason: absenceReason || null,
        notes: notes || null,
        hoursWorked,
        nightHours,
        holidayHours,
        gradeNumber: currentGradeNumber,
        position: currentPosition,
      },
      update: {
        status,
        absenceReason: absenceReason || null,
        notes: notes || null,
        hoursWorked,
        nightHours,
        holidayHours,
        gradeNumber: currentGradeNumber,
        position: currentPosition,
      },
      include: { worker: true },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId,
        userName,
        action: 'create',
        entityType: 'attendance',
        entityId: record.id,
        description: `Отметка: ${record.worker.lastName} ${date} ${shiftType} — ${status}`,
        newValues: JSON.stringify(body),
        attendanceId: record.id,
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error('Error creating attendance:', error);
    return NextResponse.json({ error: 'Failed to create attendance' }, { status: 500 });
  }
}
