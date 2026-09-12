import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';

describe('CarbonBridge Core REST API Integration Test Suite', () => {
  it('GET /health - should return 200 OK and healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.service).toBe('carbonbridge-backend');
  });

  it('GET /api/docs.json - should return valid OpenAPI 3.0 specification', async () => {
    const res = await request(app).get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.info.title).toBe('CarbonBridge REST API');
    expect(res.body.paths).toHaveProperty('/health');
    expect(res.body.paths).toHaveProperty('/api/v1/orders/procure-fixed');
    expect(res.body.paths).toHaveProperty('/api/v1/orders/procure-composite');
  });

  it('GET /unknown-route - should return 404 with structured error response', async () => {
    const res = await request(app).get('/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body).toHaveProperty('requestId');
  });

  it('POST /api/v1/auth/login - should return 400 on malformed input', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'not-an-email',
      // missing password
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeInstanceOf(Array);
  });

  it('GET /api/v1/batches - without Bearer token should return 401 Unauthorized', async () => {
    const res = await request(app).get('/api/v1/batches');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/v1/batches - authenticated seller should return batch with purityPercentage', async () => {
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'seller.a@ultratech.com',
      password: 'CarbonBridge2026!',
    });

    expect(loginRes.status).toBe(200);
    const token = loginRes.body.data.tokens.accessToken;
    const batchesRes = await request(app)
      .get('/api/v1/batches')
      .set('Authorization', `Bearer ${token}`);

    expect(batchesRes.status).toBe(200);
      expect(batchesRes.body.success).toBe(true);
      expect(Array.isArray(batchesRes.body.data)).toBe(true);
      if (batchesRes.body.data.length > 0) {
        const batch = batchesRes.body.data[0];
        expect(batch).toHaveProperty('purityPercentage');
        expect(Number(batch.purityPercentage)).toBeGreaterThanOrEqual(50);
      }
  });

  it('Seller Flow: Register Batch -> Create Listing -> Validate Auction Closing Time', async () => {
    // 1. Seller Login
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'seller.a@ultratech.com',
      password: 'CarbonBridge2026!',
    });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.data.tokens.accessToken;

    // 2. Register Batch
    const uniqueBatchNumber = `CB-TEST-${Date.now()}`;
    const createBatchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchNumber: uniqueBatchNumber,
        capturedQuantity: 500,
        purityPercentage: 99.2,
        storagePressureBar: 15,
        storageTemperatureC: 25,
        locationLat: 19.0760,
        locationLng: 72.8777,
      });

    expect(createBatchRes.status).toBe(201);
    expect(createBatchRes.body.success).toBe(true);
    const createdBatch = createBatchRes.body.data;
    expect(createdBatch.batchNumber).toBe(uniqueBatchNumber);
    expect(Number(createdBatch.availableQuantity)).toBe(500);

    // 3. Create Listing for Auction
    const listingRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId: createdBatch.id,
        sellingMethod: 'AUCTION',
      });
    expect(listingRes.status).toBe(201);
    const listing = listingRes.body.data;

    // 4. Past closing date -> MUST be rejected by server validation
    const pastClosingTime = new Date(Date.now() - 3600000).toISOString();
    const pastAuctionRes = await request(app)
      .post('/api/v1/auctions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        listingId: listing.id,
        baseReservePrice: 2500,
        minBidIncrement: 50,
        closingTime: pastClosingTime,
      });

    expect(pastAuctionRes.status).toBe(400);
    expect(pastAuctionRes.body.success).toBe(false);
    expect(JSON.stringify(pastAuctionRes.body)).toContain('Auction closing time must be in the future.');

    // 5. Future closing date -> MUST be accepted and auction created
    const futureClosingTime = new Date(Date.now() + 86400000 * 3).toISOString(); // 3 days in future
    const validAuctionRes = await request(app)
      .post('/api/v1/auctions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        listingId: listing.id,
        baseReservePrice: 2500,
        minBidIncrement: 50,
        closingTime: futureClosingTime,
      });

    expect(validAuctionRes.status).toBe(201);
    expect(validAuctionRes.body.success).toBe(true);
    expect(validAuctionRes.body.data).toHaveProperty('id');
    expect(validAuctionRes.body.data.status).toBe('OPEN');

    // 6. Auctions list includes the newly created auction for seller
    const auctionsRes = await request(app)
      .get('/api/v1/auctions')
      .set('Authorization', `Bearer ${token}`);
    expect(auctionsRes.status).toBe(200);
    expect(auctionsRes.body.success).toBe(true);
    const auctionIds = auctionsRes.body.data.map((a: any) => a.id);
    expect(auctionIds).toContain(validAuctionRes.body.data.id);

    // 7. Cleanup ephemeral test artifacts so test runs do not pollute database
    await request(app)
      .delete(`/api/v1/auctions/${validAuctionRes.body.data.id}`)
      .catch(() => {});
    const { prisma } = await import('../../src/database/prisma.js');
    await prisma.auction.deleteMany({ where: { id: validAuctionRes.body.data.id } }).catch(() => {});
    await prisma.listing.deleteMany({ where: { id: listing.id } }).catch(() => {});
    await prisma.batch.deleteMany({ where: { id: createdBatch.id } }).catch(() => {});
  });
});


