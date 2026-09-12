import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.js';

describe('Buyer Requirement Delivery Date Validation Suite', () => {
  let buyerToken: string;

  beforeAll(async () => {
    const buyerLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'buyer.synfuels@ahmedabad.com',
      password: 'CarbonBridge2026!',
    });
    expect(buyerLogin.status).toBe(200);
    buyerToken = buyerLogin.body.data.tokens.accessToken;
  });

  const baseRequirement = {
    targetQuantity: 100,
    minPurity: 90,
    deliveryLat: 23.0225,
    deliveryLng: 72.5714,
    deliveryAddress: 'Ahmedabad, Gujarat',
    budgetCeilingPerTon: 2500,
    intendedApplication: 'SYNFUEL',
  };

  it('1. Rejects a delivery date in the past (yesterday) with 400 and clear error message', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString();

    const res = await request(app)
      .post('/api/v1/requirements')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        ...baseRequirement,
        requiredDeliveryDate: yesterdayStr,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).toContain('Delivery date cannot be in the past.');
  });

  it('2. Rejects a delivery date from 10 days ago with 400', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    const pastDateStr = pastDate.toISOString();

    const res = await request(app)
      .post('/api/v1/requirements')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        ...baseRequirement,
        requiredDeliveryDate: pastDateStr,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).toContain('Delivery date cannot be in the past.');
  });

  it('3. Accepts today as delivery date (calendar date >= today)', async () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayDateOnly = `${year}-${month}-${day}`;
    const todayIso = new Date(`${todayDateOnly}T00:00:00.000Z`).toISOString();

    const res = await request(app)
      .post('/api/v1/requirements')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        ...baseRequirement,
        requiredDeliveryDate: todayIso,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.requiredDeliveryDate).toBeDefined();
    expect(new Date(res.body.data.requiredDeliveryDate).toISOString().slice(0, 10)).toBe(todayDateOnly);
  });

  it('4. Accepts tomorrow as delivery date', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const tomorrowIso = new Date(`${year}-${month}-${day}T00:00:00.000Z`).toISOString();

    const res = await request(app)
      .post('/api/v1/requirements')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        ...baseRequirement,
        requiredDeliveryDate: tomorrowIso,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('5. Accepts a future date next month', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    const res = await request(app)
      .post('/api/v1/requirements')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        ...baseRequirement,
        requiredDeliveryDate: futureDate.toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('6. Accepts requirement when delivery date is omitted (optional field)', async () => {
    const res = await request(app)
      .post('/api/v1/requirements')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        ...baseRequirement,
        // no requiredDeliveryDate
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.requiredDeliveryDate).toBeNull();
  });

  it('7. Preserves existing historical requirements in the database intact', async () => {
    const existingReqs = await prisma.requirement.findMany({
      take: 5,
    });
    expect(existingReqs.length).toBeGreaterThan(0);
    existingReqs.forEach((r) => {
      expect(r.id).toBeDefined();
      expect(r.status).toBeDefined();
    });
  });
});
