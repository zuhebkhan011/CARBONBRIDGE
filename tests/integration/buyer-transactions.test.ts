import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.js';
import { AuctionsService } from '../../src/modules/auctions/auctions.service.js';

describe('Buyer Purchase & Auction Bidding Complete Transaction Suite', () => {
  let sellerToken: string;
  let buyerToken: string;
  let buyer2Token: string;
  let sellerUserId: string;
  let sellerCompanyId: string;
  let buyerCompanyId: string;
  let buyer2CompanyId: string;

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

    // Authenticate Buyer 1
    const buyerLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'buyer.synfuels@ahmedabad.com',
      password: 'CarbonBridge2026!',
    });
    expect(buyerLogin.status).toBe(200);
    buyerToken = buyerLogin.body.data.tokens.accessToken;
    buyerCompanyId = buyerLogin.body.data.user.companyId;

    // Register Buyer 2 dynamically (for concurrent bidding/procurement tests)
    const buyer2Reg = await request(app).post('/api/v1/auth/register').send({
      email: `buyer2.${Date.now()}@surat.com`,
      password: 'CarbonBridge2026!',
      fullName: 'Rahul Sharma (Buyer 2)',
      role: 'BUYER',
      company: {
        name: `GreenAgg Surat Offtaker ${Date.now()}`,
        companyType: 'OFFTAKER',
        registrationNumber: `CIN-BUYER-${Date.now()}`,
        latitude: 21.1702,
        longitude: 72.8311,
        address: 'Hazira Manufacturing Hub, Surat, Gujarat, India',
      },
    });
    expect(buyer2Reg.status).toBe(201);
    buyer2Token = buyer2Reg.body.data.tokens.accessToken;
    buyer2CompanyId = buyer2Reg.body.data.company.id;
  });

  // =========================================================================
  // FIXED PRICE PURCHASE TESTS (1 - 6)
  // =========================================================================

  it('1. Valid fixed price purchase succeeds with full delivery details', async () => {
    const batchNumber = `CB-FP-1-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 500,
        purityPercentage: 92,
        storagePressureBar: 18,
        storageTemperatureC: -22,
        locationLat: 21.6264,
        locationLng: 73.0033,
      });
    expect(batchRes.status).toBe(201);
    const batchId = batchRes.body.data.id;

    const listingRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchId,
        sellingMethod: 'FIXED_PRICE',
        pricePerTon: 2400,
        quantity: 200,
      });
    expect(listingRes.status).toBe(201);
    const listingId = listingRes.body.data.id;

    // Buyer purchases 100T
    const procureRes = await request(app)
      .post('/api/v1/orders/procure-fixed')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        listingId,
        quantity: 100,
        deliveryAddress: 'Sanand Industrial Estate, Ahmedabad, Gujarat',
        deliveryLat: 23.0225,
        deliveryLng: 72.5714,
      });

    expect(procureRes.status).toBe(201);
    expect(procureRes.body.success).toBe(true);
    expect(procureRes.body.data).toHaveProperty('order');
    expect(procureRes.body.data.order).toHaveProperty('id');
    expect(Number(procureRes.body.data.order.totalQuantity)).toBe(100);
    expect(Number(procureRes.body.data.order.totalPrice)).toBe(240000); // 100 * 2400
  });

  it('2. Invalid/empty/negative quantity fails correctly', async () => {
    const batchNumber = `CB-FP-2-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 200,
        purityPercentage: 85,
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
        sellingMethod: 'FIXED_PRICE',
        pricePerTon: 2500,
        quantity: 100,
      });
    const listingId = listingRes.body.data.id;

    // Zero quantity
    const zeroRes = await request(app)
      .post('/api/v1/orders/procure-fixed')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        listingId,
        quantity: 0,
        deliveryAddress: 'Sanand Industrial Estate, Ahmedabad, Gujarat',
        deliveryLat: 23.0225,
        deliveryLng: 72.5714,
      });
    expect([400, 422]).toContain(zeroRes.status);
    expect(zeroRes.body.success).toBe(false);

    // Negative quantity
    const negRes = await request(app)
      .post('/api/v1/orders/procure-fixed')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        listingId,
        quantity: -50,
        deliveryAddress: 'Sanand Industrial Estate, Ahmedabad, Gujarat',
        deliveryLat: 23.0225,
        deliveryLng: 72.5714,
      });
    expect([400, 422]).toContain(negRes.status);
    expect(negRes.body.success).toBe(false);
  });

  it('3. Quantity > available stock fails with error', async () => {
    const batchNumber = `CB-FP-3-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 300,
        purityPercentage: 90,
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
        sellingMethod: 'FIXED_PRICE',
        pricePerTon: 2350,
        quantity: 150,
      });
    const listingId = listingRes.body.data.id;

    // Buyer requests 250T (exceeds 150T listing)
    const overRes = await request(app)
      .post('/api/v1/orders/procure-fixed')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        listingId,
        quantity: 250,
        deliveryAddress: 'Sanand Industrial Estate, Ahmedabad, Gujarat',
        deliveryLat: 23.0225,
        deliveryLng: 72.5714,
      });
    expect([400, 409, 422]).toContain(overRes.status);
    expect(overRes.body.success).toBe(false);
  });

  it('4. Purchase reduces allocated quantity correctly: Available = Captured - Allocated', async () => {
    const batchNumber = `CB-FP-4-${Date.now()}`;
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

    const listingRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchId,
        sellingMethod: 'FIXED_PRICE',
        pricePerTon: 2450,
        quantity: 200,
      });
    const listingId = listingRes.body.data.id;

    // Initial state check
    const initialBatch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
    expect(initialBatch.capturedQuantity.toNumber()).toBe(500);
    expect(initialBatch.allocatedQuantity.toNumber()).toBe(0);
    expect(initialBatch.availableQuantity.toNumber()).toBe(500);

    // Buyer purchases 100T
    const res = await request(app)
      .post('/api/v1/orders/procure-fixed')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        listingId,
        quantity: 100,
        deliveryAddress: 'Sanand Industrial Estate, Ahmedabad, Gujarat',
        deliveryLat: 23.0225,
        deliveryLng: 72.5714,
      });
    expect(res.status).toBe(201);

    // Post-purchase invariant check: Captured=500, Allocated=100, Available=400
    const updatedBatch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
    expect(updatedBatch.capturedQuantity.toNumber()).toBe(500);
    expect(updatedBatch.allocatedQuantity.toNumber()).toBe(100);
    expect(updatedBatch.availableQuantity.toNumber()).toBe(400);

    // Remaining listing quantity is 100
    const updatedListing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(updatedListing.quantity.toNumber()).toBe(100);
  });

  it('5. Listing creation does not reduce stock', async () => {
    const batchNumber = `CB-FP-5-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 600,
        purityPercentage: 88,
        storagePressureBar: 18,
        storageTemperatureC: -22,
        locationLat: 21.6264,
        locationLng: 73.0033,
      });
    const batchId = batchRes.body.data.id;

    // Create 300T listing
    await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchId,
        sellingMethod: 'FIXED_PRICE',
        pricePerTon: 2400,
        quantity: 300,
      });

    // Verify stock is untouched
    const checkBatch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
    expect(checkBatch.capturedQuantity.toNumber()).toBe(600);
    expect(checkBatch.allocatedQuantity.toNumber()).toBe(0);
    expect(checkBatch.availableQuantity.toNumber()).toBe(600);
  });

  it('6. Two concurrent purchases cannot over-allocate', async () => {
    const batchNumber = `CB-FP-6-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 150,
        purityPercentage: 90,
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
        sellingMethod: 'FIXED_PRICE',
        pricePerTon: 2400,
        quantity: 150,
      });
    const listingId = listingRes.body.data.id;

    // Both buyers try to buy 100T concurrently (total 200T > 150T available)
    const [p1, p2] = await Promise.allSettled([
      request(app)
        .post('/api/v1/orders/procure-fixed')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({
          listingId,
          quantity: 100,
          deliveryAddress: 'Sanand Industrial Estate, Ahmedabad, Gujarat',
          deliveryLat: 23.0225,
          deliveryLng: 72.5714,
        }),
      request(app)
        .post('/api/v1/orders/procure-fixed')
        .set('Authorization', `Bearer ${buyer2Token}`)
        .send({
          listingId,
          quantity: 100,
          deliveryAddress: 'Hazira Manufacturing Hub, Surat, Gujarat',
          deliveryLat: 21.1702,
          deliveryLng: 72.8311,
        }),
    ]);

    const results = [
      p1.status === 'fulfilled' ? p1.value.status : 500,
      p2.status === 'fulfilled' ? p2.value.status : 500,
    ];

    // Exactly one should succeed (201), the other should fail with 400 or 409
    const successCount = results.filter((s) => s === 201).length;
    expect(successCount).toBe(1);

    // Final batch inventory check: must NEVER be negative
    const finalBatch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
    expect(finalBatch.allocatedQuantity.toNumber()).toBe(100);
    expect(finalBatch.availableQuantity.toNumber()).toBe(50);
  });

  // =========================================================================
  // AUCTION BIDDING & FINALIZATION TESTS (7 - 14)
  // =========================================================================

  it('7. Valid bid succeeds and updates currentHighestBid', async () => {
    const batchNumber = `CB-AUC-7-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 400,
        purityPercentage: 94,
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
        baseReservePrice: 2500,
        minBidIncrement: 50,
        closingTime: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(auctionRes.status).toBe(201);
    const auctionId = auctionRes.body.data.id;

    // Buyer places opening bid of 2500
    const bidRes = await request(app)
      .post(`/api/v1/auctions/${auctionId}/bid`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ amountPerTon: 2500 });

    expect([200, 201]).toContain(bidRes.status);
    expect(bidRes.body.success).toBe(true);
    expect(Number(bidRes.body.data.amountPerTon)).toBe(2500);

    // Verify auction current highest bid updated in DB
    const checkAuction = await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } });
    expect(checkAuction.currentHighestBid.toNumber()).toBe(2500);
  });

  it('8. Bid below current highest or below min increment fails', async () => {
    const batchNumber = `CB-AUC-8-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 300,
        purityPercentage: 91,
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
        quantity: 150,
      });
    const listingId = listingRes.body.data.id;

    const auctionRes = await request(app)
      .post('/api/v1/auctions')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        listingId,
        baseReservePrice: 2500,
        minBidIncrement: 50,
        closingTime: new Date(Date.now() + 86400000).toISOString(),
      });
    const auctionId = auctionRes.body.data.id;

    // Place first bid of 2500
    await request(app)
      .post(`/api/v1/auctions/${auctionId}/bid`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ amountPerTon: 2500 });

    // Try bidding 2520 (less than 2500 + 50 = 2550) -> Must fail
    const lowBidRes = await request(app)
      .post(`/api/v1/auctions/${auctionId}/bid`)
      .set('Authorization', `Bearer ${buyer2Token}`)
      .send({ amountPerTon: 2520 });

    expect([400, 422]).toContain(lowBidRes.status);
    expect(lowBidRes.body.success).toBe(false);
    expect(lowBidRes.body.error?.code).toBe('BID_BELOW_MINIMUM');
  });

  it('9. Bid on expired auction fails with AUCTION_EXPIRED', async () => {
    const batchNumber = `CB-AUC-9-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 300,
        purityPercentage: 88,
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
        quantity: 100,
      });
    const listingId = listingRes.body.data.id;

    // Create auction with closing time in the past directly in DB
    const auction = await prisma.auction.create({
      data: {
        listingId,
        batchId,
        sellerId: sellerCompanyId,
        baseReservePrice: 2400,
        currentHighestBid: 2400,
        minBidIncrement: 50,
        closingTime: new Date(Date.now() - 60000), // expired 1 min ago
        status: 'OPEN',
      },
    });

    const expiredBidRes = await request(app)
      .post(`/api/v1/auctions/${auction.id}/bid`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ amountPerTon: 2600 });

    expect(expiredBidRes.status).toBe(400);
    expect(expiredBidRes.body.success).toBe(false);
    expect(expiredBidRes.body.error?.code).toBe('AUCTION_EXPIRED');
  });

  it('10. Buyer cannot bid on own auction (if seller)', async () => {
    const batchNumber = `CB-AUC-10-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 300,
        purityPercentage: 88,
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
        quantity: 100,
      });
    const listingId = listingRes.body.data.id;

    const auctionRes = await request(app)
      .post('/api/v1/auctions')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        listingId,
        baseReservePrice: 2400,
        minBidIncrement: 50,
        closingTime: new Date(Date.now() + 86400000).toISOString(),
      });
    const auctionId = auctionRes.body.data.id;

    // Seller tries to place bid on own auction
    const selfBidRes = await request(app)
      .post(`/api/v1/auctions/${auctionId}/bid`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ amountPerTon: 2500 });

    // Endpoint requires BUYER role, or if checked in service, rejects self-bidding
    expect([400, 403]).toContain(selfBidRes.status);
    expect(selfBidRes.body.success).toBe(false);
  });

  it('11. Creating auction does not reduce stock', async () => {
    const batchNumber = `CB-AUC-11-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 500,
        purityPercentage: 89,
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

    await request(app)
      .post('/api/v1/auctions')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        listingId,
        baseReservePrice: 2400,
        minBidIncrement: 50,
        closingTime: new Date(Date.now() + 86400000).toISOString(),
      });

    // Check batch stock is strictly untouched: Available = 500T
    const checkBatch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
    expect(checkBatch.capturedQuantity.toNumber()).toBe(500);
    expect(checkBatch.allocatedQuantity.toNumber()).toBe(0);
    expect(checkBatch.availableQuantity.toNumber()).toBe(500);
  });

  it('12. Placing bid does not reduce stock', async () => {
    const batchNumber = `CB-AUC-12-${Date.now()}`;
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
        baseReservePrice: 2400,
        minBidIncrement: 50,
        closingTime: new Date(Date.now() + 86400000).toISOString(),
      });
    const auctionId = auctionRes.body.data.id;

    // Buyer places bid of 2500
    await request(app)
      .post(`/api/v1/auctions/${auctionId}/bid`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ amountPerTon: 2500 });

    // Buyer 2 places bid of 2600
    await request(app)
      .post(`/api/v1/auctions/${auctionId}/bid`)
      .set('Authorization', `Bearer ${buyer2Token}`)
      .send({ amountPerTon: 2600 });

    // Stock must STILL be 500T available!
    const checkBatch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
    expect(checkBatch.capturedQuantity.toNumber()).toBe(500);
    expect(checkBatch.allocatedQuantity.toNumber()).toBe(0);
    expect(checkBatch.availableQuantity.toNumber()).toBe(500);
  });

  it('13. Auction finalization allocates only the winning quantity', async () => {
    const batchNumber = `CB-AUC-13-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 500,
        purityPercentage: 95,
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
        baseReservePrice: 2500,
        minBidIncrement: 50,
        closingTime: new Date(Date.now() + 86400000).toISOString(),
      });
    const auctionId = auctionRes.body.data.id;

    // Buyer places winning bid of 2750
    await request(app)
      .post(`/api/v1/auctions/${auctionId}/bid`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ amountPerTon: 2750 });

    // Seller finalizes auction
    const finalizeRes = await AuctionsService.finalizeAuction(auctionId, sellerCompanyId, sellerUserId, {
      deliveryAddress: 'Sanand Industrial Estate, Ahmedabad, Gujarat',
      deliveryLat: 23.0225,
      deliveryLng: 72.5714,
    });

    expect(finalizeRes.status).toBe('SETTLED');
    expect(finalizeRes.order).not.toBeNull();
    expect(Number(finalizeRes.order!.totalQuantity)).toBe(200);

    // Invariant: Available = Captured - Allocated = 500 - 200 = 300
    const checkBatch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
    expect(checkBatch.capturedQuantity.toNumber()).toBe(500);
    expect(checkBatch.allocatedQuantity.toNumber()).toBe(200);
    expect(checkBatch.availableQuantity.toNumber()).toBe(300);
  });

  it('14. Concurrent bid/finalization handling remains safe', async () => {
    const batchNumber = `CB-AUC-14-${Date.now()}`;
    const batchRes = await request(app)
      .post('/api/v1/batches')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        batchNumber,
        capturedQuantity: 400,
        purityPercentage: 92,
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
        quantity: 150,
      });
    const listingId = listingRes.body.data.id;

    const auctionRes = await request(app)
      .post('/api/v1/auctions')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        listingId,
        baseReservePrice: 2400,
        minBidIncrement: 50,
        closingTime: new Date(Date.now() + 86400000).toISOString(),
      });
    const auctionId = auctionRes.body.data.id;

    // Two buyers place the same bid (2600) concurrently
    const [b1, b2] = await Promise.allSettled([
      request(app)
        .post(`/api/v1/auctions/${auctionId}/bid`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ amountPerTon: 2600 }),
      request(app)
        .post(`/api/v1/auctions/${auctionId}/bid`)
        .set('Authorization', `Bearer ${buyer2Token}`)
        .send({ amountPerTon: 2600 }),
    ]);

    const statuses = [
      b1.status === 'fulfilled' ? b1.value.status : 500,
      b2.status === 'fulfilled' ? b2.value.status : 500,
    ];

    // Exactly one should succeed with 200/201, the other must fail with conflict (409) or bad request (400)
    const successBids = statuses.filter((s) => s === 200 || s === 201).length;
    expect(successBids).toBe(1);

    // Highest bid in DB is 2600
    const finalAuction = await prisma.auction.findUniqueOrThrow({ where: { id: auctionId } });
    expect(finalAuction.currentHighestBid.toNumber()).toBe(2600);
  });
});
