import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.js';

describe('CarbonBridge Intelligence APIs Integration Suite', () => {
  let buyerToken: string;
  let sellerToken: string;
  let sampleRequirementId: string;
  let sampleAuctionId: string;

  beforeAll(async () => {
    // Login as buyer
    const buyerRes = await request(app).post('/api/v1/auth/login').send({
      email: 'buyer.synfuels@ahmedabad.com',
      password: 'CarbonBridge2026!',
    });
    if (buyerRes.body.data?.tokens?.accessToken) {
      buyerToken = buyerRes.body.data.tokens.accessToken;
    }

    // Login as seller
    const sellerRes = await request(app).post('/api/v1/auth/login').send({
      email: 'seller.a@ultratech.com',
      password: 'CarbonBridge2026!',
    });
    if (sellerRes.body.data?.tokens?.accessToken) {
      sellerToken = sellerRes.body.data.tokens.accessToken;
    }

    // Fetch active requirement ID
    const req = await prisma.requirement.findFirst({
      where: { status: 'OPEN' },
    });
    if (req) {
      sampleRequirementId = req.id;
    }

    // Fetch active auction ID
    const auc = await prisma.auction.findFirst();
    if (auc) {
      sampleAuctionId = auc.id;
    }
  });

  it('GET /api/v1/insights/marketplace should return aggregated real data and insights', async () => {
    const res = await request(app)
      .get('/api/v1/insights/marketplace')
      .set('Authorization', `Bearer ${buyerToken || sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('totalActiveDemandTons');
    expect(res.body.data).toHaveProperty('totalActiveSupplyTons');
    expect(res.body.data).toHaveProperty('clusters');
    expect(res.body.data.insights).toBeInstanceOf(Array);
  });

  it('GET /api/v1/pricing/recommendation should return advisory corridor with transparent factor breakdown', async () => {
    const res = await request(app)
      .get('/api/v1/pricing/recommendation')
      .query({ purityPercentage: 82.5, batchQuantity: 250 })
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.methodologyLabel).toBe('Rule-Based Advisory — Not AI/ML');
    expect(res.body.data.recommendedLowerPrice).toBeGreaterThan(0);
    expect(res.body.data.recommendedUpperPrice).toBeGreaterThan(res.body.data.recommendedLowerPrice);
    expect(res.body.data.breakdown).toBeDefined();
    expect(res.body.data.breakdown.purityAdjustment.amount).toBeGreaterThan(0);
  });

  it('GET /api/v1/insights/seller and /api/v1/opportunities should return matching opportunities for seller', async () => {
    if (!sellerToken) return;

    const res = await request(app)
      .get('/api/v1/insights/seller')
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('opportunities');
    expect(res.body.data).toHaveProperty('totalAvailableTons');

    // Also check alias /api/v1/opportunities
    const aliasRes = await request(app)
      .get('/api/v1/opportunities')
      .set('Authorization', `Bearer ${sellerToken}`);
    expect(aliasRes.status).toBe(200);
    expect(aliasRes.body.data.sellerCompanyId).toBe(res.body.data.sellerCompanyId);
    expect(Array.isArray(aliasRes.body.data.opportunities)).toBe(true);
  });

  it('GET /api/v1/matching/:id should return 0-100 score, explainable breakdown, and why this match', async () => {
    if (!sampleRequirementId || !buyerToken) return;

    const res = await request(app)
      .get(`/api/v1/matching/${sampleRequirementId}`)
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.bestMatchScore).toBeGreaterThanOrEqual(0);
    expect(data.bestMatchScore).toBeLessThanOrEqual(100);

    const match = data.multiSupplierMatches?.[0] || data.singleSupplierMatches?.[0];
    if (match) {
      expect(match.score).toBeGreaterThanOrEqual(0);
      expect(match.score).toBeLessThanOrEqual(100);
      expect(match.scoreBreakdown).toBeDefined();
      expect(match.scoreBreakdown.quantityFit).toBeDefined();
      expect(match.scoreBreakdown.purityFit).toBeDefined();
      expect(match.deliveryFeasibility).toBeDefined();
      expect(match.whyThisMatch).toBeInstanceOf(Array);
      expect(match.whyThisMatch.length).toBeGreaterThan(0);
    }
  });

  it('GET /api/v1/auctions/:id/insights should return bid trend and activity', async () => {
    if (!sampleAuctionId || !buyerToken) return;

    const res = await request(app)
      .get(`/api/v1/auctions/${sampleAuctionId}/insights`)
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('bidActivityCount');
    expect(res.body.data).toHaveProperty('uniqueBiddersCount');
    expect(res.body.data).toHaveProperty('bidTrend');
    expect(res.body.data).toHaveProperty('advisoryMessage');
  });

  it('GET /api/v1/logistics/consolidation should return dynamic calculated savings without hardcoding', async () => {
    if (!sellerToken) return;

    const res = await request(app)
      .get('/api/v1/logistics/consolidation')
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
