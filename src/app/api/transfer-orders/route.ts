import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuditUser } from '@/lib/auth-guard';

// GET /api/transfer-orders — список распоряжений
// ?count=draft — только количество черновиков (для бейджа)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const shiftNumber = searchParams.get('shiftNumber');
    const countOnly = searchParams.get('count');

    // Специальный режим: вернуть только число черновиков
    if (countOnly === 'draft') {
      const draftCount = await db.transferOrder.count({
        where: { status: 'draft' },
      });
      return NextResponse.json(draftCount);
    }

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

// POST /api/transfer-orders — создать распоряжение (с немедленным переводом работников)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderDate, orderType, shiftNumber, reason, notes, items } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Добавьте хотя бы одного работника' }, { status: 400 });
    }

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

    // Для каждого работника: сохраняем текущие данные (откуда) и НЕМЕДЛЕННО переводим
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

      // НЕМЕДЛЕННЫЙ ПЕРЕВОД работника
      const updateData: any = {};
      if (item.toEquipmentId !== null && item.toEquipmentId !== undefined) {
        updateData.equipmentId = item.toEquipmentId;
      }
      if (item.toShiftNumber !== null && item.toShiftNumber !== undefined) {
        updateData.shiftNumber = item.toShiftNumber;
      }
      if (item.toGradeNumber !== null && item.toGradeNumber !== undefined) {
        updateData.gradeNumber = item.toGradeNumber;
      }

      if (Object.keys(updateData).length > 0) {
        await db.worker.update({
          where: { id: item.workerId },
          data: updateData,
        });
      }
    }

    // Создаём распоряжение со строками (статус = draft)
    const order = await db.transferOrder.create({
      data: {
        orderNumber,
        orderDate,
        orderType,
        shiftNumber: shiftNumber ?? null,
        reason: reason || null,
        notes: notes || null,
        status: 'draft',
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

    // Аудит
    await db.auditLog.create({
      data: {
        userId,
        userName,
        action: 'create',
        entityType: 'transfer_order',
        entityId: order.id,
        description: `Создано распоряжение ${orderNumber} от ${orderDate} (${order.items.length} строк) — работники переведены немедленно`,
        newValues: JSON.stringify(body),
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error: any) {
    console.error('Error creating transfer order:', error);
    return NextResponse.json(
      { error: 'Ошибка создания распоряжения: ' + (error.message || String(error)) },
      { status: 500 }
    );
  }
}
