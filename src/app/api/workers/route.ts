import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuditUser } from '@/lib/auth-guard';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shiftNumber = searchParams.get('shiftNumber');
    const gradeNumber = searchParams.get('gradeNumber');
    const isActive = searchParams.get('isActive');
    const search = searchParams.get('search');

    const where: any = {};
    if (shiftNumber) where.shiftNumber = parseInt(shiftNumber);
    if (gradeNumber) where.gradeNumber = parseInt(gradeNumber);
    if (isActive !== null && isActive !== undefined && isActive !== '') {
      where.isActive = isActive === 'true';
    }
    if (search) {
      where.OR = [
        { lastName: { contains: search } },
        { firstName: { contains: search } },
        { patronymic: { contains: search } },
      ];
    }

    const workers = await db.worker.findMany({
      where,
      include: {
        grade: true,
        shift: true,
        equipment: true,
        professions: true,
        benefits: true,
      },
      orderBy: [{ shiftNumber: 'asc' }, { lastName: 'asc' }],
    });

    return NextResponse.json(workers);
  } catch (error) {
    console.error('Error fetching workers:', error);
    return NextResponse.json({ error: 'Failed to fetch workers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lastName, firstName, patronymic, gradeNumber, shiftNumber, equipmentId, professionNames, benefitTypes, position } = body;

    const worker = await db.worker.create({
      data: {
        lastName,
        firstName,
        patronymic,
        gradeNumber,
        shiftNumber: shiftNumber || null,
        equipmentId: equipmentId || null,
        position: position || 'worker',
        isActive: true,
        professions: professionNames?.length
          ? { create: professionNames.map((name: string) => ({ professionName: name })) }
          : undefined,
        benefits: benefitTypes?.length
          ? { create: benefitTypes.map((bt: any) => ({ benefitType: bt.type, description: bt.description })) }
          : undefined,
      },
      include: { grade: true, shift: true, equipment: true, professions: true, benefits: true },
    });

    // Audit log
    const { userId, userName } = await getAuditUser();
    await db.auditLog.create({
      data: {
        userId,
        userName,
        action: 'create',
        entityType: 'worker',
        entityId: worker.id,
        description: `Создан работник: ${lastName} ${firstName} ${patronymic}`,
        newValues: JSON.stringify(body),
      },
    });

    return NextResponse.json(worker, { status: 201 });
  } catch (error) {
    console.error('Error creating worker:', error);
    return NextResponse.json({ error: 'Failed to create worker' }, { status: 500 });
  }
}
