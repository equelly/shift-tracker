import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuditUser } from '@/lib/auth-guard';

// GET /api/transfer-orders
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const shiftNumber = searchParams.get('shiftNumber');

    const where: any = {};
    if (status) where.status = status;
    if (shiftNumber) where.shiftNumber = parseInt(shiftNumber);

    const orders = await db.transferOrder.findMany({
      where,
      include: {
        shift: true,
        creator: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } },
        items: {
          include: {
            worker: {
              include: { grade: true, shift: true },
            },
            fromEquipment: true,
            toEquipment: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { orderDate: 'desc' },
    });

    return NextResponse.json(orders);
  } catch (error) {
    console.error('Error fetching transfer orders:', error);
    return NextResponse.json({ error: 'Failed to fetch transfer orders' }, { status: 500 });
  }
}

// POST /api/transfer-orders
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderDate, orderType, shiftNumber, reason, notes, items } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Добавьте хотя бы одного работника' }, { status: 400 });
    }

    const lastOrder = await db.transferOrder.findFirst({
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });

    let nextNum = 1;
    if (lastOrder?.orderNumber) {
      const match = lastOrder.orderNumber.match(/Р-(\d+)/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }
    const orderNumber = `Р-${String(nextNum).padStart(4, '0')}`;

    const { userId, userName } = await getAuditUser();

    // Получаем текущие данные каждого работника
    const enrichedItems = [];
    for (const item of items) {
      const worker = await db.worker.findUnique({
        where: { id: item.workerId },
        select: { equipmentId: true, shiftNumber: true, gradeNumber: true },
      });

      if (!worker) {
        return NextResponse.json(
          { error: `Работник с ID ${item.workerId} не найден` },
          { status: 400 }
        );
      }

      enrichedItems.push({
        workerId: item.workerId,
        fromEquipmentId: worker.equipmentId,
        toEquipmentId: item.toEquipmentId ?? null,
        fromShiftNumber: worker.shiftNumber,
        toShiftNumber: item.toShiftNumber ?? null,
        fromGradeNumber: worker.gradeNumber,
        toGradeNumber: item.toGradeNumber ?? null,
      });
    }

    const order = await db.transferOrder.create({
      data: {
        orderNumber,
        orderDate,
        orderType,
        shiftNumber: shiftNumber ?? null,
        reason: reason || null,
        notes: notes || null,
        createdBy: userId,
        items: {
          create: enrichedItems,
        },
      },
      include: {
        shift: true,
        creator: { select: { name: true } },
        items: {
          include: {
            worker: { include: { grade: true, shift: true } },
            fromEquipment: true,
            toEquipment: true,
          },
        },
      },
    });

    await db.auditLog.create({
      data: {
        userId,
        userName,
        action: 'create',
        entityType: 'transfer_order',
        entityId: order.id,
        description: `Создано распоряжение ${orderNumber} от ${orderDate} (${order.items.length} строк)`,
        newValues: JSON.stringify(body),
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error: any) {
    console.error('Error creating transfer order:', error);
    return NextResponse.json(
      { error: 'Ошибка создания: ' + (error.message || String(error)) },
      { status: 500 }
    );
  }
}