import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.js';

describe('ML Price Prediction Integration Suite', () => {
  let sellerToken: string;
  let buyerToken: string;
  let listingId: string;

  beforeAll(async () => {
    // 1. Authenticate seller
    const sellerLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'seller.a@ultratech.com',
      password: 'CarbonBridge2026!',
    });
    expect(sellerLogin.status).toBe(200);
    sellerToken = sellerLogin.body.data.tokens.accessToken;

    // 2. Authenticate buyer
    const buyerLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'buyer.synfuels@ahmedabad.com',
      password: 'CarbonBridge2026!',
    });
    expect(buyerLogin.status).toBe(200);
    buyerToken = buyerLogin.body.data.tokens.accessToken;

    // 3. Find an active listing
    const listing = await prisma.listing.findFirst({
      where: { status: 'ACTIVE' },
    });
    expect(listing).toBeDefined();
    listingId = listing!.id;
  });

  it('1. Rejects unauthenticated request to /api/v1/ai/pricing/ml/:listingId with 401', async () => {
    const res = await request(app).get(`/api/v1/ai/pricing/ml/${listingId}`);
    expect(res.status).toBe(401);
  });

  it('2. Returns 404 for non-existent listing ID', async () => {
    const res = await request(app)
      .get('/api/v1/ai/pricing/ml/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${sellerToken}`);
    expect(res.status).toBe(404);
  });

  it('3. Successfully predicts price for listing via GET /api/v1/ai/pricing/ml/:listingId', async () => {
    const res = await request(app)
      .get(`/api/v1/ai/pricing/ml/${listingId}`)
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.methodology).toBe('ML_PREDICTION');
    expect(data.modelAvailable).toBe(true);
    expect(data.predictedPricePerTonne).toBeGreaterThan(1500);
    expect(data.predictedPricePerTonne).toBeLessThan(5000);
    expect(data.confidence).toBeNull(); // Not arbitrarily invented
    expect(data.ruleBasedComparison).toBeDefined();
    expect(data.ruleBasedComparison.medianPrice).toBeGreaterThan(0);
    expect(data.featuresUsed).toBeDefined();
    expect(data.featuresUsed.purity).toBeGreaterThanOrEqual(50);
  });

  it('4. Successfully predicts price via alias GET /api/v1/pricing/ml/:listingId', async () => {
    const res = await request(app)
      .get(`/api/v1/pricing/ml/${listingId}?intendedUse=SYNFUEL&distanceKm=80`)
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.predictedPricePerTonne).toBeDefined();
    expect(res.body.data.featuresUsed.intendedUse).toBe('SYNFUEL');
    expect(res.body.data.featuresUsed.distanceKm).toBe(80);
  });

  it('5. Successfully queries real-time ML estimate via GET /api/v1/pricing/ml-estimate', async () => {
    const res = await request(app)
      .get('/api/v1/pricing/ml-estimate?purityPercentage=95&quantityTonnes=250&distanceKm=60&intendedUse=FOOD_BEVERAGE')
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.modelAvailable).toBe(true);
    expect(data.predictedPricePerTonne).toBeGreaterThan(1500);
    expect(data.mae).toBeDefined();
    expect(data.r2).toBeDefined();
  });

  it('6. Gracefully falls back to rule-based pricing when ML service is offline or unreachable', async () => {
    // Temporarily point config to invalid URL
    const { config } = await import('../../src/config/env.js');
    const originalUrl = config.ML_SERVICE_URL;
    (config as any).ML_SERVICE_URL = 'http://127.0.0.1:59999'; // Non-existent port

    try {
      const res = await request(app)
        .get(`/api/v1/pricing/ml/${listingId}`)
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.methodology).toBe('RULE_BASED_FALLBACK');
      expect(data.modelAvailable).toBe(false);
      expect(data.predictedPricePerTonne).toBeGreaterThan(0);
      expect(data.ruleBasedComparison).toBeDefined();
      expect(data.ruleBasedComparison.medianPrice).toBe(data.predictedPricePerTonne);
      expect(data.reason).toContain('unreachable');
    } finally {
      (config as any).ML_SERVICE_URL = originalUrl;
    }
  });

  it('7. Security: ML payload contains no user IDs, passwords, or PII', async () => {
    const res = await request(app)
      .get(`/api/v1/pricing/ml/${listingId}`)
      .set('Authorization', `Bearer ${sellerToken}`);

    const features = res.body.data.featuresUsed;
    expect(features.userId).toBeUndefined();
    expect(features.password).toBeUndefined();
    expect(features.passwordHash).toBeUndefined();
    expect(features.email).toBeUndefined();
    expect(features.companyId).toBeUndefined();
    expect(features.sellerId).toBeUndefined();
  });
});
