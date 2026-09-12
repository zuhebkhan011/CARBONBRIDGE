import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.js';

describe('AI Matchmaker & Intelligence Integration Suite', () => {
  let buyerToken: string;
  let sellerToken: string;
  let buyerCompanyId: string;
  let sellerCompanyId: string;
  let buyerRequirementId: string;
  let activeListingId: string;

  beforeAll(async () => {
    // 1. Authenticate buyer
    const buyerLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'buyer.synfuels@ahmedabad.com',
      password: 'CarbonBridge2026!',
    });
    expect(buyerLogin.status).toBe(200);
    buyerToken = buyerLogin.body.data.tokens.accessToken;
    buyerCompanyId = buyerLogin.body.data.user.companyId;

    // 2. Authenticate seller
    const sellerLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'seller.a@ultratech.com',
      password: 'CarbonBridge2026!',
    });
    expect(sellerLogin.status).toBe(200);
    sellerToken = sellerLogin.body.data.tokens.accessToken;
    sellerCompanyId = sellerLogin.body.data.user.companyId;

    // 3. Find or create a requirement
    let requirement = await prisma.requirement.findFirst({
      where: { status: 'OPEN' },
    });

    if (!requirement) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      requirement = await prisma.requirement.create({
        data: {
          buyerId: buyerCompanyId,
          targetQuantity: 150,
          minPurity: 98.0,
          budgetCeilingPerTon: 4000,
          deliveryAddress: 'Ahmedabad, Gujarat',
          deliveryLat: 23.0225,
          deliveryLng: 72.5714,
          intendedApplication: 'SYNFUEL',
          requiredDeliveryDate: futureDate,
          status: 'OPEN',
        },
      });
    }
    buyerRequirementId = requirement.id;

    // 4. Find active listing
    const listing = await prisma.listing.findFirst({
      where: { status: 'ACTIVE' },
    });
    expect(listing).toBeDefined();
    activeListingId = listing!.id;
  });

  describe('1. Security & Authentication', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/v1/ai/match')
        .send({ requirementId: buyerRequirementId });
      expect(res.status).toBe(401);
    });

    it('rejects unauthorized seller role with 403 for matching endpoint', async () => {
      const res = await request(app)
        .post('/api/v1/ai/match')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({ requirementId: buyerRequirementId });
      expect(res.status).toBe(403);
    });
  });

  describe('2. AI Matching & 7-Factor Evaluation', () => {
    it('computes 7-factor match scores and rankings for buyer requirement', async () => {
      const res = await request(app)
        .post('/api/v1/ai/match')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ requirementId: buyerRequirementId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data).toHaveProperty('matches');
      expect(data).toHaveProperty('multiSupplierPlans');
      expect(data).toHaveProperty('evaluatedSupplyCount');
      expect(data.evaluatedSupplyCount).toBeGreaterThan(0);

      if (data.matches.length > 0) {
        const topMatch = data.matches[0];
        expect(topMatch).toHaveProperty('matchScore');
        expect(topMatch.matchScore).toBeGreaterThanOrEqual(0);
        expect(topMatch.matchScore).toBeLessThanOrEqual(100);

        // Verify 7-factor breakdown exists
        expect(topMatch.scoreBreakdown).toBeDefined();
        expect(topMatch.scoreBreakdown).toHaveProperty('quantity');
        expect(topMatch.scoreBreakdown).toHaveProperty('purity');
        expect(topMatch.scoreBreakdown).toHaveProperty('price');
        expect(topMatch.scoreBreakdown).toHaveProperty('distance');
        expect(topMatch.scoreBreakdown).toHaveProperty('availability');
        expect(topMatch.scoreBreakdown).toHaveProperty('certificate');
        expect(topMatch.scoreBreakdown).toHaveProperty('useCompatibility');

        // Verify reasons and explanations
        expect(topMatch.reasons).toBeInstanceOf(Array);
        expect(topMatch.reasons.length).toBeGreaterThan(0);
        expect(topMatch.recommendation).toBeDefined();
      }
    });

    it('filters out supply that fails minimum purity hard constraint', async () => {
      // Create high-purity requirement (99.9%)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 20);

      const ultraPurityReq = await prisma.requirement.create({
        data: {
          buyerId: buyerCompanyId,
          targetQuantity: 50,
          minPurity: 99.9, // Very high
          budgetCeilingPerTon: 5000,
          deliveryAddress: 'Mumbai, Maharashtra',
          deliveryLat: 19.076,
          deliveryLng: 72.8777,
          intendedApplication: 'BEVERAGE_FOOD_GRADE',
          requiredDeliveryDate: futureDate,
          status: 'OPEN',
        },
      });

      const res = await request(app)
        .post('/api/v1/ai/match')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ requirementId: ultraPurityReq.id });

      expect(res.status).toBe(200);
      const data = res.body.data;

      // Any matches returned must strictly satisfy minPurity
      for (const m of data.matches) {
        expect(Number(m.purityPercentage)).toBeGreaterThanOrEqual(99.9);
      }

      // Cleanup test requirement
      await prisma.requirement.delete({ where: { id: ultraPurityReq.id } });
    });

    it('generates multi-supplier pooling plans when requirement volume is high', async () => {
      // Create large requirement (500 tonnes)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const largeReq = await prisma.requirement.create({
        data: {
          buyerId: buyerCompanyId,
          targetQuantity: 500,
          minPurity: 85.0,
          budgetCeilingPerTon: 5000,
          deliveryAddress: 'Surat, Gujarat',
          deliveryLat: 21.1702,
          deliveryLng: 72.8311,
          intendedApplication: 'CONCRETE_CURING',
          requiredDeliveryDate: futureDate,
          status: 'OPEN',
        },
      });

      const res = await request(app)
        .post('/api/v1/ai/match')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ requirementId: largeReq.id });

      expect(res.status).toBe(200);
      const data = res.body.data;

      // Multi-supplier plans should combine batches
      if (data.multiSupplierPlans.length > 0) {
        const plan = data.multiSupplierPlans[0];
        expect(plan.suppliers.length).toBeGreaterThanOrEqual(1);
        expect(plan.totalQuantity).toBeGreaterThan(0);
        expect(plan.averageLandedCostPerTon).toBeGreaterThan(0);
        expect(plan.averagePurity).toBeGreaterThanOrEqual(85.0);
        expect(plan.explanation).toBeDefined();
      }

      // Cleanup
      await prisma.requirement.delete({ where: { id: largeReq.id } });
    });
  });

  describe('3. Natural Language Requirement Parsing (AI + Fallback)', () => {
    it('parses structured fields from English requirement prompt', async () => {
      const res = await request(app)
        .post('/api/v1/ai/parse-requirement')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          text: 'Need 120 tonnes of 98.5% pure CO2 in Ahmedabad for synfuels before next month, budget under 3200 per ton.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const parsed = res.body.data;
      expect(parsed.quantityTonnes).toBe(120);
      expect(parsed.minimumPurity).toBe(98.5);
      expect(parsed.maxPricePerTonne).toBe(3200);
      expect(parsed.location).toMatch(/Ahmedabad/i);
      expect(parsed.intendedUse).toMatch(/SYNFUEL/i);
    });

    it('parses structured fields from Hindi/Hinglish requirement prompt', async () => {
      const res = await request(app)
        .post('/api/v1/ai/parse-requirement')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          prompt: 'Humein Pune me 75 tonnes CO2 chahiye 97% purity wali concrete curing ke liye, budget 2500 per tonne hai',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const parsed = res.body.data;
      expect(parsed.quantityTonnes).toBe(75);
      expect(parsed.minimumPurity).toBe(97);
      expect(parsed.city).toBe('Pune');
      expect(parsed.state).toBe('Maharashtra');
      expect(parsed.location).toMatch(/Pune/i);
      expect(parsed.maxPricePerTonne).toBe(2500);
      expect(['CONSTRUCTION', 'CONCRETE_CURING']).toContain(parsed.intendedUse);
    });

    it('parses Rajkot with Gujarat state, budget, and exact date (30 September 2026)', async () => {
      const res = await request(app)
        .post('/api/v1/ai/parse-requirement')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          text: 'Mujhe Rajkot mein 300 tonne CO2 chahiye, minimum purity 90%, budget ₹2500 per tonne, delivery 30 September 2026 tak.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const parsed = res.body.data;
      expect(parsed.quantityTonnes).toBe(300);
      expect(parsed.minimumPurity).toBe(90);
      expect(parsed.city).toBe('Rajkot');
      expect(parsed.state).toBe('Gujarat');
      expect(parsed.maxPricePerTonne).toBe(2500);
      expect(parsed.requiredDate).toBe('2026-09-30');
    });

    it('resolves Bangalore to Bengaluru with Karnataka and parses 15 October 2026', async () => {
      const res = await request(app)
        .post('/api/v1/ai/parse-requirement')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          text: 'Need 200 tonnes CO2 in Bangalore by 15 October 2026.',
        });

      expect(res.status).toBe(200);
      const parsed = res.body.data;
      expect(parsed.quantityTonnes).toBe(200);
      expect(parsed.city).toBe('Bengaluru');
      expect(parsed.state).toBe('Karnataka');
      expect(parsed.requiredDate).toBe('2026-10-15');
    });

    it('returns null for requiredDate when vague timeline like "next month" is provided without fabricating', async () => {
      const res = await request(app)
        .post('/api/v1/ai/parse-requirement')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          text: 'Need 200 tonnes CO2 in Pune next month.',
        });

      expect(res.status).toBe(200);
      const parsed = res.body.data;
      expect(parsed.city).toBe('Pune');
      expect(parsed.state).toBe('Maharashtra');
      expect(parsed.requiredDate).toBeNull();
    });
  });

  describe('4. AI Price Intelligence & Prototype Error Band', () => {
    it('returns validation MAE error band without fabricated confidence score', async () => {
      const res = await request(app)
        .get(`/api/v1/ai/pricing/ml/${activeListingId}`)
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(res.status).toBe(200);
      const data = res.body.data;

      // Must have predicted price
      expect(data.predictedPricePerTonne).toBeGreaterThan(0);

      // Must have error band explicitly labeled
      expect(data.errorBand).toBeDefined();
      expect(data.errorBand.label).toBe('Prototype error band based on validation MAE');
      expect(data.errorBand.note).toContain('not a statistically valid confidence interval');
      expect(data.errorBand.min).toBeLessThanOrEqual(data.predictedPricePerTonne);
      expect(data.errorBand.max).toBeGreaterThanOrEqual(data.predictedPricePerTonne);

      // Provenance must clearly state synthetic validation data
      expect(data.provenance).toContain('synthetic');

      // Confidence score must NOT be fabricated (null)
      expect(data.confidence).toBeNull();

      // Explanatory bullets must be present
      expect(data.whyBullets).toBeInstanceOf(Array);
      expect(data.whyBullets.length).toBeGreaterThan(0);
    });
  });

  describe('5. Inventory Safety & Atomic Integrity', () => {
    it('ensures creating a listing NEVER reduces batch availableQuantity', async () => {
      // 1. Create a fresh test batch with 100 tonnes
      const batchRes = await request(app)
        .post('/api/v1/batches')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          batchNumber: `CB-AI-TEST-${Date.now()}`,
          capturedQuantity: 100,
          purityPercentage: 92,
          storagePressureBar: 20,
          storageTemperatureC: -20,
          locationLat: 21.6264,
          locationLng: 73.0033,
        });
      expect(batchRes.status).toBe(201);
      const batchId = batchRes.body.data.id;

      const initialAvailable = Number(batchRes.body.data.availableQuantity);
      const initialAllocated = Number(batchRes.body.data.allocatedQuantity);
      expect(initialAvailable).toBe(100);
      expect(initialAllocated).toBe(0);

      // 2. Create a 40 tonne listing against this batch
      const listingRes = await request(app)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${sellerToken}`)
        .send({
          batchId,
          sellingMethod: 'FIXED_PRICE',
          quantity: 40,
          pricePerTon: 2800,
        });
      expect(listingRes.status).toBe(201);
      const createdListing = listingRes.body.data;

      // 3. Re-query the batch directly from the database
      const refreshedBatch = await prisma.batch.findUnique({
        where: { id: batchId },
      });

      // Crucial invariant: Creating a listing MUST NEVER reduce batch availableQuantity!
      expect(Number(refreshedBatch!.availableQuantity)).toBe(100);
      expect(Number(refreshedBatch!.allocatedQuantity)).toBe(0);

      // Clean up
      await prisma.listing.delete({ where: { id: createdListing.id } });
      await prisma.batch.delete({ where: { id: batchId } });
    });
  });
});
