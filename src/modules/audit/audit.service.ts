import { prisma } from '../../database/prisma.js';
import { logger } from '../../common/logging/logger.js';

export interface CreateAuditInput {
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  public static async recordEvent(input: CreateAuditInput, tx?: any): Promise<void> {
    const client = tx || prisma;
    try {
      await client.auditEvent.create({
        data: {
          entityType: input.entityType,
          entityId: input.entityId,
          action: input.action,
          actorId: input.actorId || null,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        },
      });
    } catch (err) {
      logger.error({ err, input }, 'Failed to write audit event');
    }
  }
}
