import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuditUser } from '@/lib/auth-guard';

// PATCH /api/transfer-orders/[id] — утвердить или отменить
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { action } = body;

    const order = await db.transferOrder.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            worker: true,
            fromEquipment: true,
            toEquipment: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Распоряжение не найдено' }, { status: 404 });
    }

    const { userId, userName } = await getAuditUser();

    if (action === 'approve') {
      // Утверждение — просто меняем статус (работники уже переведены)
      if (order.status !== 'draft') {
        return NextResponse.json({ error: 'Можно утвердить только черновик' }, { status: 400 });
      }

      const updated = await db.transferOrder.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          items: {
            updateMany: {
              where: { orderId: id },
              data: { executed: true },
            },
          },
        },
        include: {
          shift: true,
          creator: { select: { name: true } },
          approver: { select: { name: true } },
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
          action: 'update',
          entityType: 'transfer_order',
          entityId: id,
          description: `Распоряжение ${order.orderNumber} утверждено`,
        },
      });

      return NextResponse.json(updated);
    }

    if (action === 'cancel') {
      // Отмена — ВОЗВРАЩАЕМ работников на прежние места
      if (order.status !== 'draft' && order.status !== 'approved') {
        return NextResponse.json({ error: 'Можно отменить только черновик или утверждённое' }, { status: 400 });
      }

      // Откатываем каждого работника
      for (const item of order.items) {
        const rollbackData: any = {};
        if (item.fromEquipmentId !== null && item.fromEquipmentId !== undefined) {
          rollbackData.equipmentId = item.fromEquipmentId;
        }
        if (item.fromShiftNumber !== null && item.fromShiftNumber !== undefined) {
          rollbackData.shiftNumber = item.fromShiftNumber;
        }
        if (item.fromGradeNumber !== null && item.fromGradeNumber !== undefined) {
          rollbackData.gradeNumber = item.fromGradeNumber;
        }

        if (Object.keys(rollbackData).length > 0) {
          await db.worker.update({
            where: { id: item.workerId },
            data: rollbackData,
          });
        }
      }

      const updated = await db.transferOrder.update({
        where: { id },
        data: {
          status: 'cancelled',
          items: {
            updateMany: {
              where: { orderId: id },
              data: { executed: false },
            },
          },
        },
        include: {
          shift: true,
          creator: { select: { name: true } },
          approver: { select: { name: true } },
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
          action: 'update',
          entityType: 'transfer_order',
          entityId: id,
          description: `Распоряжение ${order.orderNumber} отменено, работники возвращены`,
        },
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  } catch (error: any) {
    console.error('Error updating transfer order:', error);
    return NextResponse.json(
      { error: 'Ошибка: ' + (error.message || String(error)) },
      { status: 500 }
    );
  }
}

// DELETE /api/transfer-orders/[id] — удалить черновик (с откатом работников)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const order = await db.transferOrder.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Распоряжение не найдено' }, { status: 404 });
    }

    if (order.status !== 'draft') {
      return NextResponse.json({ error: 'Можно удалить только черновик' }, { status: 400 });
    }

    const { userId, userName } = await getAuditUser();

    // Откатываем работников на прежние места
    for (const item of order.items) {
      const rollbackData: any = {};
      if (item.fromEquipmentId !== null && item.fromEquipmentId !== undefined) {
        rollbackData.equipmentId = item.fromEquipmentId;
      }
      if (item.fromShiftNumber !== null && item.fromShiftNumber !== undefined) {
        rollbackData.shiftNumber = item.fromShiftNumber;
      }
      if (item.fromGradeNumber !== null && item.fromGradeNumber !== undefined) {
        rollbackData.gradeNumber = item.fromGradeNumber;
      }

      if (Object.keys(rollbackData).length > 0) {
        await db.worker.update({
          where: { id: item.workerId },
          data: rollbackData,
        });
      }
    }

    // Удаляем распоряжение
    await db.transferOrderItem.deleteMany({ where: { orderId: id } });
    await db.transferOrder.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId,
        userName,
        action: 'delete',
        entityType: 'transfer_order',
        entityId: id,
        description: `Черновик распоряжения ${order.orderNumber} удалён, работники возвращены`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting transfer order:', error);
    return NextResponse.json(
      { error: 'Ошибка: ' + (error.message || String(error)) },
      { status: 500 }
    );
  }
}