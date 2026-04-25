import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuditUser } from '@/lib/auth-guard';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const worker = await db.worker.findUnique({
      where: { id },
      include: {
        grade: true,
        shift: true,
        equipment: true,
        professions: true,
        benefits: true,
        attendanceRecords: { orderBy: { date: 'desc' }, take: 30 },
        substitutionsAsWorker: true,
        substitutionsAsSubstitute: true,
        transfers: { orderBy: { date: 'desc' }, take: 10 },
      },
    });

    if (!worker) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 });
    }

    return NextResponse.json(worker);
  } catch (error) {
    console.error('Error fetching worker:', error);
    return NextResponse.json({ error: 'Failed to fetch worker' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const oldWorker = await db.worker.findUnique({ where: { id } });

    const worker = await db.worker.update({
      where: { id },
      data: {
        lastName: body.lastName,
        firstName: body.firstName,
        patronymic: body.patronymic,
        gradeNumber: body.gradeNumber,
        shiftNumber: body.shiftNumber || null,
        equipmentId: body.equipmentId || null,
        position: body.position || 'worker',
        isActive: body.isActive ?? true,
      },
      include: { grade: true, shift: true, equipment: true, professions: true, benefits: true },
    });

    // Update professions
    if (body.professionNames !== undefined) {
      await db.workerProfession.deleteMany({ where: { workerId: id } });
      if (body.professionNames?.length) {
        await db.workerProfession.createMany({
          data: body.professionNames.map((name: string) => ({ workerId: id, professionName: name })),
        });
      }
    }

    // Update benefits
    if (body.benefitTypes !== undefined) {
      await db.workerBenefit.deleteMany({ where: { workerId: id } });
      if (body.benefitTypes?.length) {
        await db.workerBenefit.createMany({
          data: body.benefitTypes.map((bt: any) => ({
            workerId: id,
            benefitType: bt.type,
            description: bt.description || null,
          })),
        });
      }
    }

    // Audit log
    const { userId, userName } = await getAuditUser();
    await db.auditLog.create({
      data: {
        userId,
        userName,
        action: 'update',
        entityType: 'worker',
        entityId: id,
        description: `Изменён работник: ${body.lastName} ${body.firstName}`,
        oldValues: oldWorker ? JSON.stringify(oldWorker) : null,
        newValues: JSON.stringify(body),
      },
    });

    return NextResponse.json(worker);
  } catch (error) {
    console.error('Error updating worker:', error);
    return NextResponse.json({ error: 'Failed to update worker' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const oldWorker = await db.worker.findUnique({ where: { id } });

    // Soft delete
    const worker = await db.worker.update({
      where: { id },
      data: { isActive: false },
    });

    const { userId, userName } = await getAuditUser();
    await db.auditLog.create({
      data: {
        userId,
        userName,
        action: 'delete',
        entityType: 'worker',
        entityId: id,
        description: `Уволен работник: ${oldWorker?.lastName} ${oldWorker?.firstName}`,
        oldValues: oldWorker ? JSON.stringify(oldWorker) : null,
      },
    });

    return NextResponse.json(worker);
  } catch (error) {
    console.error('Error deleting worker:', error);
    return NextResponse.json({ error: 'Failed to delete worker' }, { status: 500 });
  }
}
