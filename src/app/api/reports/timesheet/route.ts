import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMonthSchedule, getNonShiftSchedule, isNonShiftPosition, isShiftPosition, getWorkingHours } from '@/lib/shift-utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1));
    const shiftNumber = parseInt(searchParams.get('shiftNumber') || '1');

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

    // ===== Режим руководителей (shiftNumber === 0) =====
    if (shiftNumber === 0) {
      // Получаем только руководителей без смены (Мастер ПУ, Начальник участка)
      const workers = await db.worker.findMany({
        where: { isActive: true, position: { in: ['master_pu', 'section_head'] } },
        include: { grade: true, equipment: true, professions: true },
        orderBy: [{ position: 'desc' }, { lastName: 'asc' }],
      });

      // Get attendance records for these workers
      const workerIds = workers.map(w => w.id);
      const attendance = await db.attendanceRecord.findMany({
        where: {
          workerId: { in: workerIds },
          date: { gte: startDateStr, lte: endDateStr },
        },
      });

      const attendanceMap = new Map<string, any>();
      for (const a of attendance) {
        const key = `${a.workerId}_${a.date}_${a.shiftType}`;
        attendanceMap.set(key, a);
      }

      // Статусы, при которых работник фактически работает
      const workingStatuses = new Set(['day', 'night', 'present']);

      const timesheet = workers.map(worker => {
        const days: any[] = [];
        let totalHours = 0;
        let totalNightHours = 0;
        let totalHolidayHours = 0;

        // Получаем индивидуальный график по должности
        const nonShiftSchedule = getNonShiftSchedule(worker.position, year, month);

        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
          const date = new Date(year, month - 1, day);
          const isHoliday = holidaySet.has(dateStr);
          const daySchedule = nonShiftSchedule.get(dateStr) || 'day_off';

          // Для руководителей shiftType всегда 'day' (8-часовой рабочий день)
          const shiftType = daySchedule === 'working' ? 'day' : null;

          let attendanceRecord = null;
          if (shiftType) {
            attendanceRecord = attendanceMap.get(`${worker.id}_${dateStr}_${shiftType}`);
          }

          let status: string = daySchedule === 'working' ? 'day' : 'off';
          if (attendanceRecord) {
            status = attendanceRecord.status;
          }

          const workerIsWorking = workingStatuses.has(status);

          // Часы — ТОЛЬКО из записей посещаемости
          if (attendanceRecord && workerIsWorking) {
            totalHours += attendanceRecord.hoursWorked || 0;
            totalNightHours += attendanceRecord.nightHours || 0;
            totalHolidayHours += attendanceRecord.holidayHours || 0;
          }

          days.push({
            day,
            date: dateStr,
            phase: daySchedule === 'working' ? 'day' as const : 'off' as const,
            shiftType,
            status,
            isHoliday,
            isCombination: false,
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
          isCombination: false,
          days,
          totalHours,
          totalNightHours,
          totalHolidayHours,
          totalCombinationHours: 0,
        };
      });

      return NextResponse.json({
        year,
        month,
        shiftNumber: 0,
        shiftName: 'Руководители',
        daysInMonth,
        timesheet,
      });
    }

    // ===== Обычный режим смены (shiftNumber 1-4) =====
    // Получаем сменных работников (worker + master), исключаем руководителей без смены
    const workers = await db.worker.findMany({
      where: { shiftNumber, isActive: true, position: { notIn: ['master_pu', 'section_head'] } },
      include: { grade: true, equipment: true, professions: true },
      orderBy: [
        { position: 'desc' },  // мастера сверху
        { lastName: 'asc' },
      ],
    });

    // Get attendance records
    const attendance = await db.attendanceRecord.findMany({
      where: {
        worker: { shiftNumber },
        date: { gte: startDateStr, lte: endDateStr },
      },
    });

    // Build attendance map: workerId_date_shiftType -> record
    const attendanceMap = new Map<string, any>();
    for (const a of attendance) {
      const key = `${a.workerId}_${a.date}_${a.shiftType}`;
      attendanceMap.set(key, a);
    }

    // Build schedule for this shift
    const schedule = getMonthSchedule(shiftNumber, year, month, scheduleStartDate);

    // Статусы, при которых работник фактически работает
    const workingStatuses = new Set(['day', 'night', 'present']);

    // Считаем сколько работников ФАКТИЧЕСКИ работают на каждом оборудовании в каждый день
    const equipmentDayPresence = new Map<string, number>();

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

    // Build timesheet
    const timesheet = workers.map(worker => {
      const days: any[] = [];
      let totalHours = 0;
      let totalNightHours = 0;
      let totalHolidayHours = 0;
      let totalCombinationHours = 0;
      let hasCombination = false;

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
        const date = new Date(year, month - 1, day);
        const phase = schedule.get(dateStr) || 'off';
        const isHoliday = holidaySet.has(dateStr);
        const shiftType = phase === 'day' ? 'day' : phase === 'night' ? 'night' : null;

        let attendanceRecord = null;
        if (shiftType) {
          attendanceRecord = attendanceMap.get(`${worker.id}_${dateStr}_${shiftType}`);
        }

        let status: string = phase;
        if (attendanceRecord) {
          status = attendanceRecord.status;
        }

        const workerIsWorking = workingStatuses.has(status);

        // Совмещение: на оборудовании в этот день работает только 1 человек вместо 2
        let isCombinationDay = false;
        if (worker.equipmentId && shiftType && workerIsWorking) {
          const presenceKey = `${worker.equipmentId}_${dateStr}`;
          const presentCount = equipmentDayPresence.get(presenceKey) || 0;
          if (presentCount === 1) {
            isCombinationDay = true;
          }
        }

        if (isCombinationDay) hasCombination = true;

        // Часы — ТОЛЬКО из записей посещаемости (фактически отработанное время)
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
      shiftNumber,
      daysInMonth,
      timesheet,
    });
  } catch (error) {
    console.error('Error generating timesheet:', error);
    return NextResponse.json({ error: 'Failed to generate timesheet' }, { status: 500 });
  }
}
