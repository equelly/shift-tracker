import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { formatDate } from '@/lib/shift-utils';

/**
 * POST /api/transfer-orders/execute
 *
 * Применяет переводы (черновики и утверждённые), чья дата вступления наступила,
 * и откатывает переводы "на одну смену", чей срок истёк.
 *
 * Черновики тоже исполняются — при непрерывном производстве важнее
 * вовремя вывести человека на работу, утверждение может быть задним числом.
 *
 * Вызывается при загрузке табеля или страницы распоряжений.
 */
export async function POST() {
  try {
    const today = formatDate(new Date());
    let executedCount = 0;
    let revertedCount = 0;

    // 1. Найти все невыполненные строки распоряжений (draft + approved),
    //    чья effectiveDate <= сегодня (пропускаем пустые даты)
    const pendingItems = await db.transferOrderItem.findMany({
      where: {
        executed: false,
        effectiveDate: { not: '', lte: today },
        order: { status: { in: ['draft', 'approved'] } },
      },
      include: {
        worker: { include: { professions: true } },
        order: { select: { orderNumber: true } },
      },
    });

    for (const item of pendingItems) {
      try {
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

        // Отмечаем как выполненную
        await db.transferOrderItem.update({
          where: { id: item.id },
          data: { executed: true, executedAt: new Date() },
        });

        executedCount++;
      } catch (itemError) {
        console.error(`Error executing item ${item.id}:`, itemError);
        // Продолжаем обработку остальных строк
      }
    }

    // 2. Найти все выполненные строки "на одну смену" (draft + approved),
    //    у которых effectiveDate < сегодня (смена прошла) и ещё не откачены
    const oneShiftExpired = await db.transferOrderItem.findMany({
      where: {
        executed: true,
        revertedAt: null,
        duration: 'one_shift',
        effectiveDate: { not: '', lt: today },
        order: { status: { in: ['draft', 'approved'] } },
      },
      include: {
        worker: true,
        order: { select: { orderNumber: true } },
      },
    });

    for (const item of oneShiftExpired) {
      try {
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

        revertedCount++;
      } catch (itemError) {
        console.error(`Error reverting item ${item.id}:`, itemError);
        // Продолжаем обработку остальных строк
      }
    }

    return NextResponse.json({
      executed: executedCount,
      reverted: revertedCount,
      date: today,
    });
  } catch (error) {
    console.error('Error executing transfer orders:', error);
    return NextResponse.json({ error: 'Failed to execute transfer orders' }, { status: 500 });
  }
}
