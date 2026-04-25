import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/transfer-orders/count — количество распоряжений по статусам
export async function GET() {
  try {
    const pendingCount = await db.transferOrder.count({
      where: { status: 'draft' },
    });

    return NextResponse.json({ pendingCount });
  } catch (error) {
    console.error('Error counting transfer orders:', error);
    return NextResponse.json({ pendingCount: 0 }, { status: 500 });
  }
}
