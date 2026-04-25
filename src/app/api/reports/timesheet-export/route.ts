import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { db } from '@/lib/db';
import { getMonthSchedule, getNonShiftSchedule } from '@/lib/shift-utils';

// Status display map for Excel cells
const STATUS_SHORT: Record<string, string> = {
  day: 'Д',
  night: 'Н',
  rest: 'О',
  off: 'В',
  present: 'П',
  absent: 'НП',
  sick: 'Б',
  vacation: 'ОП',
  day_off: 'ОГ',
  transfer: 'ПР',
  state_duty: 'Г',
  collective_agreement: 'КД',
  substitution: 'ПМ',
};

// Cell fill colors for different statuses
const STATUS_FILLS: Record<string, Partial<ExcelJS.FillPattern>> = {
  day:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } },
  night: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } },
  rest:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } },
  off:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } },
  present: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } },
  absent:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } },
  sick:    { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBBF24' } },
  vacation: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22D3EE' } },
  day_off:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFB923C' } },
  transfer: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA855F7' } },
  state_duty: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF818CF8' } },
  collective_agreement: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF472B6' } },
  substitution: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2DD4BF' } },
  inactive: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } },
};

const LIGHT_FONT: Set<string> = new Set(['present', 'absent', 'vacation', 'day_off', 'transfer', 'state_duty', 'collective_agreement', 'substitution']);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1));
    // shiftNumber is ignored — we export ALL workers grouped by equipment

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

    // ===== FETCH ALL ACTIVE WORKERS (all shifts + leaders) =====
    const allWorkers = await db.worker.findMany({
      where: { isActive: true },
      include: { grade: true, equipment: true, professions: true },
      orderBy: { lastName: 'asc' },
    });

    const allWorkerIds = allWorkers.map(w => w.id);

    // Fetch ALL attendance records for the month
    const attendance = allWorkerIds.length > 0
      ? await db.attendanceRecord.findMany({
          where: {
            workerId: { in: allWorkerIds },
            date: { gte: startDateStr, lte: endDateStr },
          },
        })
      : [];

    // Attendance map: workerId_date_shiftType -> record
    const attendanceMap = new Map<string, any>();
    for (const a of attendance) {
      attendanceMap.set(`${a.workerId}_${a.date}_${a.shiftType}`, a);
    }

    // ===== FETCH ALL TRANSFER ORDER ITEMS =====
    const allTransferItems = await db.transferOrderItem.findMany({
      where: {
        executed: true,
        revertedAt: null,
        order: { status: { in: ['draft', 'approved'] } },
      },
      select: {
        workerId: true,
        effectiveDate: true,
        fromShiftNumber: true,
        toShiftNumber: true,
      },
    });

    // Build per-worker transfer history:
    // workerTransfers: workerId -> sorted list of { effectiveDate, fromShift, toShift }
    const workerTransfers = new Map<string, { effectiveDate: string; fromShift: number | null; toShift: number | null }[]>();
    for (const item of allTransferItems) {
      if (!workerTransfers.has(item.workerId)) workerTransfers.set(item.workerId, []);
      workerTransfers.get(item.workerId)!.push({
        effectiveDate: item.effectiveDate,
        fromShift: item.fromShiftNumber,
        toShift: item.toShiftNumber,
      });
    }
    // Sort each worker's transfers by effectiveDate
    for (const [_wid, transfers] of workerTransfers) {
      transfers.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
    }

    // Determine which shift a worker was in on a given date
    function getWorkerShiftOnDate(worker: any, dateStr: string): number | null {
      const transfers = workerTransfers.get(worker.id);
      if (!transfers || transfers.length === 0) return worker.shiftNumber;

      // Walk through transfers in order — each transfer moves the worker
      // Start from the worker's current shiftNumber (which is their LATEST assignment)
      // and work backwards through transfers
      let currentShift = worker.shiftNumber;
      // Apply transfers from newest to oldest
      for (let i = transfers.length - 1; i >= 0; i--) {
        const t = transfers[i];
        // If the transfer's effectiveDate is AFTER the target date,
        // the worker hadn't moved yet, so undo this transfer
        if (t.effectiveDate > dateStr) {
          if (t.fromShiftNumber != null) {
            currentShift = t.fromShiftNumber;
          }
        }
      }
      return currentShift;
    }

    // ===== COMPUTE PER-WORKER SCHEDULE =====
    // For each worker, pre-compute their schedule for each day of the month,
    // accounting for transfers (different shifts on different days).
    const workerDaySchedule = new Map<string, { phase: string; shiftType: string | null }[]>();

    // Pre-compute all shift schedules
    const shiftSchedules = new Map<number, Map<string, any>>();
    for (let s = 1; s <= 4; s++) {
      shiftSchedules.set(s, getMonthSchedule(s, year, month, scheduleStartDate));
    }

    for (const worker of allWorkers) {
      const dayData: { phase: string; shiftType: string | null }[] = [];
      const isLeader = worker.shiftNumber == null;

      if (isLeader) {
        // Non-shift leader: use their personal schedule
        const leaderSched = getNonShiftSchedule(worker.position, year, month);
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
          const ds = leaderSched.get(dateStr);
          dayData.push({
            phase: ds === 'working' ? 'day' : 'off',
            shiftType: ds === 'working' ? 'day' : null,
          });
        }
      } else {
        // Shift worker: might change shifts mid-month due to transfers
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
          const shiftOnDate = getWorkerShiftOnDate(worker, dateStr);
          const sched = shiftOnDate != null ? shiftSchedules.get(shiftOnDate) : null;
          const phase = sched?.get(dateStr) || 'off';
          const shiftType = phase === 'day' ? 'day' : phase === 'night' ? 'night' : null;
          dayData.push({ phase, shiftType });
        }
      }

      workerDaySchedule.set(worker.id, dayData);
    }

    const workingStatuses = new Set(['day', 'night', 'present', 'working']);

    // ===== EQUIPMENT DAY PRESENCE (for combination detection) =====
    const equipmentDayPresence = new Map<string, number>();
    for (const worker of allWorkers) {
      if (!worker.equipmentId) continue;
      const dayData = workerDaySchedule.get(worker.id);
      if (!dayData) continue;

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
        const { phase, shiftType } = dayData[day - 1];
        if (!shiftType) continue;

        const record = attendanceMap.get(`${worker.id}_${dateStr}_${shiftType}`);
        const isWorking = record ? workingStatuses.has(record.status) : (phase === 'day' || phase === 'night');
        if (isWorking) {
          const key = `${worker.equipmentId}_${dateStr}`;
          equipmentDayPresence.set(key, (equipmentDayPresence.get(key) || 0) + 1);
        }
      }
    }

    // ===== MULTI-ROW TIMESHEET =====
    const workerPeriods = new Map<string, Set<string>>();
    for (const worker of allWorkers) {
      const periods = new Set<string>();
      periods.add(`${worker.gradeNumber}_${worker.position || 'worker'}`);
      for (const a of attendance) {
        if (a.workerId === worker.id) {
          let g = a.gradeNumber, p = a.position;
          if (g === 0 && p === 'worker' && worker.position !== 'worker') {
            g = worker.gradeNumber;
            p = worker.position;
          }
          if (!g) g = worker.gradeNumber;
          if (!p) p = worker.position || 'worker';
          periods.add(`${g}_${p}`);
        }
      }
      workerPeriods.set(worker.id, periods);
    }

    // Build timesheet rows
    const timesheet: any[] = [];

    for (const worker of allWorkers) {
      const periods = workerPeriods.get(worker.id)!;
      const periodArr = Array.from(periods).sort();
      const hasMultipleRows = periodArr.length > 1;
      const isLeader = worker.shiftNumber == null;
      const dayData = workerDaySchedule.get(worker.id)!;

      for (const periodKey of periodArr) {
        const [gradeStr, position] = periodKey.split('_');
        const gradeNumber = parseInt(gradeStr);
        const days: any[] = [];
        let totalHours = 0, totalNightHours = 0, totalHolidayHours = 0, totalCombinationHours = 0;

        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
          const { phase, shiftType } = dayData[day - 1];

          let attendanceRecord = shiftType ? attendanceMap.get(`${worker.id}_${dateStr}_${shiftType}`) : null;

          let status: string = phase;
          if (attendanceRecord) status = attendanceRecord.status;

          let isOtherRow = false;
          if (hasMultipleRows) {
            if (attendanceRecord) {
              let rg = attendanceRecord.gradeNumber || 0, rp = attendanceRecord.position || 'worker';
              if (rg === 0 && rp === 'worker' && worker.position !== 'worker') {
                rg = worker.gradeNumber;
                rp = worker.position;
              }
              if (rg !== gradeNumber || rp !== position) isOtherRow = true;
            } else {
              if (!(gradeNumber === worker.gradeNumber && position === (worker.position || 'worker'))) isOtherRow = true;
            }
          }

          const isInactiveDay = isOtherRow;
          const workerIsWorking = !isInactiveDay && workingStatuses.has(status);

          let isCombinationDay = false;
          if (!isInactiveDay && worker.equipmentId && shiftType && workerIsWorking) {
            if ((equipmentDayPresence.get(`${worker.equipmentId}_${dateStr}`) || 0) === 1) {
              isCombinationDay = true;
            }
          }

          if (!isInactiveDay && attendanceRecord && workerIsWorking) {
            totalHours += attendanceRecord.hoursWorked || 0;
            totalNightHours += attendanceRecord.nightHours || 0;
            totalHolidayHours += attendanceRecord.holidayHours || 0;
            if (isCombinationDay) totalCombinationHours += attendanceRecord.hoursWorked || 0;
          }

          days.push({ day, date: dateStr, status, isOtherRow, isCombination: isCombinationDay });
        }

        timesheet.push({
          workerId: worker.id,
          lastName: worker.lastName,
          firstName: worker.firstName,
          patronymic: worker.patronymic,
          gradeNumber,
          position: position || 'worker',
          equipmentId: worker.equipmentId,
          equipment: worker.equipment?.name || '',
          shiftNumber: worker.shiftNumber,
          isLeader,
          isSubRow: hasMultipleRows,
          days,
          totalHours,
          totalNightHours,
          totalHolidayHours,
          totalCombinationHours,
        });
      }
    }

    // ========== GROUP BY EQUIPMENT ==========
    const equipmentGroups = new Map<string, typeof timesheet>();
    for (const row of timesheet) {
      const key = row.isLeader ? 'Руководители' : (row.equipment || 'Без оборудования');
      if (!equipmentGroups.has(key)) equipmentGroups.set(key, []);
      equipmentGroups.get(key)!.push(row);
    }

    // Sort equipment groups: Руководители last, then Без оборудования before it,
    // equipment names alphabetically
    const sortedEquipNames = Array.from(equipmentGroups.keys()).sort((a, b) => {
      if (a === 'Руководители') return 1;
      if (b === 'Руководители') return -1;
      if (a === 'Без оборудования') return 1;
      if (b === 'Без оборудования') return -1;
      return a.localeCompare(b);
    });

    // ========== GENERATE EXCEL ==========
    const workbook = new ExcelJS.Workbook();
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    const ws = workbook.addWorksheet(`Табель ${monthNames[month - 1]} ${year}`);

    // Column widths
    ws.columns = [
      { width: 5 },   // A: №
      { width: 22 },  // B: ФИО
      { width: 8 },   // C: Разряд/Должность
      { width: 7 },   // D: Смена
      ...Array.from({ length: daysInMonth }, () => ({ width: 4.5 })),
      { width: 9 },   // Часы
      { width: 8 },   // Ночные
      { width: 9 },   // Праздничные
      { width: 9 },   // Совмещение
    ];

    // --- Title row ---
    const titleRow = ws.addRow([`Табель учёта рабочего времени — ${monthNames[month - 1]} ${year} (по оборудованию)`]);
    ws.mergeCells(1, 1, 1, daysInMonth + 8);
    titleRow.getCell(1).font = { size: 14, bold: true };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 30;

    // --- Header row ---
    const headerRow = ws.addRow([
      '№', 'ФИО', 'Разр.', 'См.',
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
      'Часы', 'Ночн.', 'Праздн.', 'Совм.',
    ]);
    headerRow.height = 22;
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { size: 9, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

      if (colNumber >= 5 && colNumber <= 4 + daysInMonth) {
        const day = colNumber - 4;
        const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
        if (holidaySet.has(dateStr)) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          cell.font = { size: 9, bold: true, color: { argb: 'FFDC2626' } };
        } else {
          const date = new Date(year, month - 1, day);
          if (date.getDay() === 0 || date.getDay() === 6) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
            cell.font = { size: 9, bold: true, color: { argb: 'FFD97706' } };
          }
        }
      }
    });

    // --- Data rows grouped by equipment ---
    const posMap: Record<string, string> = {
      worker: 'разр.',
      master: 'Мастер',
      master_pu: 'М.ПУ',
      section_head: 'НУ',
    };

    let globalRowNum = 1;
    let grandTotalHours = 0, grandTotalNight = 0, grandTotalHoliday = 0, grandTotalCombination = 0;

    for (const equipName of sortedEquipNames) {
      const equipRows = equipmentGroups.get(equipName)!;

      // --- Equipment header row ---
      const equipHeaderData: (string | number)[] = [equipName];
      for (let i = 1; i < daysInMonth + 7; i++) equipHeaderData.push('');
      const equipHeaderRow = ws.addRow(equipHeaderData);
      ws.mergeCells(equipHeaderRow.number, 1, equipHeaderRow.number, daysInMonth + 8);
      equipHeaderRow.height = 22;

      // Different colors for leaders vs equipment
      const isLeadersGroup = equipName === 'Руководители';
      const headerFgColor = isLeadersGroup ? 'FF1E40AF' : 'FF334155'; // blue-800 vs slate-700
      equipHeaderRow.getCell(1).font = { size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      equipHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerFgColor } };
      equipHeaderRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

      // Group workers by workerId for multi-row totals
      const workerGroups: {
        workerId: string;
        rows: typeof equipRows;
        totals: { hours: number; night: number; holiday: number; combination: number };
      }[] = [];
      let curWg: {
        workerId: string;
        rows: typeof equipRows;
        totals: { hours: number; night: number; holiday: number; combination: number };
      } | null = null;
      for (const row of equipRows) {
        if (!curWg || curWg.workerId !== row.workerId) {
          curWg = { workerId: row.workerId, rows: [], totals: { hours: 0, night: 0, holiday: 0, combination: 0 } };
          workerGroups.push(curWg);
        }
        curWg.rows.push(row);
        curWg.totals.hours += row.totalHours;
        curWg.totals.night += row.totalNightHours;
        curWg.totals.holiday += row.totalHolidayHours;
        curWg.totals.combination += row.totalCombinationHours;
      }

      let equipTotalHours = 0, equipTotalNight = 0, equipTotalHoliday = 0, equipTotalCombination = 0;

      for (const wg of workerGroups) {
        const hasMultiple = wg.rows.length > 1;

        for (let ri = 0; ri < wg.rows.length; ri++) {
          const worker = wg.rows[ri];
          const data: (string | number)[] = [];

          // №
          data.push(ri === 0 ? globalRowNum : '');
          // ФИО
          data.push(ri === 0 ? `${worker.lastName} ${worker.firstName[0]}.${worker.patronymic ? worker.patronymic[0] + '.' : ''}` : '  ↳');
          // Разряд/Должность
          data.push(worker.position !== 'worker' ? (posMap[worker.position] || worker.position) : `${worker.gradeNumber} разр.`);
          // Смена
          data.push(worker.isLeader ? '—' : String(worker.shiftNumber || ''));

          // Days
          for (const day of worker.days) {
            if (day.isOtherRow) {
              data.push('');
            } else {
              data.push(STATUS_SHORT[day.status] || day.status);
            }
          }

          // Totals
          data.push(worker.totalHours || '');
          data.push(worker.totalNightHours || '');
          data.push(worker.totalHolidayHours || '');
          data.push(worker.totalCombinationHours || '');

          const row = ws.addRow(data);
          row.height = 18;

          row.eachCell((cell, colNumber) => {
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };

            if (colNumber === 2) {
              cell.alignment = { horizontal: 'left', vertical: 'middle' };
              cell.font = ri === 0 ? { size: 10, bold: true } : { size: 9, color: { argb: 'FF6B7280' } };
            }

            // Day cells — color by status
            if (colNumber >= 5 && colNumber <= 4 + daysInMonth) {
              const dayIndex = colNumber - 5;
              if (dayIndex < worker.days.length) {
                const dayData = worker.days[dayIndex];
                if (dayData.isOtherRow) {
                  cell.fill = STATUS_FILLS.inactive!;
                } else if (STATUS_FILLS[dayData.status]) {
                  cell.fill = STATUS_FILLS[dayData.status]!;
                  if (LIGHT_FONT.has(dayData.status)) {
                    cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
                  } else {
                    cell.font = { size: 9, bold: true };
                  }
                }
              }
            }

            // Totals columns
            const totalBase = 5 + daysInMonth;
            if (colNumber === totalBase) cell.font = { size: 10, bold: true, color: { argb: 'FF059669' } };
            if (colNumber === totalBase + 1) cell.font = { size: 10, color: { argb: 'FF2563EB' } };
            if (colNumber === totalBase + 2) cell.font = { size: 10, color: { argb: 'FFDC2626' } };
            if (colNumber === totalBase + 3 && worker.totalCombinationHours > 0) {
              cell.font = { size: 10, color: { argb: 'FFE11D48' } };
            }
          });
        }

        // Worker total row (if multiple sub-rows)
        if (hasMultiple) {
          const totalData: (string | number)[] = ['', '', 'ИТОГО', ''];
          for (let i = 0; i < daysInMonth; i++) totalData.push('');
          totalData.push(wg.totals.hours);
          totalData.push(wg.totals.night);
          totalData.push(wg.totals.holiday);
          totalData.push(wg.totals.combination);

          const totalRow = ws.addRow(totalData);
          totalRow.height = 18;
          const totalBase = 5 + daysInMonth;
          totalRow.eachCell((cell, colNumber) => {
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            if (colNumber === 3) {
              cell.font = { size: 10, bold: true };
              cell.alignment = { horizontal: 'left', vertical: 'middle' };
            }
            if (colNumber === totalBase) cell.font = { size: 10, bold: true, color: { argb: 'FF059669' } };
            if (colNumber === totalBase + 1) cell.font = { size: 10, bold: true, color: { argb: 'FF2563EB' } };
            if (colNumber === totalBase + 2) cell.font = { size: 10, bold: true, color: { argb: 'FFDC2626' } };
            if (colNumber === totalBase + 3) cell.font = { size: 10, bold: true, color: { argb: 'FFE11D48' } };
          });
        }

        equipTotalHours += wg.totals.hours;
        equipTotalNight += wg.totals.night;
        equipTotalHoliday += wg.totals.holiday;
        equipTotalCombination += wg.totals.combination;
        globalRowNum++;
      }

      // --- Equipment total row ---
      const equipTotalData: (string | number)[] = ['', '', `ИТОГО по "${equipName}"`, ''];
      for (let i = 0; i < daysInMonth; i++) equipTotalData.push('');
      equipTotalData.push(equipTotalHours);
      equipTotalData.push(equipTotalNight);
      equipTotalData.push(equipTotalHoliday);
      equipTotalData.push(equipTotalCombination);

      const equipTotalRow = ws.addRow(equipTotalData);
      equipTotalRow.height = 20;
      const totalBase = 5 + daysInMonth;
      equipTotalRow.eachCell((cell, colNumber) => {
        cell.border = { top: { style: 'medium' }, left: { style: 'thin' }, bottom: { style: 'double' }, right: { style: 'thin' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } }; // emerald-50
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (colNumber === 3) {
          cell.font = { size: 10, bold: true };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
        if (colNumber === totalBase) cell.font = { size: 11, bold: true, color: { argb: 'FF059669' } };
        if (colNumber === totalBase + 1) cell.font = { size: 11, bold: true, color: { argb: 'FF2563EB' } };
        if (colNumber === totalBase + 2) cell.font = { size: 11, bold: true, color: { argb: 'FFDC2626' } };
        if (colNumber === totalBase + 3) cell.font = { size: 11, bold: true, color: { argb: 'FFE11D48' } };
      });

      grandTotalHours += equipTotalHours;
      grandTotalNight += equipTotalNight;
      grandTotalHoliday += equipTotalHoliday;
      grandTotalCombination += equipTotalCombination;

      // Empty row between equipment groups
      ws.addRow([]);
    }

    // --- Grand total row ---
    const grandData: (string | number)[] = ['', '', 'ВСЕГО', ''];
    for (let i = 0; i < daysInMonth; i++) grandData.push('');
    grandData.push(grandTotalHours);
    grandData.push(grandTotalNight);
    grandData.push(grandTotalHoliday);
    grandData.push(grandTotalCombination);

    const grandRow = ws.addRow(grandData);
    grandRow.height = 22;
    const totalBase = 5 + daysInMonth;
    grandRow.eachCell((cell, colNumber) => {
      cell.border = { top: { style: 'double' }, left: { style: 'thin' }, bottom: { style: 'medium' }, right: { style: 'thin' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } }; // green-50
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (colNumber === 3) {
        cell.font = { size: 12, bold: true };
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
      if (colNumber === totalBase) cell.font = { size: 12, bold: true, color: { argb: 'FF059669' } };
      if (colNumber === totalBase + 1) cell.font = { size: 12, bold: true, color: { argb: 'FF2563EB' } };
      if (colNumber === totalBase + 2) cell.font = { size: 12, bold: true, color: { argb: 'FFDC2626' } };
      if (colNumber === totalBase + 3) cell.font = { size: 12, bold: true, color: { argb: 'FFE11D48' } };
    });

    // --- Legend ---
    ws.addRow([]);
    const legendRow = ws.addRow([
      'Обозначения:', 'Д — День', 'Н — Ночь', 'О — Отсыпной', 'В — Выходной',
      'П — Явка', 'НП — Неявка', 'Б — Больничный', 'ОП — Отпуск', 'ОГ — Отгул',
      'ПР — Перевод', 'Г — Гос.об.', 'КД — Колдоговор', 'ПМ — Подмена',
    ]);
    legendRow.eachCell((cell) => { cell.font = { size: 8, color: { argb: 'FF6B7280' } }; });

    // Freeze panes: freeze first 2 rows (title + header) and first 4 columns (№, ФИО, Разр., См.)
    ws.views = [{ state: 'frozen', xSplit: 4, ySplit: 2 }];

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `Табель_${monthNames[month - 1]}_${year}_по_оборудованию.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting timesheet:', error);
    return NextResponse.json({ error: 'Failed to export timesheet' }, { status: 500 });
  }
}
