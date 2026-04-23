import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateNightHours, WORKER_POSITIONS, getScheduleType } from '@/lib/shift-utils';
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

    // Get worker position to determine schedule type
    const worker = await db.worker.findUnique({
      where: { id: workerId },
      select: { position: true },
    });
    const position = worker?.position || 'worker';
    const scheduleType = getScheduleType(position);

    // Check holiday
    const holiday = await db.holiday.findUnique({ where: { date } });

    let hoursWorked = 0;
    let nightHours = 0;
    let holidayHours = 0;

    if (status === 'present') {
      if (scheduleType === '8h' || shiftType === 'day_8h') {
        hoursWorked = 8;
        nightHours = 0;
        if (holiday) holidayHours = 8;
      } else {
        hoursWorked = 12;
        nightHours = calculateNightHours(shiftType as 'day' | 'night');
        if (holiday) holidayHours = 12;
      }
    }

    // Normalize shiftType for storage: day_8h → day for DB compatibility
    const storeShiftType = shiftType === 'day_8h' ? 'day' : shiftType;

    // Upsert attendance record
    const record = await db.attendanceRecord.upsert({
      where: {
        workerId_date_shiftType: { workerId, date, shiftType: storeShiftType },
      },
      create: {
        workerId,
        date,
        shiftType: storeShiftType,
        status,
        absenceReason: absenceReason || null,
        notes: notes || null,
        hoursWorked,
        nightHours,
        holidayHours,
      },
      update: {
        status,
        absenceReason: absenceReason || null,
        notes: notes || null,
        hoursWorked,
        nightHours,
        holidayHours,
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

    // Return with calculated hours for immediate UI update
    return NextResponse.json({
      ...record,
      _calculated: { hoursWorked, nightHours, holidayHours },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating attendance:', error);
    return NextResponse.json({ error: 'Failed to create attendance' }, { status: 500 });
  }
}