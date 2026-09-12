import { Prisma, RequirementStatus } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../../common/errors/AppError.js';
import { CreateRequirementInput } from './requirements.dto.js';
import { AuditService } from '../audit/audit.service.js';

export class RequirementsService {
  public static async createRequirement(
    buyerCompanyId: string,
    actorUserId: string,
    input: CreateRequirementInput
  ) {
    if (input.requiredDeliveryDate) {
      const deliveryDate = new Date(input.requiredDeliveryDate);
      if (deliveryDate <= new Date()) {
        throw new BadRequestError('Required delivery date must be in the future.');
      }
    }

    const requirement = await prisma.requirement.create({
      data: {
        buyerId: buyerCompanyId,
        targetQuantity: new Prisma.Decimal(input.targetQuantity.toFixed(4)),
        minPurity: new Prisma.Decimal(input.minPurity.toFixed(2)),
        deliveryLat: new Prisma.Decimal(input.deliveryLat.toFixed(7)),
        deliveryLng: new Prisma.Decimal(input.deliveryLng.toFixed(7)),
        deliveryAddress: input.deliveryAddress,
        requiredDeliveryDate: input.requiredDeliveryDate
          ? new Date(input.requiredDeliveryDate)
          : null,
        budgetCeilingPerTon: input.budgetCeilingPerTon
          ? new Prisma.Decimal(input.budgetCeilingPerTon.toFixed(2))
          : null,
        intendedApplication: input.intendedApplication || null,
        status: RequirementStatus.OPEN,
      },
    });

    await AuditService.recordEvent({
      entityType: 'REQUIREMENT',
      entityId: requirement.id,
      action: 'REQUIREMENT_CREATED',
      actorId: actorUserId,
      metadata: {
        targetQuantity: input.targetQuantity,
        minPurity: input.minPurity,
        deliveryAddress: input.deliveryAddress,
      },
    });

    return requirement;
  }

  public static async getBuyerRequirements(buyerCompanyId: string) {
    return prisma.requirement.findMany({
      where: { buyerId: buyerCompanyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  public static async getRequirementById(id: string, buyerCompanyId: string, role: string) {
    const requirement = await prisma.requirement.findUnique({
      where: { id },
      include: {
        buyer: {
          select: { id: true, name: true, address: true, latitude: true, longitude: true },
        },
      },
    });

    if (!requirement) {
      throw new NotFoundError(`Requirement '${id}' not found.`);
    }

    // Object-level authorization
    if (role === 'BUYER' && requirement.buyerId !== buyerCompanyId) {
      throw new ForbiddenError('You can only view requirements created by your own company.');
    }

    return requirement;
  }

  public static async cancelRequirement(
    id: string,
    buyerCompanyId: string,
    actorUserId: string
  ) {
    const requirement = await prisma.requirement.findUnique({
      where: { id },
    });

    if (!requirement) {
      throw new NotFoundError(`Requirement '${id}' not found.`);
    }

    if (requirement.buyerId !== buyerCompanyId) {
      throw new ForbiddenError('You can only cancel requirements created by your own company.');
    }

    if (requirement.status === RequirementStatus.FULFILLED) {
      throw new BadRequestError('Cannot cancel a fulfilled requirement.');
    }

    const updated = await prisma.requirement.update({
      where: { id },
      data: { status: RequirementStatus.CANCELLED },
    });

    await AuditService.recordEvent({
      entityType: 'REQUIREMENT',
      entityId: id,
      action: 'REQUIREMENT_CANCELLED',
      actorId: actorUserId,
    });

    return updated;
  }
}
