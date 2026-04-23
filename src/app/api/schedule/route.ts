import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getMonthSchedule, getWorkingShifts, formatDate, ShiftPhase } from '@/lib/shift-utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1));
    const shiftNumber = searchParams.get('shiftNumber') ? parseInt(searchParams.get('shiftNumber')!) : null;

    // Get start date from config
    const config = await db.scheduleConfig.findUnique({ where: { key: 'start_date' } });
    if (!config) {
      return NextResponse.json({ error: 'Start date not configured' }, { status: 400 });
    }
    const startDate = new Date(config.value + 'T00:00:00');

    // Get holidays for the month
    const holidays = await db.holiday.findMany();
    const holidaySet = new Set(holidays.map(h => h.date));

    const daysInMonth = new Date(year, month, 0).getDate();
    const days: any[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dateStr = formatDate(date);
      const isHoliday = holidaySet.has(dateStr);
      const { dayShift, nightShift } = getWorkingShifts(date, startDate);

      const dayInfo: any = {
        date: dateStr,
        day,
        dayOfWeek: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][date.getDay()],
        isHoliday,
        holidayName: isHoliday ? holidays.find(h => h.date === dateStr)?.name : null,
        dayShiftNumber: dayShift,
        nightShiftNumber: nightShift,
      };

      // Add shift-specific info if requested
      if (shiftNumber) {
        const schedule = getMonthSchedule(shiftNumber, year, month, startDate);
        const phase = schedule.get(dateStr);
        dayInfo.shiftPhase = phase;
      }

      days.push(dayInfo);
    }

    // Get attendance records for the month
    const startDateStr = formatDate(new Date(year, month - 1, 1));
    const endDateStr = formatDate(new Date(year, month - 1, daysInMonth));

    const attendanceFilter: any = {
      date: { gte: startDateStr, lte: endDateStr },
    };
    if (shiftNumber) {
      attendanceFilter.worker = { shiftNumber };
    }

    const attendance = await db.attendanceRecord.findMany({
      where: attendanceFilter,
      include: { worker: { select: { id: true, lastName: true, firstName: true, gradeNumber: true } } },
    });

    // Get workers for the shift(s)
    const workerFilter: any = { isActive: true };
    if (shiftNumber) workerFilter.shiftNumber = shiftNumber;

    const workers = await db.worker.findMany({
      where: workerFilter,
      include: { grade: true, equipment: true, professions: true, benefits: true },
      orderBy: [{ shiftNumber: 'asc' }, { lastName: 'asc' }],
    });

    return NextResponse.json({
      year,
      month,
      days,
      workers,
      attendance,
      startDate: config.value,
    });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
  }
}
