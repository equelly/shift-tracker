import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuditUser } from '@/lib/auth-guard';
import { formatDate } from '@/lib/shift-utils';

// PATCH /api/transfer-orders/[id] — утвердить / отменить распоряжение
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body; // "approve" | "cancel"

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
    const today = formatDate(new Date());

    if (action === 'approve') {
      if (order.status !== 'draft') {
        return NextResponse.json({ error: 'Можно утвердить только черновик' }, { status: 400 });
      }

      // Черновики уже могли быть исполнены через /execute при наступлении effectiveDate.
      // При утверждении просто меняем статус — переводы уже применены.
      // Если есть неисполненные строки с наступившей датой — исполняем немедленно.
      const alreadyExecutedCount = order.items.filter(i => i.executed).length;
      const itemsToExecuteNow = order.items.filter(
        item => item.effectiveDate <= today && !item.executed && item.effectiveDate !== ''
      );

      for (const item of itemsToExecuteNow) {
        const updateData: any = {};
        if (item.toShiftNumber !== null && item.toShiftNumber !== undefined) {
          updateData.shiftNumber = item.toShiftNumber;
        }
        if (item.toEquipmentId !== null && item.toEquipmentId !== undefined) {
          updateData.equipmentId = item.toEquipmentId;
        }
        if (item.toGradeNumber !== null && item.toGradeNumber !== undefined) {
          updateData.gradeNumber = item.toGradeNumber;
        }
        if (item.toPosition !== null && item.toPosition !== undefined) {
          updateData.position = item.toPosition;
        }
        if (Object.keys(updateData).length > 0) {
          await db.worker.update({
            where: { id: item.workerId },
            data: updateData,
          });
        }

        // Обновляем профессию если указана
        if (item.toProfession) {
          await db.workerProfession.deleteMany({ where: { workerId: item.workerId } });
          await db.workerProfession.create({
            data: { workerId: item.workerId, professionName: item.toProfession },
          });
        }

        // Отмечаем строку как выполненную
        await db.transferOrderItem.update({
          where: { id: item.id },
          data: { executed: true, executedAt: new Date() },
        });
      }

      const totalExecuted = alreadyExecutedCount + itemsToExecuteNow.length;

      // Обновляем статус распоряжения
      const updated = await db.transferOrder.update({
        where: { id },
        data: {
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
        },
        include: {
          shift: true,
          creator: { select: { name: true } },
          approver: { select: { name: true } },
          items: {
            include: {
              worker: { include: { grade: true, shift: true, professions: true } },
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
          description: `Утверждено распоряжение ${order.orderNumber} (исполнено ${totalExecuted} из ${order.items.length} строк)`,
        },
      });

      return NextResponse.json(updated);
    }

    if (action === 'cancel') {
      if (order.status === 'approved' || order.status === 'draft') {
        // Откатываем ТОЛЬКО выполненные (executed) строки —
        // это актуально и для черновиков, т.к. они могли быть исполнены через /execute
        for (const item of order.items) {
          if (item.executed && !item.revertedAt) {
            const rollbackData: any = {};
            if (item.fromShiftNumber !== null && item.fromShiftNumber !== undefined) {
              rollbackData.shiftNumber = item.fromShiftNumber;
            }
            if (item.fromEquipmentId !== null && item.fromEquipmentId !== undefined) {
              rollbackData.equipmentId = item.fromEquipmentId;
            }
            if (item.fromGradeNumber !== null && item.fromGradeNumber !== undefined) {
              rollbackData.gradeNumber = item.fromGradeNumber;
            }
            if (item.fromPosition !== null && item.fromPosition !== undefined) {
              rollbackData.position = item.fromPosition;
            }
            if (Object.keys(rollbackData).length > 0) {
              await db.worker.update({
                where: { id: item.workerId },
                data: rollbackData,
              });
            }

            // Возвращаем профессию
            if (item.fromProfession) {
              await db.workerProfession.deleteMany({ where: { workerId: item.workerId } });
              await db.workerProfession.create({
                data: { workerId: item.workerId, professionName: item.fromProfession },
              });
            }

            // Отмечаем как откаченную
            await db.transferOrderItem.update({
              where: { id: item.id },
              data: { revertedAt: new Date() },
            });
          }
        }
      }

      const updated = await db.transferOrder.update({
        where: { id },
        data: { status: 'cancelled' },
        include: {
          shift: true,
          creator: { select: { name: true } },
          approver: { select: { name: true } },
          items: {
            include: {
              worker: { include: { grade: true, shift: true, professions: true } },
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
          description: `Отменено распоряжение ${order.orderNumber}`,
        },
      });

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Неизвестное действие' }, { status: 400 });
  } catch (error) {
    console.error('Error updating transfer order:', error);
    return NextResponse.json({ error: 'Failed to update transfer order' }, { status: 500 });
  }
}

// DELETE /api/transfer-orders/[id] — удалить черновик
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const order = await db.transferOrder.findUnique({ where: { id } });
    if (!order) {
      return NextResponse.json({ error: 'Не найдено' }, { status: 404 });
    }
    if (order.status !== 'draft') {
      return NextResponse.json({ error: 'Можно удалить только черновик' }, { status: 400 });
    }

    // Удаляем строки и само распоряжение (каскад)
    await db.transferOrder.delete({ where: { id } });

    const { userId, userName } = await getAuditUser();
    await db.auditLog.create({
      data: {
        userId,
        userName,
        action: 'delete',
        entityType: 'transfer_order',
        entityId: id,
        description: `Удалено распоряжение ${order.orderNumber}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting transfer order:', error);
    return NextResponse.json({ error: 'Failed to delete transfer order' }, { status: 500 });
  }
}
