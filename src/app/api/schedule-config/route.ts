import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getShiftPhase, formatDate } from '@/lib/shift-utils';

export async function GET() {
  try {
    const config = await db.scheduleConfig.findUnique({ where: { key: 'start_date' } });
    const startDateStr = config?.value || '2026-01-01';
    const startDate = new Date(startDateStr + 'T00:00:00');
    const today = new Date();

    const phases = [1, 2, 3].map(shiftNumber => {
      const phase = getShiftPhase(shiftNumber, today, startDate);
      const labels: Record<string, { label: string; short: string }> = {
        day: { label: 'День (7:30–19:30)', short: 'Д' },
        night: { label: 'Ночь (19:30–7:30)', short: 'Н' },
        rest: { label: 'Отсыпной', short: 'О' },
        off: { label: 'Выходной', short: 'В' },
      };
      return {
        shiftNumber,
        phase,
        label: labels[phase].label,
        shortLabel: labels[phase].short,
      };
    });

    return NextResponse.json({
      startDate: startDateStr,
      today: formatDate(today),
      phases,
    });
  } catch (error) {
    console.error('Error fetching schedule config:', error);
    return NextResponse.json({ error: 'Failed to fetch schedule config' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate } = body;

    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD.' }, { status: 400 });
    }

    await db.scheduleConfig.upsert({
      where: { key: 'start_date' },
      update: { value: startDate },
      create: { key: 'start_date', value: startDate },
    });

    const startDateObj = new Date(startDate + 'T00:00:00');
    const today = new Date();

    const phases = [1, 2, 3].map(shiftNumber => {
      const phase = getShiftPhase(shiftNumber, today, startDateObj);
      const labels: Record<string, { label: string; short: string }> = {
        day: { label: 'День (7:30–19:30)', short: 'Д' },
        night: { label: 'Ночь (19:30–7:30)', short: 'Н' },
        rest: { label: 'Отсыпной', short: 'О' },
        off: { label: 'Выходной', short: 'В' },
      };
      return {
        shiftNumber,
        phase,
        label: labels[phase].label,
        shortLabel: labels[phase].short,
      };
    });

    return NextResponse.json({
      startDate,
      today: formatDate(today),
      phases,
    });
  } catch (error) {
    console.error('Error updating schedule config:', error);
    return NextResponse.json({ error: 'Failed to update schedule config' }, { status: 500 });
  }
}