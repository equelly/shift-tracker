import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMonthSchedule, calculateNightHours, getNonShiftSchedule, isNonShiftPosition } from '@/lib/shift-utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1));
    const shiftNumberParam = searchParams.get('shiftNumber');
    const isLeaders = shiftNumberParam === '0';

    const daysInMonth = new Date(year, month, 0).getDate();
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const startDateStr = `${monthStr}-01`;
    const endDateStr = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

    // Get schedule config
    const config = await db.scheduleConfig.findUnique({ where: { key: 'start_date' } });
    if (!config) {
      return NextResponse.json({ error: 'Start date not configured' }, { status: 400 });
    }
    const scheduleStartDate = new Date(config.value + 'T00:00:00');

    // Get holidays
    const holidays = await db.holiday.findMany();
    const holidaySet = new Set(holidays.map(h => h.date));

    let workers: any[];
    let attendance: any[];
    let schedule: Map<string, any>;

    if (isLeaders) {
      // Leaders: non-shift workers (shiftNumber is null)
      workers = await db.worker.findMany({
        where: { shiftNumber: null, isActive: true },
        include: { grade: true, equipment: true, professions: true },
        orderBy: { lastName: 'asc' },
      });

      attendance = await db.attendanceRecord.findMany({
        where: {
          worker: { shiftNumber: null },
          date: { gte: startDateStr, lte: endDateStr },
        },
      });

      // Build per-position schedule for leaders
      schedule = new Map(); // not used for leaders directly
    } else {
      const shiftNumber = parseInt(shiftNumberParam || '1');

      workers = await db.worker.findMany({
        where: { shiftNumber, isActive: true },
        include: { grade: true, equipment: true, professions: true },
        orderBy: { lastName: 'asc' },
      });

      attendance = await db.attendanceRecord.findMany({
        where: {
          worker: { shiftNumber },
          date: { gte: startDateStr, lte: endDateStr },
        },
      });

      schedule = getMonthSchedule(shiftNumber, year, month, scheduleStartDate);
    }

    // Build attendance map
    const attendanceMap = new Map<string, any>();
    for (const a of attendance) {
      const key = `${a.workerId}_${a.date}_${a.shiftType}`;
      attendanceMap.set(key, a);
    }

    // Working statuses
    const workingStatuses = new Set(['day', 'night', 'present', 'working']);

    // Equipment day presence (for shift workers only)
    const equipmentDayPresence = new Map<string, number>();
    if (!isLeaders) {
      for (const worker of workers) {
        if (!worker.equipmentId) continue;
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
          const phase = schedule.get(dateStr) || 'off';
          const shiftType = phase === 'day' ? 'day' : phase === 'night' ? 'night' : null;
          if (!shiftType) continue;
          const record = attendanceMap.get(`${worker.id}_${dateStr}_${shiftType}`);
          let isWorking = false;
          if (record) {
            isWorking = workingStatuses.has(record.status);
          } else {
            isWorking = (phase === 'day' || phase === 'night');
          }
          if (isWorking) {
            const key = `${worker.equipmentId}_${dateStr}`;
            equipmentDayPresence.set(key, (equipmentDayPresence.get(key) || 0) + 1);
          }
        }
      }
    }

    // Build timesheet
    const timesheet = workers.map(worker => {
      const days: any[] = [];
      let totalHours = 0;
      let totalNightHours = 0;
      let totalHolidayHours = 0;
      let totalCombinationHours = 0;
      let hasCombination = false;

      // For leaders, get their personal non-shift schedule
      let leaderSchedule: Map<string, any> | null = null;
      if (isLeaders && isNonShiftPosition(worker.position)) {
        leaderSchedule = getNonShiftSchedule(worker.position, year, month);
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
        const date = new Date(year, month - 1, day);
        const isHoliday = holidaySet.has(dateStr);

        let phase: string;
        let shiftType: string | null;

        if (isLeaders && leaderSchedule) {
          // Non-shift: working or day_off
          const daySchedule = leaderSchedule.get(dateStr);
          phase = daySchedule === 'working' ? 'working' : 'off';
          shiftType = daySchedule === 'working' ? 'day' : null;
        } else {
          phase = schedule.get(dateStr) || 'off';
          shiftType = phase === 'day' ? 'day' : phase === 'night' ? 'night' : null;
        }

        let attendanceRecord = null;
        if (shiftType) {
          attendanceRecord = attendanceMap.get(`${worker.id}_${dateStr}_${shiftType}`);
        }

        let status: string = phase;
        if (attendanceRecord) {
          status = attendanceRecord.status;
        }

        const workerIsWorking = workingStatuses.has(status);

        // Combination (shift workers only)
        let isCombinationDay = false;
        if (!isLeaders && worker.equipmentId && shiftType && workerIsWorking) {
          const presenceKey = `${worker.equipmentId}_${dateStr}`;
          const presentCount = equipmentDayPresence.get(presenceKey) || 0;
          if (presentCount === 1) {
            isCombinationDay = true;
          }
        }

        if (isCombinationDay) hasCombination = true;

        // Hours from attendance records only
        if (attendanceRecord && workerIsWorking) {
          totalHours += attendanceRecord.hoursWorked || 0;
          totalNightHours += attendanceRecord.nightHours || 0;
          totalHolidayHours += attendanceRecord.holidayHours || 0;
          if (isCombinationDay) {
            totalCombinationHours += attendanceRecord.hoursWorked || 0;
          }
        }

        days.push({
          day,
          date: dateStr,
          phase,
          shiftType,
          status,
          isHoliday,
          isCombination: isCombinationDay,
          attendanceRecord,
        });
      }

      return {
        workerId: worker.id,
        lastName: worker.lastName,
        firstName: worker.firstName,
        patronymic: worker.patronymic,
        gradeNumber: worker.gradeNumber,
        position: worker.position || 'worker',
        equipment: worker.equipment?.name || '',
        professions: worker.professions?.map((p: any) => p.professionName) || [],
        isCombination: hasCombination,
        isNonShift: isLeaders,
        days,
        totalHours,
        totalNightHours,
        totalHolidayHours,
        totalCombinationHours,
      };
    });

    return NextResponse.json({
      year,
      month,
      shiftNumber: isLeaders ? 0 : parseInt(shiftNumberParam || '1'),
      daysInMonth,
      isLeaders,
      timesheet,
    });
  } catch (error) {
    console.error('Error generating timesheet:', error);
    return NextResponse.json({ error: 'Failed to generate timesheet' }, { status: 500 });
  }
}
