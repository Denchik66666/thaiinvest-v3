import { prisma } from "./prisma";

/**
 * Записывает действие в лог аудита
 */
export async function logAction({
  userId,
  action,
  entityType,
  entityId,
  oldValue,
  newValue,
  ipAddress,
}: {
  userId: number;
  action: string;
  entityType: string;
  entityId: number;
  oldValue?: string;
  newValue?: string;
  ipAddress?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        oldValue: oldValue ? String(oldValue) : null,
        newValue: newValue ? String(newValue) : null,
        ipAddress,
      },
    });
  } catch (error) {
    console.error("Failed to log action:", error);
  }
}
