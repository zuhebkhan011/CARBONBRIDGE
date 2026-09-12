import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.js';
// @ts-ignore
import * as formatters from '../../frontend/src/utils/formatters.js';
const {
  parseSafeNumber,
  formatQuantity,
  formatMoney,
  formatPercentage,
  formatStatus,
  formatBatchPurity,
} = formatters as any;

describe('Notifications Read State & Decimal Formatting Suite', () => {
  let buyerToken: string;
  let buyerUserId: string;
  let notifId1: string;
  let notifId2: string;

  beforeAll(async () => {
    // 1. Authenticate buyer
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'buyer.synfuels@ahmedabad.com',
      password: 'CarbonBridge2026!',
    });
    expect(loginRes.status).toBe(200);
    buyerToken = loginRes.body.data.tokens.accessToken;
    buyerUserId = loginRes.body.data.user.id;

    // 2. Clean previous test notifications for this user if needed, and create 2 fresh unread notifications
    await prisma.notification.deleteMany({ where: { userId: buyerUserId } });

    const n1 = await prisma.notification.create({
      data: {
        userId: buyerUserId,
        title: 'New Bid Received',
        message: 'A new bid was placed on your lot.',
        type: 'AUCTION_BID',
        isRead: false,
      },
    });
    const n2 = await prisma.notification.create({
      data: {
        userId: buyerUserId,
        title: 'Order Confirmed',
        message: 'Your order was successfully confirmed.',
        type: 'ORDER_CONFIRMED',
        isRead: false,
      },
    });

    notifId1 = n1.id;
    notifId2 = n2.id;
  });

  it('1. GET /api/v1/notifications/unread-count should return accurate unread count from database', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.unreadCount).toBe(2);
  });

  it('2. PATCH /api/v1/notifications/:id/read persists isRead in DB and decreases unreadCount', async () => {
    // Mark first notification as read
    const patchRes = await request(app)
      .patch(`/api/v1/notifications/${notifId1}/read`)
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);

    // Verify persisted in DB directly
    const dbNotif = await prisma.notification.findUnique({ where: { id: notifId1 } });
    expect(dbNotif?.isRead).toBe(true);

    // Verify unread count is now 1
    const countRes = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(countRes.body.data.unreadCount).toBe(1);
  });

  it('3. Refresh simulation: GET /api/v1/notifications maintains read state after page refresh / re-login', async () => {
    // Re-login to simulate new session / page refresh
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'buyer.synfuels@ahmedabad.com',
      password: 'CarbonBridge2026!',
    });
    const freshToken = loginRes.body.data.tokens.accessToken;

    const listRes = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${freshToken}`);

    expect(listRes.status).toBe(200);
    const notifs = listRes.body.data;
    const n1 = notifs.find((n: any) => n.id === notifId1);
    const n2 = notifs.find((n: any) => n.id === notifId2);

    expect(n1.isRead).toBe(true);
    expect(n2.isRead).toBe(false);
  });

  it('4. PATCH /api/v1/notifications/read-all marks all unread notifications read and clears red dot', async () => {
    const patchAllRes = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(patchAllRes.status).toBe(200);
    expect(patchAllRes.body.success).toBe(true);

    const countRes = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(countRes.body.data.unreadCount).toBe(0);

    const listRes = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(listRes.body.data.every((n: any) => n.isRead === true)).toBe(true);
  });

  describe('Decimal, Money, and Quantity Formatter Safety', () => {
    it('formatQuantity handles numbers, strings, and decimals without returning NaN', () => {
      expect(formatQuantity(100)).toBe('100 T');
      expect(formatQuantity('100')).toBe('100 T');
      expect(formatQuantity('1250.5')).toBe('1,250.5 T');
      expect(formatQuantity(null)).toBe('—');
      expect(formatQuantity(undefined)).toBe('—');
      expect(formatQuantity('invalid')).toBe('—');
      expect(formatQuantity(NaN)).toBe('—');
      expect(formatQuantity({ toNumber: () => 350 })).toBe('350 T');
    });

    it('formatMoney handles numbers, strings, and decimals without returning ₹NaN', () => {
      expect(formatMoney(6500)).toMatch(/₹6[,.]500/);
      expect(formatMoney('6500')).toMatch(/₹6[,.]500/);
      expect(formatMoney('250000.75')).toContain('2,50,000.75');
      expect(formatMoney(null)).toBe('—');
      expect(formatMoney(undefined)).toBe('—');
      expect(formatMoney(NaN)).toBe('—');
      expect(formatMoney('NaN')).toBe('—');
      expect(formatMoney({ toNumber: () => 12000 })).toBe('₹12,000');
    });

    it('formatPercentage handles numbers, strings, and decimals without returning NaN%', () => {
      expect(formatPercentage(78)).toBe('78%');
      expect(formatPercentage(78.5)).toBe('78.5%');
      expect(formatPercentage('99.9')).toBe('99.9%');
      expect(formatPercentage(null)).toBe('—');
      expect(formatPercentage(undefined)).toBe('—');
      expect(formatPercentage(NaN)).toBe('—');
    });

    it('formatBatchPurity extracts purity safely from various object shapes', () => {
      expect(formatBatchPurity({ purityPercentage: 85 })).toBe('85%');
      expect(formatBatchPurity({ batch: { purityPercentage: 92.4 } })).toBe('92.4%');
      expect(formatBatchPurity({ purity: '75' })).toBe('75%');
      expect(formatBatchPurity(null)).toBe('—');
      expect(formatBatchPurity({})).toBe('—');
    });

    it('formatStatus safely replaces underscores and handles null/undefined', () => {
      expect(formatStatus('MULTI_SUPPLIER_COMPOSITE')).toBe('MULTI SUPPLIER COMPOSITE');
      expect(formatStatus('DISPATCH_PENDING')).toBe('DISPATCH PENDING');
      expect(formatStatus(null)).toBe('—');
      expect(formatStatus(undefined)).toBe('—');
      expect(formatStatus('')).toBe('—');
    });
  });
});
