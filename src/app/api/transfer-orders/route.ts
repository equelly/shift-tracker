import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuditUser } from '@/lib/auth-guard';

// GET /api/transfer-orders — список распоряжений
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
              include: { grade: true, shift: true, professions: true },
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

// POST /api/transfer-orders — создать распоряжение
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderDate, orderType, shiftNumber, reason, notes, items } = body;

    // Генерируем номер распоряжения: Р-0001, Р-0002, ...
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

    // Получаем текущие данные работников для заполнения "откуда"
    const workerIds = (items as any[]).map((i: any) => i.workerId);
    const workersData = await db.worker.findMany({
      where: { id: { in: workerIds } },
      include: { professions: true },
    });
    const workerMap = new Map(workersData.map(w => [w.id, w]));

    // Создаём распоряжение со строками, автоматически заполняя "откуда"
    const order = await db.transferOrder.create({
      data: {
        orderNumber,
        orderDate,
        orderType,
        shiftNumber: shiftNumber ?? null,
        reason,
        notes,
        createdBy: userId,
        items: {
          create: (items as any[]).map(item => {
            const w = workerMap.get(item.workerId);
            // Текущая профессия (первая из списка)
            const currentProfession = w?.professions?.[0]?.professionName || null;
            return {
              workerId: item.workerId,
              // Откуда — автоматически из текущих данных работника
              fromEquipmentId: w?.equipmentId ?? null,
              fromShiftNumber: w?.shiftNumber ?? null,
              fromGradeNumber: w?.gradeNumber ?? null,
              fromPosition: w?.position ?? null,
              fromProfession: currentProfession,
              // Куда — из формы
              toEquipmentId: item.toEquipmentId ?? null,
              toShiftNumber: item.toShiftNumber ?? null,
              toGradeNumber: item.toGradeNumber ?? null,
              toPosition: item.toPosition ?? null,
              toProfession: item.toProfession ?? null,
              // Дата и срок
              effectiveDate: item.effectiveDate || orderDate,
              duration: item.duration || 'until_next_order',
            };
          }),
        },
      },
      include: {
        shift: true,
        creator: { select: { name: true } },
        items: {
          include: {
            worker: { include: { grade: true, shift: true, professions: true } },
            fromEquipment: true,
            toEquipment: true,
          },
        },
      },
    });

    // Аудит
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
  } catch (error) {
    console.error('Error creating transfer order:', error);
    return NextResponse.json({ error: 'Failed to create transfer order' }, { status: 500 });
  }
}