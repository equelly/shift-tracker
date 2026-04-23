import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getWorkingShifts, formatDate, isNonShiftPosition } from '@/lib/shift-utils';

export async function GET() {
  try {
    const today = new Date();
    const todayStr = formatDate(today);

    // Get schedule config
    const config = await db.scheduleConfig.findUnique({ where: { key: 'start_date' } });
    const startDate = config ? new Date(config.value + 'T00:00:00') : new Date('2026-01-01T00:00:00');

    const { dayShift, nightShift } = getWorkingShifts(today, startDate);

    // Get shift details with worker-level master names
    const shifts = await db.shift.findMany({
      include: {
        workers: {
          where: { isActive: true },
          select: { id: true, position: true, lastName: true, firstName: true, patronymic: true },
        },
      },
      orderBy: { number: 'asc' },
    });

    // Get master names from Worker table (position='master')
    const shiftData = shifts.map(s => {
      const master = s.workers.find(w => w.position === 'master');
      const masterName = master
        ? `${master.lastName} ${master.firstName[0]}.${master.patronymic ? ` ${master.patronymic[0]}.` : ''}`
        : 'Не назначен';
      const workerCount = s.workers.filter(w => w.position !== 'master').length;

      return {
        number: s.number,
        name: s.name,
        masterName,
        workerCount,
      };
    });

    // Count active workers (excluding non-shift positions from shift counts)
    const activeWorkers = await db.worker.count({ where: { isActive: true } });

    // Count present today (from attendance records)
    const presentToday = await db.attendanceRecord.count({
      where: { date: todayStr, status: 'present' },
    });

    // Count non-shift leaders present today
    const nonShiftWorkers = await db.worker.findMany({
      where: { isActive: true, position: { in: ['master_pu', 'section_head'] } },
      select: { id: true, position: true },
    });

    // Get day of week for non-shift schedule
    const dow = today.getDay(); // 0=Вс, 1=Пн, ..., 5=Пт, 6=Сб
    let nonShiftPresent = 0;
    for (const nsw of nonShiftWorkers) {
      let isDayOff = false;
      if (nsw.position === 'master_pu') {
        isDayOff = dow === 5 || dow === 6; // Пт+Сб
      } else if (nsw.position === 'section_head') {
        isDayOff = dow === 0 || dow === 1; // Вс+Пн
      }
      if (!isDayOff) nonShiftPresent++;
    }

    // Unread notifications count
    const unreadNotifications = await db.notification.count({
      where: { isRead: false },
    });

    // Recent audit logs
    const recentLogs = await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    // Check if notification needed (15th or 25th)
    const dayOfMonth = today.getDate();
    let notificationMessage = '';
    if (dayOfMonth >= 13 && dayOfMonth <= 15) {
      notificationMessage = 'Напоминание: закройте наряды до 15 числа для формирования аванса!';
    } else if (dayOfMonth >= 23 && dayOfMonth <= 25) {
      notificationMessage = 'Напоминание: закройте наряды до 25 числа для формирования зарплаты!';
    }

    // Non-shift leaders info
    const leadersInfo = nonShiftWorkers.map(w => ({
      id: w.id,
      position: w.position,
      positionLabel: w.position === 'master_pu' ? 'Мастер ПУ' : 'Начальник участка',
      isWorkingToday: (() => {
        if (w.position === 'master_pu') return dow !== 5 && dow !== 6;
        if (w.position === 'section_head') return dow !== 0 && dow !== 1;
        return true;
      })(),
    }));

    return NextResponse.json({
      today: todayStr,
      dayOfMonth,
      dayShift,
      nightShift,
      shifts: shiftData,
      activeWorkers,
      presentToday: presentToday + nonShiftPresent,
      unreadNotifications,
      recentLogs,
      notificationMessage,
      leaders: leadersInfo,
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
