import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getWorkingShifts, formatDate } from '@/lib/shift-utils';

export async function GET() {
  try {
    const today = new Date();
    const todayStr = formatDate(today);

    // Get schedule config
    const config = await db.scheduleConfig.findUnique({ where: { key: 'start_date' } });
    const startDate = config ? new Date(config.value + 'T00:00:00') : new Date('2026-01-01T00:00:00');

    const { dayShift, nightShift } = getWorkingShifts(today, startDate);

    // Get shift details
    const shifts = await db.shift.findMany({
      include: {
        master: { select: { name: true } },
        workers: { where: { isActive: true }, select: { id: true } },
      },
      orderBy: { number: 'asc' },
    });

    // Count active workers
    const activeWorkers = await db.worker.count({ where: { isActive: true } });

    // Count present today
    const presentToday = await db.attendanceRecord.count({
      where: { date: todayStr, status: 'present' },
    });

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

    return NextResponse.json({
      today: todayStr,
      dayOfMonth,
      dayShift,
      nightShift,
      shifts: shifts.map(s => ({
        number: s.number,
        name: s.name,
        masterName: s.master?.name || 'Не назначен',
        workerCount: s.workers.length,
      })),
      activeWorkers,
      presentToday,
      unreadNotifications,
      recentLogs,
      notificationMessage,
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
