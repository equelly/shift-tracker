import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1));
    const shiftNumber = searchParams.get('shiftNumber') ? parseInt(searchParams.get('shiftNumber')!) : null;

    const daysInMonth = new Date(year, month, 0).getDate();
    const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const where: any = {
      date: { gte: startDateStr, lte: endDateStr },
    };
    if (shiftNumber) where.worker = { shiftNumber };

    const records = await db.attendanceRecord.findMany({
      where,
      include: {
        worker: {
          include: {
            grade: true,
            shift: true,
            professions: true,
          },
        },
      },
    });

    // Group by worker
    const workerMap = new Map<string, any>();

    for (const rec of records) {
      const wId = rec.workerId;
      if (!workerMap.has(wId)) {
        workerMap.set(wId, {
          workerId: wId,
          lastName: rec.worker.lastName,
          firstName: rec.worker.firstName,
          patronymic: rec.worker.patronymic,
          gradeNumber: rec.worker.gradeNumber,
          gradeName: rec.worker.grade.name,
          hourlyRate: rec.worker.grade.hourlyRate,
          shiftNumber: rec.worker.shiftNumber,
          professions: rec.worker.professions.map(p => p.professionName),
          totalHours: 0,
          nightHours: 0,
          holidayHours: 0,
          presentDays: 0,
          absentDays: 0,
          sickDays: 0,
          vacationDays: 0,
          stateDutyDays: 0,
          collectiveAgreementDays: 0,
          substitutionDays: 0,
          transferDays: 0,
          dayOffDays: 0,
          records: [],
        });
      }

      const entry = workerMap.get(wId)!;
      entry.totalHours += rec.hoursWorked;
      entry.nightHours += rec.nightHours;
      entry.holidayHours += rec.holidayHours;

      switch (rec.status) {
        case 'present': entry.presentDays++; break;
        case 'absent': entry.absentDays++; break;
        case 'sick': entry.sickDays++; break;
        case 'vacation': entry.vacationDays++; break;
        case 'state_duty': entry.stateDutyDays++; break;
        case 'collective_agreement': entry.collectiveAgreementDays++; break;
        case 'substitution': entry.substitutionDays++; break;
        case 'transfer': entry.transferDays++; break;
        case 'day_off': entry.dayOffDays++; break;
      }

      entry.records.push(rec);
    }

    const report = Array.from(workerMap.values());

    return NextResponse.json({
      year,
      month,
      shiftNumber,
      workers: report,
      totalWorkers: report.length,
    });
  } catch (error) {
    console.error('Error generating monthly report:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
