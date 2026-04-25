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
    // Даты переводов — доступны для сменовых вкладок
    let transferOutDates = new Map<string, string>(); // workerId -> effectiveDate (переведён ИЗ этой смены)
    let transferInDates = new Map<string, string>();   // workerId -> effectiveDate (переведён В эту смену)

    if (isLeaders) {
      // Вкладка «Руководители»: только несменные работники (shiftNumber = null)
      workers = await db.worker.findMany({
        where: { shiftNumber: null, isActive: true },
        include: { grade: true, equipment: true, professions: true },
        orderBy: { lastName: 'asc' },
      });

      const leaderWorkerIds = workers.map(w => w.id);
      attendance = leaderWorkerIds.length > 0
        ? await db.attendanceRecord.findMany({
            where: {
              workerId: { in: leaderWorkerIds },
              date: { gte: startDateStr, lte: endDateStr },
            },
          })
        : [];

      schedule = new Map();
    } else {
      const shiftNumber = parseInt(shiftNumberParam || '1');

      // ========== ПРИНЦИП: работник появляется в табеле смены ТОЛЬКО если: ==========
      // 1. Он сейчас в этой смене (shiftNumber === shiftNumber), ИЛИ
      // 2. Он был переведён ИЗ этой смены (есть распоряжение с fromShiftNumber)
      //    и перевод не откачён — тогда сохраняются его часы до перевода.
      //
      // Несменные руководители (shiftNumber = null) НЕ появляются в сменовых
      // вкладках — для них отдельная вкладка «Руководители».
      // Работник без распоряжения НЕ появляется в чужой смене.

      // 1. Работники, которые сейчас в этой смене
      const currentShiftWorkers = await db.worker.findMany({
        where: { shiftNumber, isActive: true },
        include: { grade: true, equipment: true, professions: true },
      });

      const currentShiftWorkerIds = new Set(currentShiftWorkers.map(w => w.id));

      // 2. Работники, переведённые ИЗ этой смены (источник истины — распоряжения)
      //    Только исполненные и не откачённые переводы, по активным распоряжениям.
      //    Несменные работники (shiftNumber = null на момент запроса) исключаются.
      const transferOutItems = await db.transferOrderItem.findMany({
        where: {
          fromShiftNumber: shiftNumber,
          executed: true,
          revertedAt: null,
          order: { status: { in: ['draft', 'approved'] } },
        },
        select: { workerId: true, effectiveDate: true },
      });

      // Убираем дубликаты и тех, кто уже в текущей смене
      const transferredWorkerIds = [...new Set(transferOutItems.map(i => i.workerId))]
        .filter(id => !currentShiftWorkerIds.has(id));

      // 3. Подгружаем данные переведённых работников
      let transferredWorkers: any[] = [];
      if (transferredWorkerIds.length > 0) {
        // Фильтруем: только сменные работники (shiftNumber !== null)
        // Несменные руководители не должны появляться в сменовых вкладках
        transferredWorkers = await db.worker.findMany({
          where: {
            id: { in: transferredWorkerIds },
            isActive: true,
            shiftNumber: { not: null },
          },
          include: { grade: true, equipment: true, professions: true },
        });
      }

      // 4. Объединяем: текущие + переведённые (без дубликатов)
      const workerMap = new Map<string, any>();
      for (const w of currentShiftWorkers) workerMap.set(w.id, w);
      for (const w of transferredWorkers) workerMap.set(w.id, w);
      workers = Array.from(workerMap.values()).sort((a, b) => a.lastName.localeCompare(b.lastName));

      // 5. Записи посещаемости — только для работников из нашего списка
      const workerIds = new Set(workers.map(w => w.id));
      attendance = workerIds.size > 0
        ? await db.attendanceRecord.findMany({
            where: {
              workerId: { in: Array.from(workerIds) },
              date: { gte: startDateStr, lte: endDateStr },
            },
          })
        : [];

      // 6. Даты переводов — определяем, с какого дня работник в этой смене
      //    transferOutDates: для переведённых ИЗ (дни ПОСЛЕ этой даты — серые)
      //    transferInDates: для переведённых В (дни ДО этой даты — серые)
      transferOutDates = new Map<string, string>(); // workerId -> effectiveDate
      for (const item of transferOutItems) {
        if (!currentShiftWorkerIds.has(item.workerId)) {
          // Работник уже не в этой смене — несколько записей, берём последнюю
          const existing = transferOutDates.get(item.workerId);
          if (!existing || item.effectiveDate > existing) {
            transferOutDates.set(item.workerId, item.effectiveDate);
          }
        }
      }

      transferInDates = new Map<string, string>(); // workerId -> effectiveDate
      const transferInItems = await db.transferOrderItem.findMany({
        where: {
          toShiftNumber: shiftNumber,
          executed: true,
          revertedAt: null,
          effectiveDate: { not: '' },
          order: { status: { in: ['draft', 'approved'] } },
        },
        select: { workerId: true, effectiveDate: true },
      });
      for (const item of transferInItems) {
        // Берём самую раннюю дату перевода в эту смену
        const existing = transferInDates.get(item.workerId);
        if (!existing || item.effectiveDate < existing) {
          transferInDates.set(item.workerId, item.effectiveDate);
        }
      }

      schedule = getMonthSchedule(shiftNumber, year, month, scheduleStartDate);
    }

    // Build attendance map: workerId_date_shiftType -> record
    const attendanceMap = new Map<string, any>();
    for (const a of attendance) {
      const key = `${a.workerId}_${a.date}_${a.shiftType}`;
      attendanceMap.set(key, a);
    }

    // Working statuses
    const workingStatuses = new Set(['day', 'night', 'present', 'working']);

    // Equipment day presence (for combination detection, shift workers only)
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

    // ========== MULTI-ROW TIMESHEET ==========
    // One row per (worker, gradeNumber, position) combination.
    // Days where the worker was in a DIFFERENT row are marked isOtherRow = true.
    // Transferred workers (now in a different shift) keep their hours from this shift.

    // 1. Collect all (gradeNumber, position) periods per worker
    //    Важно: старые записи с дефолтными gradeNumber=0, position="worker"
    //    не должны создавать фантомную подстроку, если текущая должность —
    //    не worker. Такие записи относятся к текущему периоду.
    const workerPeriods = new Map<string, Set<string>>();
    for (const worker of workers) {
      const periods = new Set<string>();
      const currentPeriod = `${worker.gradeNumber}_${worker.position || 'worker'}`;
      periods.add(currentPeriod);
      // Periods from attendance records
      for (const a of attendance) {
        if (a.workerId === worker.id) {
          let g = a.gradeNumber;
          let p = a.position;
          // Если запись имеет дефолтные значения (gradeNumber=0, position="worker"),
          // а текущая должность работника — не worker, значит это старая запись
          // до внедрения многострочного табеля. Относим её к текущему периоду.
          if (g === 0 && p === 'worker' && worker.position !== 'worker') {
            g = worker.gradeNumber;
            p = worker.position;
          }
          // Fallback для пустых значений
          if (!g) g = worker.gradeNumber;
          if (!p) p = worker.position || 'worker';
          periods.add(`${g}_${p}`);
        }
      }
      workerPeriods.set(worker.id, periods);
    }

    // 2. Build timesheet rows
    const timesheet: any[] = [];
    // Track which workers are transferred (not currently in this shift)
    const shiftNum = isLeaders ? 0 : parseInt(shiftNumberParam || '1');

    for (const worker of workers) {
      const periods = workerPeriods.get(worker.id)!;
      const periodArr = Array.from(periods).sort();
      const hasMultipleRows = periodArr.length > 1;
      const isTransferred = !isLeaders && worker.shiftNumber !== shiftNum;

      // For leaders, get their personal non-shift schedule
      // Все работники на вкладке «Руководители» получают 8-часовой график
      let leaderSchedule: Map<string, any> | null = null;
      if (isLeaders) {
        leaderSchedule = getNonShiftSchedule(worker.position, year, month);
      }

      for (const periodKey of periodArr) {
        const [gradeStr, position] = periodKey.split('_');
        const gradeNumber = parseInt(gradeStr);

        const days: any[] = [];
        let totalHours = 0;
        let totalNightHours = 0;
        let totalHolidayHours = 0;
        let totalCombinationHours = 0;
        let hasCombination = false;

        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
          const date = new Date(year, month - 1, day);
          const isHoliday = holidaySet.has(dateStr);

          let phase: string;
          let shiftType: string | null;

          if (isLeaders && leaderSchedule) {
            const daySchedule = leaderSchedule.get(dateStr);
            // Используем 'day' вместо 'working', чтобы фронтенд корректно
            // отображал рабочие дни руководителей как активные ячейки «Д»
            phase = daySchedule === 'working' ? 'day' : 'off';
            shiftType = daySchedule === 'working' ? 'day' : null;
          } else {
            phase = schedule.get(dateStr) || 'off';
            shiftType = phase === 'day' ? 'day' : phase === 'night' ? 'night' : null;
          }

          let attendanceRecord = null;
          if (shiftType) {
            attendanceRecord = attendanceMap.get(`${worker.id}_${dateStr}_${shiftType}`);
          }

          // Определяем дату перевода для этого работника
          const transferOutDate = transferOutDates.get(worker.id); // дата ухода из этой смены
          const transferInDate = transferInDates.get(worker.id);   // дата прихода в эту смену

          // Переведён ИЗ этой смены: дни после даты перевода — серые
          // (работник уже в другой смене, часы сохранены до даты перевода)
          let isTransferredDay = false;
          if (isTransferred) {
            if (transferOutDate) {
              // Есть точная дата — серые ячейки строго после неё
              if (dateStr > transferOutDate) {
                isTransferredDay = true;
              }
            } else if (!attendanceRecord) {
              // Нет даты и нет записи — на всякий случай серое
              isTransferredDay = true;
            }
          }

          // Переведён В эту смену: дни до даты перевода — серые
          // (работник ещё не был в этой смене, удобный визуальный контроль)
          let isBeforeTransferIn = false;
          if (!isLeaders && transferInDate && dateStr < transferInDate) {
            // Работник переведён в эту смену, но в этот день он был в другой
            isBeforeTransferIn = true;
          }

          let status: string = phase;
          if (attendanceRecord) {
            status = attendanceRecord.status;
          } else if (isTransferredDay || isBeforeTransferIn) {
            status = 'off';
          }

          // Determine if this day belongs to THIS row or another row
          let isOtherRow = false;
          if (hasMultipleRows) {
            if (attendanceRecord) {
              let recordGrade = attendanceRecord.gradeNumber || 0;
              let recordPosition = attendanceRecord.position || 'worker';
              // Старые записи с дефолтными значениями относим к текущему периоду
              // (аналогично логике при сборке periods выше)
              if (recordGrade === 0 && recordPosition === 'worker' && worker.position !== 'worker') {
                recordGrade = worker.gradeNumber;
                recordPosition = worker.position;
              }
              if (recordGrade !== gradeNumber || recordPosition !== position) {
                isOtherRow = true;
              }
            } else {
              const isCurrentPeriod = (gradeNumber === worker.gradeNumber && position === (worker.position || 'worker'));
              if (!isCurrentPeriod) {
                isOtherRow = true;
              }
            }
          }

          const isInactiveDay = isOtherRow || isTransferredDay || isBeforeTransferIn;
          const workerIsWorking = !isInactiveDay && workingStatuses.has(status);

          // Combination (shift workers only)
          let isCombinationDay = false;
          if (!isLeaders && !isInactiveDay && worker.equipmentId && shiftType && workerIsWorking) {
            const presenceKey = `${worker.equipmentId}_${dateStr}`;
            const presentCount = equipmentDayPresence.get(presenceKey) || 0;
            if (presentCount === 1) {
              isCombinationDay = true;
            }
          }

          if (isCombinationDay) hasCombination = true;

          // Hours from attendance records only, for this row's days
          if (!isInactiveDay && attendanceRecord && workerIsWorking) {
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
            isOtherRow,
            isTransferredDay,
            isBeforeTransferIn,
            attendanceRecord,
          });
        }

        timesheet.push({
          workerId: worker.id,
          lastName: worker.lastName,
          firstName: worker.firstName,
          patronymic: worker.patronymic,
          gradeNumber,
          position: position || 'worker',
          equipment: worker.equipment?.name || '',
          professions: worker.professions?.map((p: any) => p.professionName) || [],
          isCombination: hasCombination,
          isNonShift: isLeaders,
          isSubRow: hasMultipleRows,
          isTransferred: isTransferred ? worker.shiftNumber : false,
          days,
          totalHours,
          totalNightHours,
          totalHolidayHours,
          totalCombinationHours,
        });
      }
    }

    // 3. Compute totals per worker (sum across all rows)
    const workerTotals = new Map<string, { hours: number; night: number; holiday: number; combination: number }>();
    for (const row of timesheet) {
      const existing = workerTotals.get(row.workerId) || { hours: 0, night: 0, holiday: 0, combination: 0 };
      existing.hours += row.totalHours;
      existing.night += row.totalNightHours;
      existing.holiday += row.totalHolidayHours;
      existing.combination += row.totalCombinationHours;
      workerTotals.set(row.workerId, existing);
    }

    return NextResponse.json({
      year,
      month,
      shiftNumber: isLeaders ? 0 : parseInt(shiftNumberParam || '1'),
      daysInMonth,
      isLeaders,
      timesheet,
      workerTotals: Object.fromEntries(workerTotals),
    });
  } catch (error) {
    console.error('Error generating timesheet:', error);
    return NextResponse.json({ error: 'Failed to generate timesheet' }, { status: 500 });
  }
}
