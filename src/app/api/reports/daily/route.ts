import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date'); // YYYY-MM-DD
    const shiftNumber = searchParams.get('shiftNumber') ? parseInt(searchParams.get('shiftNumber')!) : null;

    if (!date) {
      return NextResponse.json({ error: 'Date parameter is required (YYYY-MM-DD)' }, { status: 400 });
    }

    // Get all active workers, optionally filtered by shift
    const workerWhere: any = { isActive: true };
    if (shiftNumber) {
      workerWhere.shiftNumber = shiftNumber;
    }

    const workers = await db.worker.findMany({
      where: workerWhere,
      include: {
        grade: true,
        shift: true,
        professions: true,
        equipment: true,
      },
      orderBy: [
        { shiftNumber: 'asc' },
        { lastName: 'asc' },
      ],
    });

    // Get attendance records for this date
    const records = await db.attendanceRecord.findMany({
      where: { date },
      include: {
        worker: {
          include: {
            grade: true,
            shift: true,
            professions: true,
            equipment: true,
          },
        },
      },
    });

    // Index records by workerId
    const recordMap = new Map<string, typeof records>();
    for (const rec of records) {
      const existing = recordMap.get(rec.workerId) || [];
      existing.push(rec);
      recordMap.set(rec.workerId, existing);
    }

    // Build result
    const resultWorkers = workers.map(w => {
      const workerRecords = recordMap.get(w.id) || [];

      // Determine status on this date
      let status = 'no_data'; // no record for this date
      let hoursWorked = 0;
      let nightHours = 0;
      let shiftType: string | null = null;

      if (workerRecords.length > 0) {
        // Take the first record (most relevant)
        const rec = workerRecords[0];
        status = rec.status;
        hoursWorked = rec.hoursWorked;
        nightHours = rec.nightHours;
        shiftType = rec.shiftType;
      }

      return {
        workerId: w.id,
        lastName: w.lastName,
        firstName: w.firstName,
        patronymic: w.patronymic,
        gradeNumber: w.gradeNumber,
        gradeName: w.grade.name,
        shiftNumber: w.shiftNumber,
        shiftName: w.shift?.name || '—',
        position: w.position,
        equipmentName: w.equipment?.name || '—',
        status,
        hoursWorked,
        nightHours,
        shiftType,
        professions: w.professions.map(p => p.professionName),
      };
    });

    // Summary counts
    const summary = {
      total: resultWorkers.length,
      present: 0,
      absent: 0,
      sick: 0,
      vacation: 0,
      dayOff: 0,
      transfer: 0,
      stateDuty: 0,
      collectiveAgreement: 0,
      substitution: 0,
      noData: 0,
    };

    for (const w of resultWorkers) {
      switch (w.status) {
        case 'present': summary.present++; break;
        case 'absent': summary.absent++; break;
        case 'sick': summary.sick++; break;
        case 'vacation': summary.vacation++; break;
        case 'day_off': summary.dayOff++; break;
        case 'transfer': summary.transfer++; break;
        case 'state_duty': summary.stateDuty++; break;
        case 'collective_agreement': summary.collectiveAgreement++; break;
        case 'substitution': summary.substitution++; break;
        case 'no_data': summary.noData++; break;
      }
    }

    return NextResponse.json({
      date,
      shiftNumber,
      workers: resultWorkers,
      summary,
    });
  } catch (error) {
    console.error('Error generating daily report:', error);
    return NextResponse.json({ error: 'Failed to generate daily report' }, { status: 500 });
  }
}
