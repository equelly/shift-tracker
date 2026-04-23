import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const shifts = await db.shift.findMany({
      include: {
        master: { select: { id: true, name: true, email: true } },
        workers: { where: { isActive: true }, select: { id: true } },
      },
      orderBy: { number: 'asc' },
    });

    const result = shifts.map(s => ({
      ...s,
      workerCount: s.workers.length,
      workers: undefined,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching shifts:', error);
    return NextResponse.json({ error: 'Failed to fetch shifts' }, { status: 500 });
  }
}
