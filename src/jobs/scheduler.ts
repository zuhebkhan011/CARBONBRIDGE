import { AuctionStatus } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { logger } from '../common/logging/logger.js';
import { NotificationService } from '../modules/notifications/notification.service.js';

export class BackgroundJobScheduler {
  private static timer: NodeJS.Timeout | null = null;

  public static start(): void {
    logger.info('Starting CarbonBridge background job scheduler (interval: 30s)');

    // Run every 30 seconds
    this.timer = setInterval(async () => {
      await this.processExpiredAuctions();
    }, 30000);
  }

  public static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Stopped CarbonBridge background job scheduler');
    }
  }

  public static async processExpiredAuctions(): Promise<void> {
    try {
      const now = new Date();
      const expiredAuctions = await prisma.auction.findMany({
        where: {
          status: AuctionStatus.OPEN,
          closingTime: { lte: now },
        },
        include: {
          seller: true,
          _count: { select: { bids: true } },
        },
      });

      for (const auction of expiredAuctions) {
        // Transition to FINALIZING
        await prisma.auction.update({
          where: { id: auction.id },
          data: { status: AuctionStatus.FINALIZING },
        });

        logger.info({ auctionId: auction.id }, 'Auction duration ended; moved to FINALIZING');

        NotificationService.notifyCompanyUsers(
          auction.sellerId,
          'Auction Closing Time Reached',
          `Auction for Batch ${auction.batchId} has concluded with ${auction._count.bids} bid(s). Please finalize to allocate inventory.`,
          'AUCTION_CLOSED'
        );
      }
    } catch (err) {
      logger.error({ err }, 'Error in processExpiredAuctions background worker');
    }
  }
}
