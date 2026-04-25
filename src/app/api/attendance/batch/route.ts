import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateNightHours } from '@/lib/shift-utils';
import { getAuditUser } from '@/lib/auth-guard';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { records } = body;

    if (!records || !Array.isArray(records)) {
      return NextResponse.json({ error: 'Records array required' }, { status: 400 });
    }

    const results = [];

    // Get audit user once before the loop
    const { userId, userName } = await getAuditUser();

    for (const rec of records) {
      const { workerId, date, shiftType, status, absenceReason, notes } = rec;

      // Skip records without required fields
      if (!workerId || !date || !shiftType || !status) {
        console.warn('Skipping attendance record with missing fields:', rec);
        continue;
      }

      // Check holiday
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
      let currentGradeNumber = 0;
      let currentPosition = 'worker';
      try {
        const workerData = await db.worker.findUnique({
          where: { id: workerId },
          select: { gradeNumber: true, position: true },
        });
        currentGradeNumber = workerData?.gradeNumber ?? 0;
        currentPosition = workerData?.position ?? 'worker';
      } catch {}

      try {
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

        // Audit log (userId/userName already fetched before loop)
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
