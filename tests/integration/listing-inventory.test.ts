import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.js';
import { AuctionsService } from '../../src/modules/auctions/auctions.service.js';

describe('Strict Batch Inventory Invariant & Listing Isolation Test Suite', () => {
  let sellerToken: string;
  let buyerToken: string;
  let sellerUserId: string;
  let sellerCompanyId: string;
  let buyerCompanyId: string;

  beforeAll(async () => {
    // Authenticate Seller A
    const sellerLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'seller.a@ultratech.com',
      password: 'CarbonBridge2026!',
    });
    expect(sellerLogin.status).toBe(200);
    sellerToken = sellerLogin.body.data.tokens.accessToken;
    sellerUserId = sellerLogin.body.data.user.id;
    sellerCompanyId = sellerLogin.body.data.user.companyId;

    // Authenticate Buyer
    const buyerLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'buyer.synfuels@ahmedabad.com',
      password: 'CarbonBridge2026!',
    });
    expect(buyerLogin.status).toBe(200);
    buyerToken = buyerLogin.body.data.tokens.accessToken;
    buyerCompanyId = buyerLogin.body.data.user.companyId;
  });

  it('Test 1: Create 500T batch. Create 200T fixed-price listing -> Expected: Available = 500T', async () => {
    const batchNumber = `CB-TEST-INV-1-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 500,
        purityPercentage: 88,
        storagePressureBar: 18,
        storageTemperatureC: -22,
        locationLat: 21.6264,
        locationLng: 73.0033,
      });
    expect(batchRes.status).toBe(201);
    const batchId = batchRes.body.data.id;

    // Create 200T fixed-price listing
    const listingRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchId,
        sellingMethod: 'FIXED_PRICE',
        pricePerTon: 2450,
        quantity: 200,
      });
    expect(listingRes.status).toBe(201);
    expect(Number(listingRes.body.data.quantity)).toBe(200);

    // Verify batch inventory is NOT allocated/consumed: Available = 500T
    const checkBatch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
    expect(checkBatch.capturedQuantity.toNumber()).toBe(500);
    expect(checkBatch.allocatedQuantity.toNumber()).toBe(0);
    expect(checkBatch.availableQuantity.toNumber()).toBe(500);
  });

  it('Test 2: Create 500T batch. Create 200T auction -> Expected: Available = 500T', async () => {
    const batchNumber = `CB-TEST-INV-2-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 500,
        purityPercentage: 85,
        storagePressureBar: 18,
        storageTemperatureC: -22,
        locationLat: 21.6264,
        locationLng: 73.0033,
      });
    expect(batchRes.status).toBe(201);
    const batchId = batchRes.body.data.id;

    // Create 200T auction listing
    const listingRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchId,
        sellingMethod: 'AUCTION',
        quantity: 200,
      });
    expect(listingRes.status).toBe(201);
    const listingId = listingRes.body.data.id;

    // Create Auction
    const auctionRes = await request(app)
      .post('/api/v1/auctions')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        listingId,
        baseReservePrice: 2300,
        minBidIncrement: 50,
        closingTime: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(auctionRes.status).toBe(201);

    // Verify batch inventory is NOT consumed: Available = 500T
    const checkBatch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
    expect(checkBatch.capturedQuantity.toNumber()).toBe(500);
    expect(checkBatch.allocatedQuantity.toNumber()).toBe(0);
    expect(checkBatch.availableQuantity.toNumber()).toBe(500);
  });

  it('Test 3: 500T batch. 200T fixed-price listing. Buyer procures 200T -> Expected: Allocated = 200T, Available = 300T', async () => {
    const batchNumber = `CB-TEST-INV-3-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 500,
        purityPercentage: 82,
        storagePressureBar: 18,
        storageTemperatureC: -22,
        locationLat: 21.6264,
        locationLng: 73.0033,
      });
    const batchId = batchRes.body.data.id;

    // Create 200T listing
    const listingRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchId,
        sellingMethod: 'FIXED_PRICE',
        pricePerTon: 2400,
        quantity: 200,
      });
    const listingId = listingRes.body.data.id;

    // Buyer procures 200T
    const procureRes = await request(app)
      .post('/api/v1/orders/procure-fixed')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        listingId,
        quantity: 200,
        deliveryLat: 23.0225,
        deliveryLng: 72.5714,
        deliveryAddress: 'Sanand Industrial Estate, Ahmedabad, Gujarat',
      });
    expect(procureRes.status).toBe(201);

    // Verify Invariant: Available = Captured - Allocated
    const checkBatch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
    expect(checkBatch.capturedQuantity.toNumber()).toBe(500);
    expect(checkBatch.allocatedQuantity.toNumber()).toBe(200);
    expect(checkBatch.availableQuantity.toNumber()).toBe(300);
  });

  it('Test 4: 500T batch. 200T auction expires without winner -> Expected: Available = 500T', async () => {
    const batchNumber = `CB-TEST-INV-4-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 500,
        purityPercentage: 80,
        storagePressureBar: 18,
        storageTemperatureC: -22,
        locationLat: 21.6264,
        locationLng: 73.0033,
      });
    const batchId = batchRes.body.data.id;

    const listingRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchId,
        sellingMethod: 'AUCTION',
        quantity: 200,
      });
    const listingId = listingRes.body.data.id;

    const auctionRes = await request(app)
      .post('/api/v1/auctions')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        listingId,
        baseReservePrice: 2250,
        minBidIncrement: 50,
        closingTime: new Date(Date.now() + 1000).toISOString(),
      });
    const auctionId = auctionRes.body.data.id;

    // Finalize auction with 0 bids
    const finalizeRes = await AuctionsService.finalizeAuction(auctionId, sellerCompanyId, sellerUserId, {
      deliveryLat: 20.5937,
      deliveryLng: 78.9629,
      deliveryAddress: 'Default Terminal, India',
    });
    expect(finalizeRes.status).toBe('EXPIRED');
    expect(finalizeRes.order).toBeNull();

    // Verify batch inventory remains untouched: Available = 500T
    const checkBatch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
    expect(checkBatch.capturedQuantity.toNumber()).toBe(500);
    expect(checkBatch.allocatedQuantity.toNumber()).toBe(0);
    expect(checkBatch.availableQuantity.toNumber()).toBe(500);
  });

  it('Test 5: 500T batch. Create multiple listings -> Ensure listing creation itself never consumes inventory', async () => {
    const batchNumber = `CB-TEST-INV-5-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 500,
        purityPercentage: 91,
        storagePressureBar: 18,
        storageTemperatureC: -22,
        locationLat: 21.6264,
        locationLng: 73.0033,
      });
    const batchId = batchRes.body.data.id;

    // Listing A = 200T
    const listARes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchId,
        sellingMethod: 'FIXED_PRICE',
        pricePerTon: 2400,
        quantity: 200,
      });
    expect(listARes.status).toBe(201);

    // Listing B = 100T
    const listBRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchId,
        sellingMethod: 'FIXED_PRICE',
        pricePerTon: 2450,
        quantity: 100,
      });
    expect(listBRes.status).toBe(201);

    // Both listings created against same batch. Batch Available MUST remain 500T!
    const checkBatch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
    expect(checkBatch.capturedQuantity.toNumber()).toBe(500);
    expect(checkBatch.allocatedQuantity.toNumber()).toBe(0);
    expect(checkBatch.availableQuantity.toNumber()).toBe(500);
  });

  it('Test 6: Attempt procurement greater than available quantity -> Expected: OVER_ALLOCATION, never negative', async () => {
    const batchNumber = `CB-TEST-INV-6-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 100,
        purityPercentage: 75,
        storagePressureBar: 18,
        storageTemperatureC: -22,
        locationLat: 21.6264,
        locationLng: 73.0033,
      });
    const batchId = batchRes.body.data.id;

    const listRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchId,
        sellingMethod: 'FIXED_PRICE',
        pricePerTon: 2200,
        quantity: 100,
      });
    const listingId = listRes.body.data.id;

    // Attempt procurement of 150T (greater than 100T available)
    const overProcureRes = await request(app)
      .post('/api/v1/orders/procure-fixed')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        listingId,
        quantity: 150,
        deliveryLat: 23.0225,
        deliveryLng: 72.5714,
        deliveryAddress: 'Sanand Industrial Estate, Ahmedabad, Gujarat',
      });
    expect([400, 409, 422]).toContain(overProcureRes.status);
    expect(overProcureRes.body.success).toBe(false);
    expect(['BATCH_OVER_ALLOCATION', 'INSUFFICIENT_BATCH_STOCK']).toContain(overProcureRes.body.error?.code);

    // Verify Available is unchanged and NOT negative
    const checkBatch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
    expect(checkBatch.availableQuantity.toNumber()).toBe(100);
    expect(checkBatch.allocatedQuantity.toNumber()).toBe(0);
    expect(checkBatch.availableQuantity.toNumber()).toBeGreaterThanOrEqual(0);
  });
});
