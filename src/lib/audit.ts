import { db } from './db';

interface AuditLogInput {
  userId: string;
  userName: string;
  action: 'create' | 'update' | 'delete';
  entityType: string;
  entityId?: string;
  description?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  attendanceId?: string;
}

export async function createAuditLog(input: AuditLogInput) {
  return db.auditLog.create({
    data: {
      userId: input.userId,
      userName: input.userName,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      description: input.description,
      oldValues: input.oldValues ? JSON.stringify(input.oldValues) : null,
      newValues: input.newValues ? JSON.stringify(input.newValues) : null,
      attendanceId: input.attendanceId,
    },
  });
}
