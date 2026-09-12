import { prisma } from '../../database/prisma.js';
import { logger } from '../../common/logging/logger.js';

export interface SendNotificationInput {
  userId: string;
  title: string;
  message: string;
  type: string;
}

export class NotificationService {
  public static async notify(input: SendNotificationInput): Promise<void> {
    // Process asynchronously so core transactions are never blocked
    setImmediate(async () => {
      try {
        await prisma.notification.create({
          data: {
            userId: input.userId,
            title: input.title,
            message: input.message,
            type: input.type,
          },
        });
      } catch (err) {
        logger.warn({ err, userId: input.userId }, 'Asynchronous notification delivery failed');
      }
    });
  }

  public static async notifyCompanyUsers(
    companyId: string,
    title: string,
    message: string,
    type: string
  ): Promise<void> {
    setImmediate(async () => {
      try {
        const users = await prisma.user.findMany({
          where: { companyId },
          select: { id: true },
        });

        if (users.length > 0) {
          await prisma.notification.createMany({
            data: users.map((u) => ({
              userId: u.id,
              title,
              message,
              type,
            })),
          });
        }
      } catch (err) {
        logger.warn({ err, companyId }, 'Failed to notify company users');
      }
    });
  }

  public static async getUserNotifications(userId: string) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  public static async markAsRead(notificationId: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  }

  public static async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  public static async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, isRead: false },
    });
  }
}
