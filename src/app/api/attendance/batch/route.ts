import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateNightHours, getScheduleType } from '@/lib/shift-utils';
import { getAuditUser } from '@/lib/auth-guard';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { records } = body;

    if (!records || !Array.isArray(records)) {
      return NextResponse.json({ error: 'Records array required' }, { status: 400 });
    }

    const results = [];

    for (const rec of records) {
      const { workerId, date, shiftType, status, absenceReason, notes } = rec;

      if (!workerId || !date || !shiftType || !status) {
        console.warn('Skipping attendance record with missing fields:', rec);
        continue;
      }

      // Get worker position for schedule type
      let scheduleType = '12h';
      try {
        const worker = await db.worker.findUnique({
          where: { id: workerId },
          select: { position: true },
        });
        scheduleType = getScheduleType(worker?.position || 'worker');
      } catch {}

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

      // Normalize shiftType for storage
      const storeShiftType = shiftType === 'day_8h' ? 'day' : shiftType;

      try {
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
        const { userId, userName } = await getAuditUser();
        await db.auditLog.create({
          data: {
            userId,
            userName,
            action: 'create',
            entityType: 'attendance',
            entityId: record.id,
            description: `Отметка: ${record.worker.lastName} ${date} ${shiftType} — ${status}`,
            newValues: JSON.stringify(rec),
            attendanceId: record.id,
          },
        });

        results.push(record);
      } catch (err) {
        console.error(`Error upserting attendance for worker ${workerId}:`, err);
      }
    }

    return NextResponse.json({ created: results.length, records: results }, { status: 201 });
  } catch (error) {
    console.error('Error batch creating attendance:', error);
    return NextResponse.json({ error: 'Failed to batch create attendance' }, { status: 500 });
  }
}